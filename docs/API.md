# CertiFix AI — API Reference

Base path: `/api`. Interactive docs are served by the running API at **`/api/docs`** (Swagger UI) and **`/api/redoc`**.
The full machine-readable spec is in [`openapi.json`](openapi.json) (regenerate with the command at the bottom).

## Conventions

- **Auth:** `Authorization: Bearer <access_token>` from `POST /api/auth/login` or a register endpoint. Tokens are JWT (HS256), default lifetime 60 minutes.
- **Errors:** always JSON `{"detail": "<human readable message>"}`. Validation errors (422) also include `errors: [{field, message}]`. Unexpected errors return a generic 500 message; details are only logged server-side.
- **Pagination:** list endpoints accept `page` (≥1) and `page_size` (1–100) and return `{items, total, page, page_size}`.
- **Rate limiting:** `429` with a `Retry-After` header. Login, registration, contact and verification have a stricter per-IP limit.
- **Files** (certificate PDFs, uploaded documents) are only returned through authenticated endpoints with `Cache-Control: private, no-store`. There are no public storage URLs.

## Roles

| Role | Who | Notes |
|---|---|---|
| `user` | Public user / certificate recipient | Uploads certificates, requests corrections, downloads own certificates |
| `organization` | Member of an issuing organization | Must belong to a **verified** organization to issue, manage templates or review corrections |
| `admin` | Platform super admin | Created with `python -m scripts.create_admin` |

## Endpoints

Access: **Public** = no token; **Any** = any signed-in user; **User**, **Org** (verified org required where marked ✔), **Admin**.

### Authentication
| Method | Path | Access | Description |
|---|---|---|---|
| POST | `/auth/register` | Public | Register a public user; returns a token |
| POST | `/auth/register-organization` | Public | Register an organization (status `pending`) and its admin account |
| POST | `/auth/login` | Public | Email + password → access token |
| GET | `/auth/me` | Any | Current user (with organization summary) |
| PUT | `/auth/me` | Any | Update name / phone |
| POST | `/auth/change-password` | Any | Change password (requires current password) |

### Organizations
| Method | Path | Access | Description |
|---|---|---|---|
| GET | `/organizations` | Public | Verified issuers (for choosing who reviews a correction) |
| GET / PUT | `/organizations/me` | Org | View / update own organization profile |
| POST | `/organizations/me/logo` | Org | Upload PNG/JPG logo (≤2 MB) |
| GET | `/organizations/me/stats` | Org | Dashboard counts |
| GET | `/organizations/{id}/logo` | Public | Organization logo image |

### Categories
| Method | Path | Access | Description |
|---|---|---|---|
| GET | `/categories` | Public | Active categories (`include_inactive=true` for all) |
| POST | `/categories` | Admin | Create a category |
| PATCH | `/categories/{id}` | Admin | Rename / describe / (de)activate |
| DELETE | `/categories/{id}` | Admin | Delete a custom, unused category |

### Templates
| Method | Path | Access | Description |
|---|---|---|---|
| GET | `/templates` | Org | List own templates |
| POST | `/templates` | Org ✔ | Create (name, title, body with `{placeholders}`, layout) |
| GET / PUT | `/templates/{id}` | Org / Org ✔ | View / update |
| DELETE | `/templates/{id}` | Org ✔ | Deactivate (soft delete) |
| GET | `/templates/{id}/preview` | Org | Watermarked PREVIEW PDF with sample data |

Body placeholders: `{recipient_name} {course_or_role} {start_date} {end_date} {issue_date} {organization_name} {category} {description} {certificate_number}` plus any extra field keys.

### Certificates
| Method | Path | Access | Description |
|---|---|---|---|
| POST | `/certificates` | Org ✔ | Issue a certificate: assigns `CFX-YYYY-XXXXXXXX`, renders PDF with QR code |
| GET | `/certificates` | Any | Scoped list: user → own, org → issued, admin → all. Filters `q`, `status`, `category_id` |
| GET | `/certificates/{id}` | Any (scoped) | Details |
| GET | `/certificates/{id}/pdf` | Any (scoped) | PDF (`download=true` for attachment) |
| POST | `/certificates/{id}/revoke` | Org ✔ | Revoke with reason |

