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
Firefox, Safari and mobile browsers can't link folders; use backups there.

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

## Cloud services without a desktop client

Linking a cloud folder works through each service's desktop app, which presents the cloud
folder as a normal local folder. Talking to Google Drive or OneDrive directly from the
browser (for example on a tablet) is possible without a server, but needs:

1. An OAuth client registered by the site owner — a Google Cloud project for Google Drive
   (Google Identity Services, `drive.file` scope plus the Google Picker so the reader chooses
   the folder), or a Microsoft Entra app for OneDrive (MSAL, Microsoft Graph).
2. The published site's address registered with that client.
3. A storage adapter implementing the same small set of operations the folder sync uses
   (list files, read, write, stat), so the sync and merge logic stays unchanged.

This is a natural follow-up once the site has a permanent address.

## Privacy

Nothing leaves the reader's devices except through services they choose (their own cloud
folder or backup files). Scriptorium has no analytics and makes no network requests of its
own beyond loading the app.
