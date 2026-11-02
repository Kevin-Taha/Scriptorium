# Scriptorium — Data and sync

Scriptorium has no server and no accounts. Everything a reader creates — the library,
notes, highlights, bookmarks and reading progress — lives on their own devices. This
document explains where that data is kept, how it is protected, and how it moves between
devices.

## Where data lives

| Layer | What it holds | Survives | Lost when |
| --- | --- | --- | --- |
| **Browser storage** (IndexedDB) | The library, a copy of each *imported* PDF, all annotations and progress | Restarts of the app, the browser and the computer; app updates | The browser's site data for Scriptorium is cleared, or the app is opened at a different address |
| **Linked library folder** | The PDFs themselves and a `.scriptorium/` folder with every device's annotations | Anything that happens to the browser | The folder is deleted |
| **Backup file** | All annotations and progress (not PDFs) | Anything — it's a file you keep | You delete it |

Browser storage is the fast working copy. A linked folder makes the library durable and
shared; backups are a portable snapshot for browsers that can't link folders.

### Protecting browser storage

- **Persistent storage.** Scriptorium asks the browser to mark its storage as persistent
  (after the first import or folder link). Chromium grants this silently for installed or
  frequently used apps; Firefox asks. Persistent storage is never evicted to free disk
  space — but clearing the site's data in browser settings still erases it.
- **A stable address.** Browsers keep a separate storage area per *origin* (scheme, host and
  port): `localhost:5173`, `localhost:5174` and `127.0.0.1:5173` are three different
  libraries. The development and preview servers are pinned to fixed ports so the address
  never silently changes. A published site on a fixed domain has the same property. (The
  computer's IP address doesn't matter; the address in the browser bar does.)

## Linked library folder

Choose any folder in **Library & storage → Library folder**. Scriptorium reads every PDF in
it (including sub-folders) in place — nothing is copied into the browser — and keeps notes
next to them in a hidden `.scriptorium/` folder. Point it at a folder inside **OneDrive,
Google Drive for desktop, Dropbox or iCloud Drive** and every computer that links the same
folder shares books, notes and progress.

