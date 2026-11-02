/**
 * A small client for the parts of the Google Drive v3 REST API that folder sync needs. Errors use the
 * same names the File System Access API throws, so the sync engine treats Drive like any folder:
 * an expired sign-in is a `NotAllowedError` (reconnect), a vanished file a `NotFoundError`.
 */

const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';

export const FOLDER_MIME = 'application/vnd.google-apps.folder';
const GOOGLE_APPS_MIME = 'application/vnd.google-apps.';

const ITEM_FIELDS = 'id,name,mimeType,size,createdTime,modifiedTime,md5Checksum';
const LIST_FIELDS = `nextPageToken,files(${ITEM_FIELDS})`;

export interface DriveItem {
  id: string;
  name: string;
  mimeType: string;
  /** Bytes, as a decimal string. Absent for folders and Google Docs. */
  size?: string;
  /** RFC 3339. */
  createdTime?: string;
  /** RFC 3339. */
  modifiedTime: string;
  md5Checksum?: string;
}

export interface DriveAccount {
  emailAddress: string;
  displayName?: string;
}

export const isFolder = (item: DriveItem) => item.mimeType === FOLDER_MIME;

/** Regular files with bytes to read: not folders, shortcuts or Google Docs, Sheets and the like. */
export const isBinaryFile = (item: DriveItem) => !item.mimeType.startsWith(GOOGLE_APPS_MIME);

export interface DriveClientOptions {
  fetch?: typeof fetch;
  /** The current access token, or null when the reader needs to sign in again. */
  token(): string | null;
  /** Called when Google rejects the token, so it isn't offered again. */
  onUnauthorized?(): void;
  /** Waits between retries; replaced in tests. */
  sleep?(ms: number): Promise<void>;
}

const RETRIES = 3;
const RETRYABLE_REASONS = new Set(['rateLimitExceeded', 'userRateLimitExceeded', 'backendError']);

