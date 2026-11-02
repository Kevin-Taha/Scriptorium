/**
 * An in-memory Google Drive for tests: the slice of the Drive v3 REST API that `DriveClient` uses,
 * with Drive's quirks that matter to sync (several entries may share a name, folders are entries
 * with a special MIME type, deleted files go to the trash). Free of app imports so the end-to-end
 * tests can serve it through Playwright's request routing too.
 */

export const FOLDER = 'application/vnd.google-apps.folder';

export interface FakeItem {
  id: string;
  name: string;
  mimeType: string;
  parents: string[];
  content: Uint8Array;
  createdTime: string;
  modifiedTime: string;
  trashed: boolean;
}

export interface FakeRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: Uint8Array | null;
}

export interface FakeResponse {
  status: number;
  headers: Record<string, string>;
  body: Uint8Array;
}

interface Failure {
  matches(request: FakeRequest): boolean;
  status: number;
  reason: string;
  times: number;
}

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, content-type',
  'access-control-allow-methods': 'GET, POST, PATCH, OPTIONS',
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export class FakeDrive {
  readonly items = new Map<string, FakeItem>();
  /** The access token requests must carry. Change it to make the current one invalid. */
  token = 'fake-token';
  account = { emailAddress: 'reader@example.com', displayName: 'Reader' };
  /** Largest page a list request returns, to exercise paging. */
  pageSize = 1000;
  /** How long each download takes, to let downloads overlap. */
  downloadDelayMs = 0;
  /** Most downloads seen running at once. */
  maxConcurrentDownloads = 0;
  private downloads = 0;
  /** Every request, as `METHOD /path`. */
  readonly log: string[] = [];
  private readonly failures: Failure[] = [];
  private clock = Date.parse('2026-01-01T00:00:00Z');
  private nextId = 1;

  constructor() {
    this.items.set('root', this.item('root', 'My Drive', FOLDER, [], new Uint8Array()));
  }

  // ------------------------------------------------------------ test helpers

  /** Creates (or finds) the folders along `path` below `parent`, returning the last one's id. */
  mkdirs(path: string, parent = 'root'): string {
    let id = parent;
    for (const name of path.split('/').filter(Boolean)) {
      id = this.child(id, name, true)?.id ?? this.add(id, name, FOLDER, new Uint8Array()).id;
    }
    return id;
  }

  /** Creates or replaces a file at `path` below `parent`, creating folders on the way. */
  write(path: string, data: Uint8Array | string, parent = 'root'): FakeItem {
    const { dirs, name } = split(path);
    const folder = this.mkdirs(dirs.join('/'), parent);
    const bytes = typeof data === 'string' ? encoder.encode(data) : data.slice();
    const existing = this.child(folder, name, false);
    if (existing) {
      existing.content = bytes;
      existing.modifiedTime = this.tick();
      return existing;
    }
    return this.add(folder, name, mimeOf(name), bytes);
  }

  /** Adds an entry even if one with the same name exists, as Drive allows. */
  add(parent: string, name: string, mimeType: string, content: Uint8Array | string = ''): FakeItem {
    const id = `item-${this.nextId++}`;
    const bytes = typeof content === 'string' ? encoder.encode(content) : content;
    const item = this.item(id, name, mimeType, [parent], bytes);
    this.items.set(id, item);
    return item;
  }

  find(path: string, parent = 'root'): FakeItem | undefined {
    let current: FakeItem | undefined = this.items.get(parent);
    for (const name of path.split('/').filter(Boolean)) {
      if (!current) return undefined;
      current = [...this.items.values()]
        .filter((i) => !i.trashed && i.parents.includes(current!.id) && i.name === name)
        .sort(byAge)[0];
    }
    return current;
  }

  readText(path: string, parent = 'root'): string | null {
    const item = this.find(path, parent);
    return item && item.mimeType !== FOLDER ? decoder.decode(item.content) : null;
  }

  /** Names directly inside the folder at `path`. */
  names(path: string, parent = 'root'): string[] {
    const folder = this.find(path, parent);
    if (!folder) return [];
    return [...this.items.values()]
      .filter((i) => !i.trashed && i.parents.includes(folder.id))
      .map((i) => i.name)
      .sort();
  }

  /** Moves the entry at `path` to the trash, as deleting it in Drive does. */
  trash(path: string, parent = 'root'): void {
    const item = this.find(path, parent);
    if (!item) throw new Error(`Nothing at ${path}`);
    item.trashed = true;
  }

  /** Makes the next `times` requests that match fail with `status` and Drive's error `reason`. */
  failNext(matches: (request: FakeRequest) => boolean, status: number, reason = '', times = 1): void {
    this.failures.push({ matches, status, reason, times });
  }

  /** A `fetch` that answers from this Drive. */
  readonly fetch = async (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const headers: Record<string, string> = {};
    new Headers(init.headers).forEach((value, key) => {
      headers[key] = value;
    });
    const body = init.body == null ? null : new Uint8Array(await new Response(init.body).arrayBuffer());
    const response = await this.handle({ method: init.method ?? 'GET', url, headers, body });
    return new Response(response.status === 204 ? null : (response.body as BodyInit), {
      status: response.status,
      headers: response.headers,
    });
  };

  // ----------------------------------------------------------------- server

  async handle(request: FakeRequest): Promise<FakeResponse> {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();
    if (method === 'OPTIONS') return { status: 204, headers: CORS, body: new Uint8Array() };
    this.log.push(`${method} ${url.pathname}`);

    const failure = this.failures.find((f) => f.times > 0 && f.matches(request));
    if (failure) {
      failure.times--;
      return error(failure.status, failure.reason);
    }
    const auth = Object.entries(request.headers).find(([key]) => key.toLowerCase() === 'authorization')?.[1];
    if (auth !== `Bearer ${this.token}`) return error(401, 'authError');

    const path = url.pathname;
    const fileId = /^\/(?:upload\/)?drive\/v3\/files\/([^/]+)$/.exec(path)?.[1];
    if (method === 'GET' && path === '/drive/v3/about') return json({ user: this.account });
    if (method === 'GET' && path === '/drive/v3/files') return this.list(url.searchParams);
    if (method === 'GET' && fileId) {
      const item = this.live(decodeURIComponent(fileId));
      if (!item) return error(404, 'notFound');
      if (url.searchParams.get('alt') !== 'media') return json(this.metadata(item));
      this.downloads++;
      this.maxConcurrentDownloads = Math.max(this.maxConcurrentDownloads, this.downloads);
      try {
        if (this.downloadDelayMs) await new Promise((resolve) => setTimeout(resolve, this.downloadDelayMs));
      } finally {
        this.downloads--;
      }
      return { status: 200, headers: { ...CORS, 'content-type': item.mimeType }, body: item.content };
    }
    if (method === 'POST' && path === '/drive/v3/files') {
      const meta = JSON.parse(decoder.decode(request.body ?? new Uint8Array())) as Partial<FakeItem>;
      return this.create(meta, new Uint8Array());
    }
    if (method === 'POST' && path === '/upload/drive/v3/files') {
      const contentType = Object.entries(request.headers).find(
        ([k]) => k.toLowerCase() === 'content-type',
      )?.[1];
      const { metadata, content } = parseMultipart(contentType ?? '', request.body ?? new Uint8Array());
      return this.create(metadata, content);
    }
    if (method === 'PATCH' && fileId && path.startsWith('/upload/')) {
      const item = this.live(decodeURIComponent(fileId));
      if (!item) return error(404, 'notFound');
      item.content = request.body ?? new Uint8Array();
      item.modifiedTime = this.tick();
      return json(this.metadata(item));
    }
    return error(400, 'badRequest');
  }

  private list(params: URLSearchParams): FakeResponse {
    let predicate: (item: FakeItem) => boolean;
    try {
      predicate = parseQuery(params.get('q') ?? '');
    } catch {
      return error(400, 'invalidQuery');
    }
    const orderBy = params.get('orderBy');
    const matches = [...this.items.values()]
      .filter((item) => item.id !== 'root' && predicate(item))
      .sort(orderBy === 'name' ? (a, b) => a.name.localeCompare(b.name) : byAge);
    const size = Math.min(Number(params.get('pageSize')) || 100, this.pageSize);
    const start = Number(params.get('pageToken') ?? 0);
    const page = matches.slice(start, start + size);
    const next = start + size < matches.length ? String(start + size) : undefined;
    return json({ files: page.map((item) => this.metadata(item)), ...(next ? { nextPageToken: next } : {}) });
  }

  private create(meta: Partial<FakeItem>, content: Uint8Array): FakeResponse {
    const parent = meta.parents?.[0] ?? 'root';
    if (!this.live(parent)) return error(404, 'notFound');
    return json(
      this.metadata(
        this.add(parent, meta.name ?? 'Untitled', meta.mimeType ?? mimeOf(meta.name ?? ''), content),
      ),
    );
  }

  private live(id: string): FakeItem | undefined {
    const item = this.items.get(id);
    return item && !item.trashed ? item : undefined;
  }

  private child(parent: string, name: string, folder: boolean): FakeItem | undefined {
    return [...this.items.values()]
      .filter(
        (i) =>
          !i.trashed && i.parents.includes(parent) && i.name === name && (i.mimeType === FOLDER) === folder,
      )
      .sort(byAge)[0];
  }

  private metadata(item: FakeItem) {
    return {
      id: item.id,
      name: item.name,
      mimeType: item.mimeType,
      ...(item.mimeType === FOLDER || item.mimeType.startsWith('application/vnd.google-apps.')
        ? {}
        : { size: String(item.content.length) }),
      createdTime: item.createdTime,
      modifiedTime: item.modifiedTime,
    };
  }

  private item(id: string, name: string, mimeType: string, parents: string[], content: Uint8Array): FakeItem {
    const time = this.tick();
    return { id, name, mimeType, parents, content, createdTime: time, modifiedTime: time, trashed: false };
  }

  private tick(): string {
    this.clock += 1000;
    return new Date(this.clock).toISOString();
  }
}

