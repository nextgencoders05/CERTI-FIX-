"""End-to-end: issue -> upload -> OCR -> correction -> review -> corrected re-issue -> verification."""
import fitz

from conftest import auth, create_admin, create_template, make_text_pdf, register_user, verified_org


def _issue(client, org_token, tpl_id, **kw):
    payload = {"template_id": tpl_id, "recipient_name": "Alice Smth", "recipient_email": "alice@example.com",
               "course_or_role": "Full-Stack Web Development", "start_date": "2024-01-10",
               "end_date": "2024-04-10", "issue_date": "2024-04-15", **kw}
    r = client.post("/api/certificates", json=payload, headers=auth(org_token))
    assert r.status_code == 201, r.text
    return r.json()


def test_certificate_issue_pdf_and_verification(client):
    admin = create_admin(client)
    org_token, _ = verified_org(client, admin)
    user_token = register_user(client)
    tpl = create_template(client, org_token)
    cert = _issue(client, org_token, tpl["id"])
    assert cert["certificate_number"].startswith("CFX-")
    assert cert["has_pdf"] and cert["recipient_user_id"] is not None

    pdf = client.get(f"/api/certificates/{cert['id']}/pdf", headers=auth(user_token))
    assert pdf.status_code == 200 and pdf.content.startswith(b"%PDF")
    text = "".join(p.get_text() for p in fitz.open(stream=pdf.content, filetype="pdf"))
    assert "Alice Smth" in text and cert["certificate_number"] in text
    assert "Full-Stack Web Development" in text

    # Recipient sees it in their list, a stranger does not
    assert client.get("/api/certificates", headers=auth(user_token)).json()["total"] == 1
    stranger = register_user(client, email="x@example.com", name="Xavier")
    assert client.get(f"/api/certificates/{cert['id']}/pdf", headers=auth(stranger)).status_code == 404

    v = client.get(f"/api/verify/{cert['certificate_number'].lower()}").json()
    assert v["result"] == "valid" and v["recipient_name"] == "Alice Smth" and v["organization_verified"]
    vf = client.post("/api/verify/file", files={"file": ("c.pdf", pdf.content, "application/pdf")}).json()
    assert vf["result"] == "valid"
    tampered = pdf.content.replace(b"Alice", b"Alicf", 1)
    assert client.post("/api/verify/file", files={"file": ("c.pdf", tampered, "application/pdf")}).json()["result"] \
        == "not_found"
    assert client.get("/api/verify/CFX-0000-NOPE").json()["result"] == "not_found"


