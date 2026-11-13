import io
import shutil

import pytest
from PIL import Image, ImageDraw

from app.ocr.field_extractor import extract_fields
from conftest import auth, make_text_pdf, register_user

SAMPLE = """GLOBAL TECH INSTITUTE
CERTIFICATE OF INTERNSHIP
This is to certify that
Mr. Jonh Doe
has successfully completed the internship in Machine Learning Engineering from 01/06/2024 to 31/08/2024.
Certificate No: GTI-2024-00981
Date of Issue: 15 September 2024
"""


def test_field_extractor_identifies_fields():
    f = extract_fields(SAMPLE)
    assert f["recipient_name"]["value"] == "Jonh Doe"
    assert f["certificate_number"]["value"] == "GTI-2024-00981"
    assert f["organization_name"]["value"] == "GLOBAL TECH INSTITUTE"
    assert f["title"]["value"] == "Certificate Of Internship"
    assert f["start_date"]["value"] == "2024-06-01"
    assert f["end_date"]["value"] == "2024-08-31"
    assert f["issue_date"]["value"] == "2024-09-15"
    assert "Machine Learning Engineering" in f["course_or_role"]["value"]
    assert f["detected_category"]["value"] == "Internship Certificate"


def test_field_extractor_strips_programme_prefix():
    f = extract_fields("This is to certify that Sam Student\nhas successfully completed an internship as "
                       "Software Engineering Intern from 01/06/2026 to 31/08/2026.")
    assert f["course_or_role"]["value"] == "Software Engineering Intern"
    assert f["recipient_name"]["value"] == "Sam Student"


def test_field_extractor_handles_empty_text():
    f = extract_fields("")
    assert all(v["value"] is None for v in f.values())


def test_upload_text_pdf_runs_extraction(client):
    token = register_user(client)
    pdf = make_text_pdf(SAMPLE.splitlines())
    r = client.post("/api/documents", files={"file": ("cert.pdf", pdf, "application/pdf")}, headers=auth(token))
    assert r.status_code == 201, r.text
    doc = r.json()
    assert doc["ocr_status"] == "completed"
    assert doc["ocr_method"] == "pdf_text"
    assert doc["ocr_fields"]["certificate_number"]["value"] == "GTI-2024-00981"
    assert doc["delete_after"] is not None

    # Original file is retrievable by its owner only, via authenticated endpoint
    f = client.get(f"/api/documents/{doc['id']}/file", headers=auth(token))
    assert f.status_code == 200 and f.content == pdf
    assert f.headers["cache-control"] == "private, no-store"
    other = register_user(client, email="eve@example.com", name="Eve Evil")
    assert client.get(f"/api/documents/{doc['id']}/file", headers=auth(other)).status_code == 404
    assert client.get(f"/api/documents/{doc['id']}/file").status_code == 401


def test_rejects_disguised_and_unsupported_files(client):
    token = register_user(client)
    r = client.post("/api/documents", files={"file": ("cert.pdf", b"MZ\x90\x00 not a pdf", "application/pdf")},
                    headers=auth(token))
    assert r.status_code == 415
    r = client.post("/api/documents", files={"file": ("run.exe", b"MZ\x90\x00", "application/octet-stream")},
                    headers=auth(token))
    assert r.status_code == 415
    r = client.post("/api/documents", files={"file": ("empty.png", b"", "image/png")}, headers=auth(token))
    assert r.status_code == 400


def test_rejects_oversized_file(client, monkeypatch):
    from app.config import get_settings
    monkeypatch.setattr(get_settings(), "MAX_UPLOAD_MB", 1)
    token = register_user(client)
    big = b"%PDF-1.4\n" + b"0" * (1024 * 1024 + 10)
    r = client.post("/api/documents", files={"file": ("big.pdf", big, "application/pdf")}, headers=auth(token))
    assert r.status_code == 413


def _image_bytes() -> bytes:
    img = Image.new("RGB", (1400, 500), "white")
    d = ImageDraw.Draw(img)
    d.text((50, 50), "CERTIFICATE OF COMPLETION", fill="black")
    d.text((50, 120), "This is to certify that John Doe", fill="black")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def test_image_upload_uses_tesseract_or_reports_unavailable(client):
    """With Tesseract installed the image is OCR'd; without it the API must say so honestly."""
    token = register_user(client)
    r = client.post("/api/documents", files={"file": ("scan.png", _image_bytes(), "image/png")}, headers=auth(token))
    assert r.status_code == 201
    doc = r.json()
    if shutil.which("tesseract"):
        assert doc["ocr_method"] == "tesseract"
    else:
        assert doc["ocr_status"] == "failed"
        assert "Tesseract" in doc["ocr_error"]


@pytest.mark.skipif(not shutil.which("tesseract"), reason="Tesseract OCR engine not installed")
def test_tesseract_reads_image_text(client):
    token = register_user(client)
    img = Image.new("RGB", (1600, 400), "white")
    from PIL import ImageFont
    try:
        font = ImageFont.truetype("DejaVuSans.ttf", 48)
    except OSError:
        font = ImageFont.load_default()
    ImageDraw.Draw(img).text((40, 150), "This is to certify that John Doe", fill="black", font=font)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    doc = client.post("/api/documents", files={"file": ("s.png", buf.getvalue(), "image/png")},
                      headers=auth(token)).json()
    assert doc["ocr_status"] == "completed"
    assert "certify" in doc["ocr_text"].lower()


def test_delete_document(client):
    token = register_user(client)
    pdf = make_text_pdf(SAMPLE.splitlines())
    doc = client.post("/api/documents", files={"file": ("c.pdf", pdf, "application/pdf")}, headers=auth(token)).json()
    assert client.delete(f"/api/documents/{doc['id']}", headers=auth(token)).status_code == 204
    assert client.get(f"/api/documents/{doc['id']}", headers=auth(token)).status_code == 404
