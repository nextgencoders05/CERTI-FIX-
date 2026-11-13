"""Authorized certificate PDF rendering (ReportLab) with QR verification code."""
import io
import re
from dataclasses import dataclass, field
from datetime import date
from xml.sax.saxutils import escape

import qrcode
from reportlab.lib.colors import HexColor, white
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.utils import ImageReader
from reportlab.platypus import Frame, Paragraph
from reportlab.pdfgen import canvas

FONT_BOLD = {"Helvetica": "Helvetica-Bold", "Times-Roman": "Times-Bold", "Courier": "Courier-Bold"}
PLACEHOLDER = re.compile(r"\{(\w+)\}")


@dataclass
class CertificateRenderData:
    certificate_number: str
    organization_name: str
    title_text: str
    body_text: str
    recipient_name: str
    verify_url: str
    issue_date: date
    course_or_role: str | None = None
    description: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    category: str | None = None
    extra_fields: dict = field(default_factory=dict)
    layout: dict = field(default_factory=dict)
    logo_bytes: bytes | None = None
    supersedes_number: str | None = None
    data_hash: str = ""
    is_preview: bool = False


def _fmt_date(d: date | None) -> str:
    return d.strftime("%d %B %Y") if d else ""


def render_body(template: str, values: dict) -> str:
    """Replace {placeholder} tokens with values. Unknown tokens become empty strings.

    Only simple word placeholders are supported (no attribute/index access), which keeps
    template rendering safe for organization-provided text.
    """
    def repl(match: re.Match) -> str:
        val = values.get(match.group(1))
        return "" if val is None else str(val)

    return re.sub(r"\s{2,}", " ", PLACEHOLDER.sub(repl, template)).strip()


def _qr_image(url: str) -> ImageReader:
    qr = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_M, box_size=8, border=1)
    qr.add_data(url)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    return ImageReader(buf)


def _draw_border(c: canvas.Canvas, w: float, h: float, style: str, primary, accent) -> None:
    if style == "none":
        return
    c.setStrokeColor(primary)
    c.setLineWidth(3)
    c.rect(18, 18, w - 36, h - 36)
    if style in ("double", "ornate"):
        c.setStrokeColor(accent)
        c.setLineWidth(1)
        c.rect(28, 28, w - 56, h - 56)
    if style == "ornate":
        c.setFillColor(accent)
        for x, y in ((28, 28), (w - 28, 28), (28, h - 28), (w - 28, h - 28)):
            c.circle(x, y, 6, stroke=0, fill=1)