def test_full_correction_workflow_with_platform_certificate(client):
    admin = create_admin(client)
    org_token, org_id = verified_org(client, admin)
    user_token = register_user(client)
    tpl = create_template(client, org_token)
    original = _issue(client, org_token, tpl["id"])

    # User uploads the certificate they received; text layer OCR finds the certificate number.
    pdf = client.get(f"/api/certificates/{original['id']}/pdf", headers=auth(user_token)).content
    doc = client.post("/api/documents", files={"file": ("mine.pdf", pdf, "application/pdf")},
                      headers=auth(user_token)).json()
    assert doc["ocr_status"] == "completed"
    detected = doc["ocr_fields"]["certificate_number"]["value"]
    assert detected == original["certificate_number"]

    # Submit correction
    r = client.post("/api/corrections", headers=auth(user_token), json={
        "document_id": doc["id"], "original_certificate_number": detected,
        "requested_fields": {"recipient_name": "Alice Smith"},
        "reason": "My surname is misspelled; it should be Smith as on my passport.",
    })
    assert r.status_code == 201, r.text
    cr = r.json()
    assert cr["status"] == "submitted" and cr["organization_id"] == org_id
    assert cr["original_fields"]["recipient_name"] == "Alice Smth"

    # Duplicate open request is blocked
    dup = client.post("/api/corrections", headers=auth(user_token), json={
        "document_id": doc["id"], "original_certificate_number": detected,
        "requested_fields": {"recipient_name": "Alice Smith"}, "reason": "Duplicate request for testing."})
    assert dup.status_code == 409

    # Organization was notified and can see the request + the uploaded file
    notes = client.get("/api/notifications", headers=auth(org_token)).json()
    assert notes["unread"] >= 1
    assert client.get(f"/api/documents/{doc['id']}/file", headers=auth(org_token)).status_code == 200

    # Users cannot review
    assert client.post(f"/api/corrections/{cr['id']}/review", json={"decision": "approved"},
                       headers=auth(user_token)).status_code == 403

    r = client.post(f"/api/corrections/{cr['id']}/review", json={"decision": "under_review", "comment": "Checking"},
                    headers=auth(org_token))
    assert r.json()["status"] == "under_review"

    r = client.post(f"/api/corrections/{cr['id']}/review", json={"decision": "approved", "comment": "Verified ID"},
                    headers=auth(org_token))
    assert r.status_code == 200, r.text
    cr = r.json()
    assert cr["status"] == "approved"
    assert [a["decision"] for a in cr["approvals"]] == ["under_review", "approved"]
    new_number = cr["corrected_certificate_number"]
    assert new_number and new_number != original["certificate_number"]

    # Old certificate superseded, new one valid and linked
    old_v = client.get(f"/api/verify/{original['certificate_number']}").json()
    assert old_v["result"] == "superseded" and old_v["superseded_by"] == new_number
    new_v = client.get(f"/api/verify/{new_number}").json()
    assert new_v["result"] == "valid" and new_v["recipient_name"] == "Alice Smith"
    assert new_v["is_corrected_reissue"] and new_v["supersedes"] == original["certificate_number"]

    new_cert = client.get(f"/api/certificates/{cr['corrected_certificate_id']}", headers=auth(user_token)).json()
    assert new_cert["course_or_role"] == "Full-Stack Web Development"  # unchanged fields carried over
    new_pdf = client.get(f"/api/certificates/{new_cert['id']}/pdf", headers=auth(user_token)).content
    text = "".join(p.get_text() for p in fitz.open(stream=new_pdf, filetype="pdf"))
    assert "Supersedes certificate" in text and original["certificate_number"] in text

    # Closed request cannot be reviewed again
    assert client.post(f"/api/corrections/{cr['id']}/review", json={"decision": "rejected", "comment": "x"},
                       headers=auth(org_token)).status_code == 409

    # Requester notified; audit trail recorded
    assert any("approved" in n["message"] for n in
               client.get("/api/notifications", headers=auth(user_token)).json()["items"])
    actions = {log["action"] for log in client.get("/api/admin/audit-logs?page_size=100",
                                                   headers=auth(admin)).json()["items"]}
    assert {"correction.submitted", "correction.approved", "certificate.issued", "document.uploaded"} <= actions


def test_correction_for_external_certificate_and_rejection(client):
    admin = create_admin(client)
    org_token, org_id = verified_org(client, admin)
    user_token = register_user(client)
    create_template(client, org_token)
    pdf = make_text_pdf(["Acme Institute of Technology", "Certificate of Participation",
                         "This is to certify that", "Alise Smith", "participated in the Robotics Workshop.",
                         "Date: 2023-11-02"])
    doc = client.post("/api/documents", files={"file": ("old.pdf", pdf, "application/pdf")},
                      headers=auth(user_token)).json()

    # Organization must be specified when no platform certificate matches
    r = client.post("/api/corrections", headers=auth(user_token), json={
        "document_id": doc["id"], "requested_fields": {"recipient_name": "Alice Smith"},
        "reason": "Name misspelled on the paper certificate."})
    assert r.status_code == 400

    # Invalid field and invalid date are rejected by validation
    r = client.post("/api/corrections", headers=auth(user_token), json={
        "document_id": doc["id"], "organization_id": org_id, "requested_fields": {"grade": "A+"},
        "reason": "Please upgrade my grade to A plus."})
    assert r.status_code == 422
    r = client.post("/api/corrections", headers=auth(user_token), json={
        "document_id": doc["id"], "organization_id": org_id, "requested_fields": {"issue_date": "02/11/2023"},
        "reason": "Wrong issue date printed on certificate."})
    assert r.status_code == 422

    r = client.post("/api/corrections", headers=auth(user_token), json={
        "document_id": doc["id"], "organization_id": org_id,
        "original_fields": {"recipient_name": "Alise Smith", "title": "Certificate of Participation"},
        "requested_fields": {"recipient_name": "Alice Smith"}, "reason": "Name misspelled on the paper certificate."})
    assert r.status_code == 201
    cr = r.json()
    assert cr["original_certificate_id"] is None

    # Document attached to a correction can't be deleted
    assert client.delete(f"/api/documents/{doc['id']}", headers=auth(user_token)).status_code == 409

    # Rejection requires a reason
    assert client.post(f"/api/corrections/{cr['id']}/review", json={"decision": "rejected"},
                       headers=auth(org_token)).status_code == 400
    r = client.post(f"/api/corrections/{cr['id']}/review",
                    json={"decision": "rejected", "comment": "No matching record in our archive."},
                    headers=auth(org_token))
    assert r.json()["status"] == "rejected" and r.json()["corrected_certificate_id"] is None


