# Architecture

```
┌──────────────────────┐   /api (JSON, JWT)   ┌──────────────────────────────────────┐
│ React + Vite SPA     │ ───────────────────▶ │ FastAPI                              │
│ Tailwind, Router,    │                      │  routes/  →  services/  →  models/   │
│ Axios                │ ◀─────────────────── │  security/ (JWT, RBAC, rate limit)   │
└──────────────────────┘                      │  ocr/ (PyMuPDF, OpenCV, Tesseract)   │
        ▲  nginx (prod)                       └──────────┬───────────────┬───────────┘
        │                                                │ SQLAlchemy    │ private files
   Browser / QR scan                            ┌────────▼─────┐  ┌──────▼────────────┐
                                                │ PostgreSQL   │  │ STORAGE_DIR       │
                                                │ (Alembic)    │  │ uploads/ certs/   │
                                                └──────────────┘  │ logos/            │
                                                                  └───────────────────┘
```

## Backend layout (`backend/app`)

| Package | Responsibility |
|---|---|
| `main.py` | App factory: middleware (CORS, rate limit, security headers), safe error handlers, router registration, optional SPA serving |
| `config.py` | Pydantic settings from environment / `.env`; refuses weak JWT secret in production |
| `database/` | Engine, session factory, declarative base with a constraint naming convention |
| `models/` | SQLAlchemy 2.0 models (see below) |
| `schemas/` | Pydantic request/response models and validation rules |
| `security/` | bcrypt hashing, JWT, role dependencies (`require_admin`, `get_verified_organization`…), rate limiter |
| `routes/` | One router per resource; thin — validation, permission checks, orchestration |
| `services/` | Storage, file validation, certificate issuing, PDF/QR rendering, audit, notifications, retention, seeding |
| `ocr/` | `processor.py` (text extraction) and `field_extractor.py` (heuristic field detection) |

## Data model

| Table | Purpose / key constraints |
|---|---|
| `users` | Unique email; `role` ∈ user/organization/admin; optional FK → organizations |
| `organizations` | Unique slug; `status` ∈ pending/verified/rejected/suspended; verifier FK |
| `certificate_categories` | Unique name & slug; built-in (`is_system`) vs custom |
| `certificate_templates` | FK organization (cascade); title, body with placeholders, JSON layout; soft-deactivated |
| `certificates` | Unique `certificate_number`; FKs organization (restrict), template, category, recipient user, issuer; `supersedes_id` self-FK; `correction_request_id`; `pdf_sha256` and `data_sha256` integrity hashes; status active/revoked/superseded; composite index (organization, status) |
| `uploaded_documents` | Owner FK; private `stored_path`; SHA-256; OCR status/text/fields/confidence; `delete_after` for retention |
| `correction_requests` | Unique reference; requester, organization, document (restrict delete), original & corrected certificate FKs; `original_fields` / `requested_fields` JSON; status; index (organization, status) |
| `approval_records` | Append-only review history: decision, comment, reviewer, timestamp |
| `verification_records` | Every public verification: query, method (number/file), result, hashed IP, user agent |
| `audit_logs` | Actor, action, entity, JSON details, IP, timestamp (indexed) |
| `notifications` | Per-user in-app notifications |
| `contact_messages` | Contact form inbox |

Enums are stored as `VARCHAR` + `CHECK` constraints (portable across PostgreSQL and SQLite). The initial migration is `backend/alembic/versions/0001_initial_initial_schema.py`; it also seeds the 8 default categories.

## Correction workflow

1. **Upload** (`POST /documents`): extension whitelist → magic-byte check → size limit (streamed) → decode check (Pillow / PyMuPDF, page limit) → stored under a random name in private storage.
2. **OCR**: PDFs with a text layer are read directly; otherwise pages are rasterised at 300 DPI, preprocessed with OpenCV (grayscale, upscale, median blur, Otsu threshold, deskew) and read by Tesseract (`image_to_data` for word confidence).
3. **Field extraction**: regex heuristics for certificate number, recipient (after "certify that", "awarded to"…), course/role, organization line, title, date ranges and issue date, and a category guess. Each value carries a heuristic confidence.
4. **Request** (`POST /corrections`): if the certificate number matches a platform certificate, the issuer and authoritative original values come from the database; otherwise the user selects a verified organization. Only whitelisted fields can be requested.
5. **Review** (`POST /corrections/{id}/review`): verified organization members mark under review, reject (reason required) or approve.
6. **Approve → re-issue**: a new certificate is generated from the original record (or the submitted original fields) with requested changes applied, a new ID, new PDF and QR code; the original is marked `superseded` and its verification page points to the replacement. The uploaded document is never modified.

## Certificate integrity

- `data_sha256`: hash of the canonical certificate data, printed (truncated) on the PDF.
- `pdf_sha256`: hash of the exact issued PDF bytes; `POST /verify/file` detects any modification.
- QR code encodes `PUBLIC_VERIFY_BASE_URL/<certificate_number>`.

## Frontend layout (`frontend/src`)

| Folder | Contents |
|---|---|
| `services/api.js` | Axios instance, token storage, error normalisation, authenticated blob download |
| `hooks/` | `useAuth` (session), `useToast` (notifications), `useApi` (fetch + loading/error state), `useDebounced` |
| `components/` | UI kit (buttons, fields, badges, stat cards, empty/error states), `DataTable`, `Modal`/`ConfirmDialog`, `NotificationBell`, `SecureFileViewer`, `FileDropzone`, `ErrorBoundary` |
| `layouts/` | Public site layout; role-aware dashboard layout with sidebar & mobile drawer |
| `pages/` | Landing, login/register, verify, privacy, terms, contact, 404 |
| `dashboard/` | `user/`, `org/`, `admin/` pages and `shared/` (certificates, corrections, account) |
| `utils/` | Formatting and label helpers |
