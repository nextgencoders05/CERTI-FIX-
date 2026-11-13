# Security & Privacy Design

| Area | Implementation |
|---|---|
| Passwords | bcrypt (cost 12, per-password salt); minimum 8 chars with a letter and a digit; 72-byte cap enforced |
| Authentication | JWT HS256 with expiry; `sub`/`exp` required; deactivated users rejected on every request; login timing equalised for unknown emails |
| Authorization | Role dependencies on every route; organization actions require membership **and** `verified` status; per-object scoping (users see only their own documents, requests and certificates; organizations only their own) |
| Uploads | Extension whitelist, magic-byte check, streamed size limit, decode validation (Pillow `verify`, PyMuPDF), PDF page limit, password-protected PDFs rejected, decompression-bomb guard |
| Storage | Random filenames under `STORAGE_DIR`; never mounted as static; path-traversal-safe resolution; files streamed only after permission checks with `Cache-Control: private, no-store` |
| Integrity | Uploaded documents are never edited. Corrections produce a new certificate with a new ID; the old record is marked superseded. Issued PDFs are hashed (SHA-256) so altered files fail verification |
| Rate limiting | Per-IP sliding window; stricter for login, registration, contact and verification |
| Errors | Uniform JSON errors; unexpected exceptions logged server-side with a generic client message |
| Audit | Logins (incl. failures), registrations, uploads, document views by reviewers, submissions, review decisions, issuing, revocation, downloads, and all admin actions |
| Headers | `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`; strict CORS origin list |
| Privacy | Verification records store a SHA-256 of the IP rather than the IP; verification-by-file never stores the uploaded file |
| Retention | Uploads get `delete_after` (default 180 days). Expired files are deleted unless attached to an open request; closed requests keep metadata but lose the file |

## Known limitations

- The access token is stored in `localStorage`. This is simple and works across tabs, but an XSS bug would expose it. A hardened deployment could switch to an httpOnly cookie with CSRF protection.
- The rate limiter is in-memory per process (see the deployment checklist).
- There is no email verification or password-reset email flow yet: it needs an SMTP/email provider.
- OCR field extraction is heuristic, tuned for common English certificate wording.
