"""Heuristic certificate field extraction from OCR text.

Returns candidate values with a heuristic confidence score (0-1). Users always review and
edit the values before they are used in a correction request.
"""
import re
from datetime import date, datetime

MONTHS = "jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec|january|february|march|april|june|july|" \
         "august|september|october|november|december"

DATE_PATTERNS = [
    re.compile(r"\b(\d{4})-(\d{1,2})-(\d{1,2})\b"),                                    # 2024-03-12
    re.compile(r"\b(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})\b"),                          # 12/03/2024
    re.compile(rf"\b(\d{{1,2}})(?:st|nd|rd|th)?\s+({MONTHS})\.?,?\s+(\d{{4}})\b", re.I),  # 12 March 2024
    re.compile(rf"\b({MONTHS})\.?\s+(\d{{1,2}})(?:st|nd|rd|th)?,?\s+(\d{{4}})\b", re.I),  # March 12, 2024
]

ORG_KEYWORDS = re.compile(
    r"\b(university|institute|institution|college|academy|school|ltd|limited|inc|incorporated|corporation|"
    r"corp|technologies|technology|foundation|pvt|llc|company|solutions|labs|association|society|council|"
    r"organization|organisation|centre|center)\b", re.I)

NAME_TRIGGERS = re.compile(
    r"(?:this\s+is\s+to\s+certify\s+that|certify\s+that|certifies\s+that|awarded\s+to|presented\s+to|"
    r"granted\s+to|conferred\s+(?:up)?on|is\s+hereby\s+awarded\s+to|proudly\s+presented\s+to)\s*[:\-]?\s*",
    re.I)
NAME_STOP = re.compile(r"\s+(has|have|for|who|of|is|was|on|in|with|from|successfully)\b.*$", re.I)
HONORIFIC = re.compile(r"^(mr|mrs|ms|miss|dr|prof)\.?\s+", re.I)

COURSE_PATTERNS = [
    re.compile(r"(?:successfully\s+)?complet(?:ed|ing|ion\s+of)\s+(?:the\s+|an?\s+)?(?:course|program(?:me)?|"
               r"training|internship|workshop)?\s*(?:on|in|of|as|titled|entitled)?\s*[\"']?([^\n.\"']{3,120})", re.I),
    re.compile(r"(?:participat(?:ed|ion)|attended|attending)\s+(?:in\s+)?(?:the\s+)?([^\n.]{3,120})", re.I),
    re.compile(r"(?:worked|working|served|employed)\s+(?:with\s+us\s+)?as\s+(?:an?\s+)?([^\n.]{3,80})", re.I),
    re.compile(r"(?:in\s+recognition\s+of|for\s+(?:outstanding|excellence\s+in))\s+([^\n.]{3,120})", re.I),
]

CERT_NO_PATTERNS = [
    re.compile(r"\b(CFX-\d{4}-[A-Z0-9]{8})\b"),
    re.compile(r"(?:certificate|cert\.?|credential|serial|registration|reg\.?)\s*(?:no\.?|number|id|#|code)\s*"
               r"[:\-#]?\s*([A-Z0-9][A-Z0-9\-/]{3,39})", re.I),
]

CATEGORY_KEYWORDS = [
    ("Internship Certificate", ("internship", "intern ")),
    ("Experience Certificate", ("experience", "employment", "worked as", "served as")),
    ("Workshop Certificate", ("workshop",)),
    ("Training Certificate", ("training",)),
    ("Achievement Certificate", ("achievement", "excellence", "award", "merit", "winner")),
    ("Participation Certificate", ("participation", "participated", "attended")),
    ("Course Completion Certificate", ("course", "completion", "completed")),
]


def _field(value: str | None, confidence: float) -> dict:
    return {"value": value, "confidence": round(confidence, 2) if value else 0.0}


def _parse_date(match: re.Match, pattern_index: int) -> date | None:
    g = match.groups()
    try:
        if pattern_index == 0:
            return date(int(g[0]), int(g[1]), int(g[2]))
        if pattern_index == 1:
            a, b, y = int(g[0]), int(g[1]), int(g[2])
            # Prefer day-first; fall back to month-first when day-first is impossible.
            try:
                return date(y, b, a)
            except ValueError:
                return date(y, a, b)
        if pattern_index == 2:
            return datetime.strptime(f"{g[0]} {g[1][:3]} {g[2]}", "%d %b %Y").date()
        if pattern_index == 3:
            return datetime.strptime(f"{g[1]} {g[0][:3]} {g[2]}", "%d %b %Y").date()
    except ValueError:
        return None
    return None


