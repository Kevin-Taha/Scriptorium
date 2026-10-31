# Security policy

## Reporting a vulnerability

Please report security issues privately through
[GitHub's private vulnerability reporting](https://github.com/Kevin-Taha/Scriptorium/security/advisories/new)
rather than in a public issue. Include the steps to reproduce and, if it involves a particular PDF
or backup file, a minimal example of one. Fixes land on `main`, which is the only supported version.

## Scope

Scriptorium runs entirely in your browser: there is no server, account or telemetry, and your
books and notes stay in the browser's storage or the folder you link. The most relevant reports are
ways a crafted PDF, backup or synced folder could run script, read data it shouldn't, or corrupt a
library.