/** A Drive query string literal: `'…'` with backslashes and quotes escaped. */
export function quote(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

function signedOut(): DOMException {
  return new DOMException('Sign in to Google Drive again to keep syncing.', 'NotAllowedError');
}

export class DriveClient {
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly options: DriveClientOptions) {
    this.fetchImpl = options.fetch ?? ((input, init) => fetch(input, init));
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  /** The signed-in account, shown when choosing a folder and used to skip Google's account chooser later. */
  async account(): Promise<DriveAccount> {
    const response = await this.request(`${API}/about?fields=user(emailAddress,displayName)`);
    const body = (await response.json()) as { user: DriveAccount };
    return body.user;
  }

  /**
   * Everything directly inside a folder, oldest first. Drive allows several entries with one name
   * (two devices may create `.scriptorium` at once); every device then settles on the oldest.
   */
  async children(folderId: string): Promise<DriveItem[]> {
    return oldestFirst(await this.list(`${quote(folderId)} in parents and trashed = false`, 'createdTime'));
  }

  /** Entries named exactly `name` in a folder, oldest first. */
  async childrenNamed(folderId: string, name: string): Promise<DriveItem[]> {
    const items = await this.list(
      `${quote(folderId)} in parents and name = ${quote(name)} and trashed = false`,
      'createdTime',
    );
    return oldestFirst(items.filter((item) => item.name === name));
  }

  /** The folders directly inside a folder (`root` is My Drive), by name. */
  folders(parentId: string): Promise<DriveItem[]> {
    return this.list(
      `${quote(parentId)} in parents and mimeType = ${quote(FOLDER_MIME)} and trashed = false`,
      'name',
    );
  }

  async download(id: string): Promise<ArrayBuffer> {
    const response = await this.request(
      `${API}/files/${encodeURIComponent(id)}?alt=media&supportsAllDrives=true`,
    );
    return response.arrayBuffer();
  }

  async createFolder(parentId: string, name: string): Promise<DriveItem> {
    const response = await this.request(`${API}/files?fields=${ITEM_FIELDS}&supportsAllDrives=true`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=UTF-8' },
      body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [parentId] }),
    });
    return (await response.json()) as DriveItem;
  }

  async createFile(parentId: string, name: string, mimeType: string, content: Blob): Promise<DriveItem> {
    const boundary = `scriptorium-${crypto.randomUUID()}`;
    const metadata = JSON.stringify({ name, mimeType, parents: [parentId] });
    const body = new Blob([
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`,
      `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
      content,
      `\r\n--${boundary}--`,
    ]);
    const response = await this.request(
      `${UPLOAD_API}/files?uploadType=multipart&fields=${ITEM_FIELDS}&supportsAllDrives=true`,
      { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body },
    );
    return (await response.json()) as DriveItem;
  }

  /** Replaces a file's contents. Drive swaps in the new revision whole, so readers never see half a file. */
  async updateFile(id: string, mimeType: string, content: Blob): Promise<DriveItem> {
    const response = await this.request(
      `${UPLOAD_API}/files/${encodeURIComponent(id)}?uploadType=media&fields=${ITEM_FIELDS}&supportsAllDrives=true`,
      { method: 'PATCH', headers: { 'Content-Type': mimeType }, body: content },
    );
    return (await response.json()) as DriveItem;
  }

  private async list(q: string, orderBy: string): Promise<DriveItem[]> {
    const items: DriveItem[] = [];
    let pageToken: string | undefined;
    do {
      const params = new URLSearchParams({
        q,
        orderBy,
        fields: LIST_FIELDS,
        pageSize: '1000',
        spaces: 'drive',
        supportsAllDrives: 'true',
        includeItemsFromAllDrives: 'true',
      });
      if (pageToken) params.set('pageToken', pageToken);
      const response = await this.request(`${API}/files?${params}`);
      const page = (await response.json()) as { files?: DriveItem[]; nextPageToken?: string };
      items.push(...(page.files ?? []));
      pageToken = page.nextPageToken;
    } while (pageToken);
    return items;
  }

  private async request(url: string, init: RequestInit = {}): Promise<Response> {
    for (let attempt = 0; ; attempt++) {
      const token = this.options.token();
      if (!token) throw signedOut();
      const headers = new Headers(init.headers);
      headers.set('Authorization', `Bearer ${token}`);
      const response = await this.fetchImpl(url, { ...init, headers });
      if (response.ok) return response;

      const reason = await errorReason(response);
      const retryable =
        response.status === 429 ||
        response.status >= 500 ||
        (response.status === 403 && RETRYABLE_REASONS.has(reason));
      if (retryable && attempt < RETRIES) {
        await this.sleep(2 ** attempt * 500 + Math.random() * 250);
        continue;
      }
      throw this.failure(response.status, reason);
    }
  }

  private failure(status: number, reason: string): Error {
    if (status === 401) {
      this.options.onUnauthorized?.();
      return signedOut();
    }
    if (status === 404)
      return new DOMException('That file or folder isn’t in Google Drive.', 'NotFoundError');
    if (status === 403) {
      if (reason === 'storageQuotaExceeded' || reason === 'quotaExceeded')
        return new DOMException('Google Drive is full.', 'QuotaExceededError');
      if (reason === 'insufficientFilePermissions' || reason === 'cannotAddParent')
        return new DOMException('This Google Drive folder is read-only.', 'NoModificationAllowedError');
      if (reason === 'insufficientPermissions' || reason === 'authError') return signedOut();
    }
    return new Error(`Google Drive request failed (${status}${reason ? `, ${reason}` : ''}).`);
  }
}

/** By creation time, then id, so ties come out the same everywhere. */
function oldestFirst(items: DriveItem[]): DriveItem[] {
  const key = (item: DriveItem) => item.createdTime ?? '';
  return items.sort((a, b) =>
    key(a) !== key(b) ? (key(a) < key(b) ? -1 : 1) : a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  );
}

async function errorReason(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { errors?: { reason?: string }[] } };
    return body.error?.errors?.[0]?.reason ?? '';
  } catch {
    return '';
  }
}