### Uploaded documents & OCR
| Method | Path | Access | Description |
|---|---|---|---|
| POST | `/documents` | User, Admin | Multipart `file` (PDF/PNG/JPG/WEBP/TIFF ≤10 MB, ≤10 pages). Validates, stores privately, runs OCR, returns extracted text + fields |
| GET | `/documents` | Any | Own uploads |
| GET | `/documents/{id}` | Owner, reviewing org, admin | OCR results |
| GET | `/documents/{id}/file` | Owner, reviewing org, admin | Original file |
| POST | `/documents/{id}/reprocess` | Owner | Re-run OCR |
| DELETE | `/documents/{id}` | Owner | Delete (not allowed once attached to a correction request) |

OCR response `ocr_fields` maps each field (`recipient_name`, `title`, `course_or_role`, `organization_name`, `certificate_number`, `start_date`, `end_date`, `issue_date`, `detected_category`) to `{value, confidence}`. **OCR output is a suggestion, never proof of authenticity.**

### Correction requests
| Method | Path | Access | Description |
|---|---|---|---|
| POST | `/corrections` | User | Submit: `document_id`, `requested_fields`, `reason`, and either `original_certificate_number` (platform certificate — issuer resolved automatically) or `organization_id` |
| GET | `/corrections` | Any | Scoped list; filters `status`, `q` |
| GET | `/corrections/{id}` | Any (scoped) | Details incl. approval history |
| POST | `/corrections/{id}/cancel` | Requester | Cancel while open |
| POST | `/corrections/{id}/review` | Org ✔ | `decision`: `under_review` \| `approved` \| `rejected` (comment required); `template_id` required on approval if there is no original platform certificate |

Correctable fields: `recipient_name, title, course_or_role, description, start_date, end_date, issue_date` (dates as `YYYY-MM-DD`).
On approval a **new** certificate is issued (new ID, PDF notes the superseded ID) and the original is marked `superseded`.

### Verification (public)
| Method | Path | Access | Description |
|---|---|---|---|
| GET | `/verify/{certificate_number}` | Public | `result`: `valid` \| `revoked` \| `superseded` \| `not_found` |
| POST | `/verify/file` | Public | Upload a PDF; matched by SHA-256 against issued PDFs (file not stored) |

### Notifications, contact, admin
| Method | Path | Access | Description |
|---|---|---|---|
| GET | `/notifications` | Any | `{items, unread}` |
| POST | `/notifications/{id}/read`, `/notifications/read-all` | Any | Mark read |
| POST | `/contact` | Public | Contact form |
| GET | `/admin/stats` | Admin | Platform statistics |
| GET / PATCH | `/admin/users`, `/admin/users/{id}` | Admin | List / activate, deactivate, change role |
| GET | `/admin/organizations[/{id}]` | Admin | List / view organizations |
| POST | `/admin/organizations/{id}/status` | Admin | `verified` \| `pending` \| `rejected` \| `suspended` (note required for reject/suspend) |
| GET | `/admin/audit-logs` | Admin | Filters `action`, `entity_type`, `actor_id` |
| GET / POST | `/admin/contact-messages[/{id}/resolve]` | Admin | Contact inbox |
| POST | `/admin/retention/run` | Admin | Apply the upload retention policy now |
| GET | `/health` | Public | Health check |

## Example

```bash
# Log in
TOKEN=$(curl -s -X POST localhost:8000/api/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"student@example.com","password":"..."}' | python -c 'import sys,json;print(json.load(sys.stdin)["access_token"])')

# Upload a certificate and get OCR results
curl -s -X POST localhost:8000/api/documents -H "Authorization: Bearer $TOKEN" -F file=@certificate.pdf

# Verify a certificate (public)
curl -s localhost:8000/api/verify/CFX-2026-AB12CD34
```

## Regenerating `openapi.json`

```bash
cd backend
python -c "import json; from app.main import app; open('../docs/openapi.json','w').write(json.dumps(app.openapi(), indent=2))"
```