def find_dates(text: str) -> list[tuple[int, date, str]]:
    found: dict[int, tuple[int, date, str]] = {}
    for idx, pat in enumerate(DATE_PATTERNS):
        for m in pat.finditer(text):
            d = _parse_date(m, idx)
            if d and 1950 <= d.year <= 2100 and m.start() not in found:
                found[m.start()] = (m.start(), d, m.group(0))
    return sorted(found.values(), key=lambda t: t[0])


def _clean_name(raw: str) -> str | None:
    raw = NAME_STOP.sub("", raw.strip())
    raw = HONORIFIC.sub("", raw)
    raw = re.sub(r"[^A-Za-z.'\- ]", "", raw).strip(" .-")
    words = raw.split()
    if not 1 <= len(words) <= 6 or len(raw) < 3:
        return None
    if raw.isupper() or raw.islower():
        raw = " ".join(w.capitalize() for w in words)
    return raw


def _lines(text: str) -> list[str]:
    return [ln.strip() for ln in text.splitlines() if ln.strip()]


def extract_fields(text: str) -> dict:
    text = text or ""
    lines = _lines(text)
    flat = re.sub(r"[ \t]+", " ", text)
    fields: dict[str, dict] = {}

    # Certificate number
    cert_no = None
    for i, pat in enumerate(CERT_NO_PATTERNS):
        m = pat.search(flat)
        if m:
            cert_no = (m.group(1).strip(), 0.95 if i == 0 else 0.75)
            break
    fields["certificate_number"] = _field(*(cert_no or (None, 0)))

    # Title
    title = next((ln for ln in lines if re.search(r"\bcertificate\b", ln, re.I) and len(ln) <= 80
                  and not re.search(r"(no\.?|number|id)\s*[:#]", ln, re.I)), None)
    fields["title"] = _field(title.title() if title and title.isupper() else title, 0.8)

    # Recipient name: text following a trigger phrase on the same line, else on the next line
    name = None
    for i, ln in enumerate(lines):
        m = NAME_TRIGGERS.search(ln)
        if not m:
            continue
        rest = ln[m.end():]
        name = _clean_name(rest) if rest.strip() else None
        if not name and i + 1 < len(lines):
            name = _clean_name(lines[i + 1])
        if name:
            break
    fields["recipient_name"] = _field(name, 0.8)

    # Course / role
    course = None
    for pat in COURSE_PATTERNS:
        m = pat.search(flat)
        if m:
            candidate = re.split(r"\s+(?:from|between|during|held|conducted|at|with|on\s+\d)\b", m.group(1),
                                 flags=re.I)[0].strip(" ,:-")
            if len(candidate) >= 3:
                course = candidate
                break
    fields["course_or_role"] = _field(course, 0.6)

    # Organization
    org = next((ln for ln in lines if ORG_KEYWORDS.search(ln) and len(ln) <= 100
                and not NAME_TRIGGERS.search(ln)), None)
    fields["organization_name"] = _field(org, 0.6)

    # Dates
    dates = find_dates(flat)
    start = end = issue = None
    range_m = re.search(r"from\s+(.{6,30}?)\s+(?:to|till|until|-)\s+(.{6,30}?)(?:[.,\n]|$)", flat, re.I)
    if range_m:
        s = [d for pos, d, _ in dates if range_m.start(1) <= pos < range_m.end(1)]
        e = [d for pos, d, _ in dates if range_m.start(2) <= pos < range_m.end(2)]
        start = s[0] if s else None
        end = e[0] if e else None
    issue_m = re.search(r"(?:date\s+of\s+issue|issued\s+on|issue\s+date|dated|date)\s*[:\-]?\s*", flat, re.I)
    if issue_m:
        after = [d for pos, d, _ in dates if pos >= issue_m.end() and pos - issue_m.end() < 5]
        issue = after[0] if after else None
    if issue is None and dates:
        candidates = [d for _, d, _ in dates if d not in (start, end)]
        issue = candidates[-1] if candidates else None
    fields["start_date"] = _field(start.isoformat() if start else None, 0.7)
    fields["end_date"] = _field(end.isoformat() if end else None, 0.7)
    fields["issue_date"] = _field(issue.isoformat() if issue else None, 0.65)

    # Category guess
    low = flat.lower()
    category = next((cat for cat, kws in CATEGORY_KEYWORDS if any(k in low for k in kws)), None)
    fields["detected_category"] = _field(category, 0.5)

    return fields