def generate_certificate_pdf(data: CertificateRenderData) -> bytes:
    layout = data.layout or {}
    orientation = layout.get("orientation", "landscape")
    page = landscape(A4) if orientation == "landscape" else A4
    w, h = page
    primary = HexColor(layout.get("primary_color", "#1E3A8A"))
    accent = HexColor(layout.get("accent_color", "#7C3AED"))
    font = layout.get("font", "Helvetica")
    if font not in FONT_BOLD:
        font = "Helvetica"
    bold = FONT_BOLD[font]

    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=page)
    c.setTitle(f"{data.title_text} - {data.recipient_name}")
    c.setAuthor(data.organization_name)
    c.setSubject(f"Certificate {data.certificate_number}")
    c.setCreator("CertiFix AI")
    c.setKeywords([data.certificate_number])

    c.setFillColor(white)
    c.rect(0, 0, w, h, stroke=0, fill=1)
    _draw_border(c, w, h, layout.get("border_style", "double"), primary, accent)

    y = h - 70
    # Logo
    if layout.get("show_logo", True) and data.logo_bytes:
        try:
            logo = ImageReader(io.BytesIO(data.logo_bytes))
            iw, ih = logo.getSize()
            max_h, max_w = 60, 160
            scale = min(max_h / ih, max_w / iw)
            lw, lh = iw * scale, ih * scale
            c.drawImage(logo, (w - lw) / 2, y - lh + 20, lw, lh, mask="auto")
            y -= lh + 4
        except Exception:
            pass  # a broken logo must never block issuing

    c.setFillColor(primary)
    c.setFont(bold, 16)
    c.drawCentredString(w / 2, y, data.organization_name.upper())
    y -= 50

    c.setFont(bold, 34 if orientation == "landscape" else 28)
    c.drawCentredString(w / 2, y, data.title_text)
    y -= 22
    c.setStrokeColor(accent)
    c.setLineWidth(2)
    c.line(w / 2 - 80, y, w / 2 + 80, y)
    y -= 36

    c.setFillColor(HexColor("#374151"))
    c.setFont(font, 14)
    c.drawCentredString(w / 2, y, "This is to certify that")
    y -= 44

    c.setFillColor(accent)
    name_size = 30
    while c.stringWidth(data.recipient_name, bold, name_size) > w - 160 and name_size > 14:
        name_size -= 1
    c.setFont(bold, name_size)
    c.drawCentredString(w / 2, y, data.recipient_name)
    y -= 14
    c.setStrokeColor(HexColor("#D1D5DB"))
    c.setLineWidth(0.8)
    c.line(w / 2 - 200, y, w / 2 + 200, y)
    y -= 12

    values = {
        "recipient_name": data.recipient_name,
        "course_or_role": data.course_or_role or "",
        "description": data.description or "",
        "start_date": _fmt_date(data.start_date),
        "end_date": _fmt_date(data.end_date),
        "issue_date": _fmt_date(data.issue_date),
        "organization_name": data.organization_name,
        "category": data.category or "",
        "certificate_number": data.certificate_number,
        **{k: v for k, v in (data.extra_fields or {}).items() if isinstance(k, str)},
    }
    body = render_body(data.body_text, values)
    style = ParagraphStyle("body", fontName=font, fontSize=13, leading=19, alignment=TA_CENTER,
                           textColor=HexColor("#374151"))
    paras = [Paragraph(escape(body), style)]
    if data.description and "{description}" not in data.body_text:
        paras.append(Paragraph(escape(data.description), ParagraphStyle(
            "desc", parent=style, fontSize=11, leading=15, textColor=HexColor("#6B7280"))))
    frame_h = 90
    Frame(90, y - frame_h, w - 180, frame_h, showBoundary=0, leftPadding=0, rightPadding=0,
          topPadding=0, bottomPadding=0).addFromList(paras, c)

    # Footer block
    base = 70
    c.setFillColor(HexColor("#111827"))
    c.setFont(font, 10)
    c.drawString(60, base + 36, f"Issue date: {_fmt_date(data.issue_date)}")
    c.drawString(60, base + 22, f"Certificate ID: {data.certificate_number}")
    c.setFillColor(HexColor("#6B7280"))
    c.setFont(font, 7)
    c.drawString(60, base + 8, f"Integrity hash: {data.data_hash[:32]}")

    sig_name = layout.get("signatory_name")
    sig_title = layout.get("signatory_title")
    if sig_name or sig_title:
        c.setStrokeColor(HexColor("#9CA3AF"))
        c.line(w / 2 - 90, base + 40, w / 2 + 90, base + 40)
        c.setFillColor(HexColor("#111827"))
        c.setFont(bold, 11)
        c.drawCentredString(w / 2, base + 26, sig_name or "")
        c.setFont(font, 9)
        c.drawCentredString(w / 2, base + 13, sig_title or "")

    if layout.get("show_qr", True):
        qr_size = 74
        c.drawImage(_qr_image(data.verify_url), w - 60 - qr_size, base - 10, qr_size, qr_size)
        c.setFont(font, 7)
        c.setFillColor(HexColor("#6B7280"))
        c.drawCentredString(w - 60 - qr_size / 2, base - 20, "Scan to verify")

    c.setFont(font, 8)
    c.setFillColor(HexColor("#6B7280"))
    c.drawCentredString(w / 2, 38, f"Verify authenticity at {data.verify_url}")

    if data.supersedes_number:
        c.setFillColor(accent)
        c.setFont(bold, 8)
        c.drawCentredString(w / 2, 50, f"Corrected re-issue authorized by {data.organization_name}. "
                                       f"Supersedes certificate {data.supersedes_number}, which is no longer valid.")

    if data.is_preview:
        c.saveState()
        c.setFillColor(HexColor("#EF4444"))
        c.setFillAlpha(0.15)
        c.setFont(bold, 90)
        c.translate(w / 2, h / 2)
        c.rotate(30)
        c.drawCentredString(0, 0, "PREVIEW")
        c.restoreState()

    c.showPage()
    c.save()
    return buf.getvalue()