function byAge(a: FakeItem, b: FakeItem): number {
  return a.createdTime !== b.createdTime ? (a.createdTime < b.createdTime ? -1 : 1) : a.id < b.id ? -1 : 1;
}

function split(path: string): { dirs: string[]; name: string } {
  const parts = path.split('/').filter(Boolean);
  const name = parts.pop();
  if (!name) throw new Error(`Invalid path “${path}”.`);
  return { dirs: parts, name };
}

function mimeOf(name: string): string {
  if (/\.pdf$/i.test(name)) return 'application/pdf';
  if (/\.json$/i.test(name)) return 'application/json';
  if (/\.txt$/i.test(name)) return 'text/plain';
  return 'application/octet-stream';
}

function json(value: unknown): FakeResponse {
  return {
    status: 200,
    headers: { ...CORS, 'content-type': 'application/json; charset=UTF-8' },
    body: encoder.encode(JSON.stringify(value)),
  };
}

function error(status: number, reason: string): FakeResponse {
  return {
    status,
    headers: { ...CORS, 'content-type': 'application/json; charset=UTF-8' },
    body: encoder.encode(JSON.stringify({ error: { code: status, errors: reason ? [{ reason }] : [] } })),
  };
}

/** The query forms `DriveClient` sends: clauses joined by `and`. Anything else is rejected. */
function parseQuery(q: string): (item: FakeItem) => boolean {
  const tokens: string[] = [];
  const pattern = /\s*('(?:\\.|[^'\\])*'|[A-Za-z]+|=)/y;
  let end = 0;
  for (let match = pattern.exec(q); match; match = pattern.exec(q)) {
    tokens.push(match[1]);
    end = pattern.lastIndex;
  }
  if (q.slice(end).trim()) throw new Error(`Unparsed query: ${q}`);
  const literal = (token: string | undefined) => {
    if (!token?.startsWith("'")) throw new Error(`Expected a string in ${q}`);
    return token.slice(1, -1).replace(/\\(.)/g, '$1');
  };
  const clauses: ((item: FakeItem) => boolean)[] = [];
  for (let i = 0; i < tokens.length; ) {
    if (tokens[i + 1] === 'in' && tokens[i + 2] === 'parents') {
      const parent = literal(tokens[i]);
      clauses.push((item) => item.parents.includes(parent));
      i += 3;
    } else if (tokens[i] === 'name' && tokens[i + 1] === '=') {
      const name = literal(tokens[i + 2]);
      clauses.push((item) => item.name === name);
      i += 3;
    } else if (tokens[i] === 'mimeType' && tokens[i + 1] === '=') {
      const mime = literal(tokens[i + 2]);
      clauses.push((item) => item.mimeType === mime);
      i += 3;
    } else if (tokens[i] === 'trashed' && tokens[i + 1] === '=' && tokens[i + 2] === 'false') {
      clauses.push((item) => !item.trashed);
      i += 3;
    } else {
      throw new Error(`Unsupported query: ${q}`);
    }
    if (i < tokens.length && tokens[i++] !== 'and') throw new Error(`Expected "and" in ${q}`);
  }
  return (item) => clauses.every((clause) => clause(item));
}

function parseMultipart(
  contentType: string,
  body: Uint8Array,
): { metadata: Partial<FakeItem>; content: Uint8Array } {
  const boundary = /boundary=([^;]+)/.exec(contentType)?.[1];
  if (!boundary) throw new Error('Multipart upload without a boundary.');
  const text = decoder.decode(body);
  const parts = text
    .split(`--${boundary}`)
    .slice(1, -1)
    .map((part) => part.slice(part.indexOf('\r\n\r\n') + 4).replace(/\r\n$/, ''));
  return { metadata: JSON.parse(parts[0]) as Partial<FakeItem>, content: encoder.encode(parts[1] ?? '') };
}