def test_external_correction_approval_issues_new_certificate(client):
    admin = create_admin(client)
    org_token, org_id = verified_org(client, admin)
    user_token = register_user(client)
    tpl = create_template(client, org_token)
    pdf = make_text_pdf(["Certificate", "This is to certify that Alise Smith completed the course Python Basics."])
    doc = client.post("/api/documents", files={"file": ("old.pdf", pdf, "application/pdf")},
                      headers=auth(user_token)).json()
    cr = client.post("/api/corrections", headers=auth(user_token), json={
        "document_id": doc["id"], "organization_id": org_id,
        "original_fields": {"recipient_name": "Alise Smith", "course_or_role": "Python Basics"},
        "requested_fields": {"recipient_name": "Alice Smith"}, "reason": "Name misspelled on certificate."}).json()

    # Approval without template (no original platform cert) is refused
    assert client.post(f"/api/corrections/{cr['id']}/review", json={"decision": "approved"},
                       headers=auth(org_token)).status_code == 400
    r = client.post(f"/api/corrections/{cr['id']}/review", json={"decision": "approved", "template_id": tpl["id"]},
                    headers=auth(org_token))
    assert r.status_code == 200, r.text
    v = client.get(f"/api/verify/{r.json()['corrected_certificate_number']}").json()
    assert v["result"] == "valid" and v["recipient_name"] == "Alice Smith" and v["course_or_role"] == "Python Basics"


def test_cancel_and_revoke(client):
    admin = create_admin(client)
    org_token, org_id = verified_org(client, admin)
    user_token = register_user(client)
    tpl = create_template(client, org_token)
    cert = _issue(client, org_token, tpl["id"])

    pdf = make_text_pdf(["Certificate", f"Certificate No: {cert['certificate_number']}"])
    doc = client.post("/api/documents", files={"file": ("c.pdf", pdf, "application/pdf")},
                      headers=auth(user_token)).json()
    cr = client.post("/api/corrections", headers=auth(user_token), json={
        "document_id": doc["id"], "original_certificate_number": cert["certificate_number"],
        "requested_fields": {"course_or_role": "Full Stack Development"}, "reason": "Course title is wrong."}).json()
    r = client.post(f"/api/corrections/{cr['id']}/cancel", headers=auth(user_token))
    assert r.json()["status"] == "cancelled"

    r = client.post(f"/api/certificates/{cert['id']}/revoke", json={"reason": "Issued in error"},
                    headers=auth(org_token))
    assert r.status_code == 200 and r.json()["status"] == "revoked"
    v = client.get(f"/api/verify/{cert['certificate_number']}").json()
    assert v["result"] == "revoked" and v["revocation_reason"] == "Issued in error"
    # Revoked certificates cannot be corrected
    r = client.post("/api/corrections", headers=auth(user_token), json={
        "document_id": doc["id"], "original_certificate_number": cert["certificate_number"],
        "requested_fields": {"course_or_role": "X"}, "reason": "Course title is wrong."})
    assert r.status_code == 409


def test_template_preview_and_logo(client):
    import io
    from PIL import Image
    admin = create_admin(client)
    org_token, org_id = verified_org(client, admin)
    buf = io.BytesIO()
    Image.new("RGB", (200, 80), "navy").save(buf, format="PNG")
    r = client.post("/api/organizations/me/logo", files={"file": ("logo.png", buf.getvalue(), "image/png")},
                    headers=auth(org_token))
    assert r.status_code == 200 and r.json()["has_logo"]
    assert client.get(f"/api/organizations/{org_id}/logo").status_code == 200
    tpl = create_template(client, org_token, layout={"orientation": "portrait", "border_style": "ornate",
                                                     "primary_color": "#112233"})
    p = client.get(f"/api/templates/{tpl['id']}/preview", headers=auth(org_token))
    assert p.status_code == 200 and p.content.startswith(b"%PDF")
    assert "PREVIEW" in "".join(pg.get_text() for pg in fitz.open(stream=p.content, filetype="pdf"))
    bad = client.post("/api/templates", json={"name": "Bad", "body_text": "x has done it",
                                              "layout": {"primary_color": "red"}}, headers=auth(org_token))
    assert bad.status_code == 422