Requirements: a Chromium-based browser on a computer (Chrome, Edge, Opera, Brave), which
implement the [File System Access API](https://developer.mozilla.org/docs/Web/API/File_System_API).
Firefox, Safari and mobile browsers can't link folders; use backups there, or a
[Google Drive folder](#google-drive-folders-approval-required) where the site offers it.

After the browser restarts it may ask for permission to open the folder again — the library
shows a **Reconnect** button, and opening a book from the folder asks in the same click.
Choosing *Allow on every visit* in Chrome or Edge (or installing Scriptorium as an app)
avoids the prompt.

Scriptorium reads each PDF once when it first appears (to identify it), then only checks file
sizes and dates, so rescans of large libraries are fast. With OneDrive or Google Drive
"online-only" files, that first read downloads the file.

**Unlinking** removes the folder's books from the library on this device. Their notes stay in
the folder (and on this device), and come back when the folder is linked again.

### Folder layout

```
Textbooks/                         ← the folder you linked
  Physics/Mechanics.pdf            ← books, anywhere in the tree
  Algorithms.pdf
  .scriptorium/
    README.txt
    devices/
      <device id>/
        <book id>.json             ← one device's view of one book's annotations
```

- **Book ids** are the SHA-256 hash of the PDF's bytes. Moving or renaming a PDF keeps its
  notes; editing the PDF (e.g. saving annotations into it with another app) makes it a new
  book.
- **Each device writes only its own `devices/<device id>/` files** and reads everyone's. Two
  devices therefore never edit the same file, so cloud sync services never produce conflict
  copies.
- Files are plain JSON (`format: "scriptorium.book"`, `version: 1`) holding the book's title
  and page count, the device's name, and its notes, highlights, bookmarks, deletions and
  reading position. Files that are malformed, half-synced, or from a newer version are
  skipped, never trusted.

### How devices agree

Every device merges all device files for a book:

- Each note, highlight and bookmark is identified by a unique id; the most recently edited
  copy wins.
- Deleting an annotation leaves a small *tombstone* so the deletion reaches other devices
  instead of the annotation coming back from their copies. An edit made after the deletion
  revives it.
- Reading progress is the most recently saved position. Opening a book on another device
  continues from there and says where it came from.
- Merging is commutative and idempotent, so devices converge no matter how late or in which
  order the cloud service delivers files. Ties are broken deterministically.

Device clocks decide "most recent"; a device whose clock is far off can win or lose edits it
shouldn't. Removing a book from the library on one device does not delete its notes from the
folder (re-adding the PDF brings them back).

**Reset progress** (a book's menu in the library) does reach other devices: it deletes the book's
notes, highlights and bookmarks with tombstones, and replaces the reading position with a newer one at
the start of the book (deleting it would let an older position from another device win). A position at
the very start doesn't count as "reading" when another device syncs it, so a reset book doesn't jump
back into anyone's *Now reading*. An edit made on a device after the reset still wins, as with any
deletion.

If browser data is cleared, the browser becomes a new device: linking the same folder again
restores the books, notes and progress from the folder.

## Backups

**Library & storage → Backups** exports one JSON file (`format: "scriptorium.backup"`) with
every book's annotations and progress. Restoring *merges* it into the library — newer edits
on this device are kept, nothing is deleted. PDFs are not included: books whose PDF isn't in
the library yet are listed, and their notes appear as soon as the same PDF is added (books
are matched by content hash).

## Google Drive folders (approval required)

Where the site offers it, **Library & storage → Library folder → Sync a Google Drive folder
directly** links a folder in Google Drive itself, without Google Drive for desktop. It works in any
browser, including phones, tablets, Safari and Firefox, and behaves exactly like a linked local
folder: the same `.scriptorium/` layout, the same per-device files and the same merging, so a
computer linking the folder through Google Drive for desktop and a tablet linking it directly share
one library.

- **Approval.** Reading the PDFs already in a folder the reader chooses, and saving notes inside it,
  needs Google's full Drive scope (`https://www.googleapis.com/auth/drive`). Google treats that
  scope as restricted: until the app passes Google's verification, only accounts the site owner
  adds as test users can sign in (at most 100), and they see an "unverified app" notice first.
  Anyone else is told access is blocked. That's why the option is collapsed and says so.
- **Signing in.** The site has no server, so Google gives it access tokens that last about an hour
  and can only renew them from a click. When one runs out, sync pauses and the library shows
  **Reconnect**; one click (usually without any prompt) carries on. Nothing is lost meanwhile.
- **What Scriptorium touches.** It lists the chosen folder, reads its PDFs, and creates and replaces
  files only inside `.scriptorium/`. It never changes, moves or deletes anything else. Shortcuts and
  Google Docs files are ignored, and the folder chooser shows folders in My Drive.
- **Books kept in the browser.** The first time a device links the folder it downloads each PDF once
  to identify it, and keeps that copy in the browser (up to 1 GB, oldest dropped first) for reading
  its title and cover and for opening it — instantly, offline, and before signing in again. Books
  dropped from the copy download again when opened. Unlinking clears them.
- **Duplicate names.** Drive allows several entries with one name (two devices creating
  `.scriptorium` at the same moment, for example). Every device uses the oldest, and a device whose
  files ended up in a newer duplicate writes them again.

### Setting it up (site owner)

Builds offer Google Drive only when they have a Google OAuth client id; without one nothing about
Drive is shown or loaded, and the Content-Security-Policy stays limited to the site itself.

1. In the [Google Cloud console](https://console.cloud.google.com/), create a project and enable
   the **Google Drive API**.
2. Configure the **OAuth consent screen** (Google Auth Platform): audience *External*, publishing
   status *Testing*. Under **Data access**, add the `https://www.googleapis.com/auth/drive` scope.
   Under **Audience → Test users**, add every Google account that may use Drive sync.
3. Create an **OAuth client ID** of type *Web application*. Add the site's origin to
   **Authorized JavaScript origins** — `https://kevin-taha.github.io` for the published site, plus
   `http://localhost:5173` and `http://localhost:4173` for development. No redirect URIs or client
   secret are needed.
4. Give the build the client id. It's public by design (it ships in the app), not a secret:
   - Published site: `gh variable set GOOGLE_CLIENT_ID --body "<id>.apps.googleusercontent.com"`,
     then re-run **Deploy to GitHub Pages**.
   - Local development: `VITE_GOOGLE_CLIENT_ID=<id>.apps.googleusercontent.com` in `.env.local`.

With a client id, the policy also allows Google's sign-in library
(`https://accounts.google.com/gsi/`) and the Drive API (`https://www.googleapis.com`), and nothing
else. Offering Drive sync to anyone without approval would mean passing Google's restricted-scope
verification, including a yearly security assessment.

OneDrive could work the same way (a Microsoft Entra app with Microsoft Graph); it isn't built yet.

## Privacy

Nothing leaves the reader's devices except through services they choose (their own cloud
folder, a Google Drive folder they link, or backup files). Scriptorium has no analytics and makes
no network requests of its own beyond loading the app. With a Google Drive folder linked, the
browser talks to Google directly; nothing passes through any other server.
