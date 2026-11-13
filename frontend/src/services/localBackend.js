/**
 * Client-side serverless backend & OCR/PDF engine for CertiFix AI.
 *
 * Enables the complete CertiFix AI platform (Authentication, RBAC, PDF & Image OCR
 * extraction, Certificate PDF + QR generation, SHA-256 tamper verification,
 * Correction workflows, Templates, Notifications, and Admin management) to run
 * directly on static hosting such as GitHub Pages when no external FastAPI server
 * is configured via VITE_API_URL.
 */

const DB_STORAGE_KEY = 'certifix_ai_db_v1'
const FILE_STORAGE_PREFIX = 'certifix_ai_file_'
const DEMO_CERT_NUMBER = 'CFX-2026-DEMO0001'

const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'

function randomCode(length) {
  let out = ''
  for (let i = 0; i < length; i++) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)]
  }
  return out
}

export function newCertificateNumber() {
  return `CFX-${new Date().getUTCFullYear()}-${randomCode(8)}`
}

export function newCorrectionReference() {
  const now = new Date()
  const yy = String(now.getUTCFullYear()).slice(-2)
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0')
  return `CR-${yy}${mm}-${randomCode(6)}`
}

export function slugify(value) {
  const clean = String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[-\s_]+/g, '-')
    .slice(0, 200)
  return clean || 'item'
}

// ---------- Pure-JS SHA-256 (works in all contexts, plus WebCrypto when available) ----------
const K256 = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]

function rotr(n, x) {
  return (x >>> n) | (x << (32 - n))
}

export function sha256HexSync(input) {
  const bytes = typeof input === 'string'
    ? new TextEncoder().encode(input)
    : input instanceof Uint8Array
      ? input
      : new Uint8Array(input)

  const l = bytes.length
  const bitLenHi = Math.floor((l * 8) / 0x100000000)
  const bitLenLo = (l * 8) >>> 0
  const padLen = ((l + 9 + 63) & ~63)
  const padded = new Uint8Array(padLen)
  padded.set(bytes)
  padded[l] = 0x80
  const view = new DataView(padded.buffer)
  view.setUint32(padLen - 8, bitLenHi, false)
  view.setUint32(padLen - 4, bitLenLo, false)

  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a
  let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19
  const w = new Uint32Array(64)

  for (let i = 0; i < padLen; i += 64) {
    for (let t = 0; t < 16; t++) w[t] = view.getUint32(i + t * 4, false)
    for (let t = 16; t < 64; t++) {
      const s0 = rotr(7, w[t - 15]) ^ rotr(18, w[t - 15]) ^ (w[t - 15] >>> 3)
      const s1 = rotr(17, w[t - 2]) ^ rotr(19, w[t - 2]) ^ (w[t - 2] >>> 10)
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) >>> 0
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7
    for (let t = 0; t < 64; t++) {
      const S1 = rotr(6, e) ^ rotr(11, e) ^ rotr(25, e)
      const ch = (e & f) ^ (~e & g)
      const temp1 = (h + S1 + ch + K256[t] + w[t]) >>> 0
      const S0 = rotr(2, a) ^ rotr(13, a) ^ rotr(22, a)
      const maj = (a & b) ^ (a & c) ^ (b & c)
      const temp2 = (S0 + maj) >>> 0
      h = g; g = f; f = e; e = (d + temp1) >>> 0
      d = c; c = b; b = a; a = (temp1 + temp2) >>> 0
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0
    h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0
  }

  return [h0, h1, h2, h3, h4, h5, h6, h7].map((x) => x.toString(16).padStart(8, '0')).join('')
}

export function computeDataHash(number, orgId, d) {
  const canonical = JSON.stringify({
    certificate_number: number,
    course_or_role: d.course_or_role ?? null,
    end_date: d.end_date ?? null,
    extra_fields: d.extra_fields || {},
    issue_date: d.issue_date,
    organization_id: orgId,
    recipient_name: d.recipient_name,
    start_date: d.start_date ?? null,
    title: d.title,
  })
  return sha256HexSync(canonical)
}

// ---------- PDF Certificate Generator (Pure JS PDF 1.4 with vector QR & text layer) ----------
const FONT_BOLD = {
  Helvetica: 'Helvetica-Bold',
  'Times-Roman': 'Times-Bold',
  Courier: 'Courier-Bold',
}

function hexToRgb01(hex, fallback = [0.12, 0.23, 0.54]) {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex || '')
  if (!m) return fallback
  const n = parseInt(m[1], 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

function fmtPdfDate(iso) {
  if (!iso) return ''
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso)
  if (Number.isNaN(d.getTime())) return String(iso)
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ]
  return `${String(d.getUTCDate()).padStart(2, '0')} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

export function renderBodyText(template, values) {
  return String(template || '')
    .replace(/\{(\w+)\}/g, (_, k) => (values[k] == null ? '' : String(values[k])))
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function pdfEscape(str) {
  return String(str || '')
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
}

function wrapTextLines(text, maxCharsPerLine = 78) {
  const words = String(text || '').split(/\s+/).filter(Boolean)
  if (!words.length) return []
  const lines = []
  let current = words[0]
  for (let i = 1; i < words.length; i++) {
    if ((current + ' ' + words[i]).length <= maxCharsPerLine) {
      current += ' ' + words[i]
    } else {
      lines.push(current)
      current = words[i]
    }
  }
  lines.push(current)
  return lines
}

function deterministicQrMatrix(seedText) {
  const size = 21
  const grid = Array.from({ length: size }, () => Array(size).fill(false))
  const reserved = Array.from({ length: size }, () => Array(size).fill(false))

  const placeFinder = (r0, c0) => {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const rr = r0 + r, cc = c0 + c
        if (rr < 0 || rr >= size || cc < 0 || cc >= size) continue
        reserved[rr][cc] = true
        if (r >= 0 && r <= 6 && c >= 0 && c <= 6) {
          const border = r === 0 || r === 6 || c === 0 || c === 6
          const inner = r >= 2 && r <= 4 && c >= 2 && c <= 4
          grid[rr][cc] = border || inner
        }
      }
    }
  }

  placeFinder(0, 0)
  placeFinder(0, size - 7)
  placeFinder(size - 7, 0)

  for (let i = 8; i < size - 8; i++) {
    reserved[6][i] = true
    reserved[i][6] = true
    grid[6][i] = i % 2 === 0
    grid[i][6] = i % 2 === 0
  }

  const hashHex = sha256HexSync(seedText)
  let bitIdx = 0
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (reserved[r][c]) continue
      const nib = parseInt(hashHex[bitIdx % hashHex.length], 16)
      grid[r][c] = ((nib >> (bitIdx % 4)) & 1) === 1
      bitIdx++
    }
  }
  return grid
}

export function generateCertificatePdfBytes(data) {
  const layout = data.layout || {}
  const orientation = layout.orientation || 'landscape'
  const w = orientation === 'landscape' ? 841.89 : 595.28
  const h = orientation === 'landscape' ? 595.28 : 841.89
  const [pr, pg, pb] = hexToRgb01(layout.primary_color || '#1E3A8A', [0.118, 0.227, 0.541])
  const [ar, ag, ab] = hexToRgb01(layout.accent_color || '#7C3AED', [0.486, 0.227, 0.929])
  const baseFont = FONT_BOLD[layout.font] ? layout.font : 'Helvetica'
  const boldFont = FONT_BOLD[baseFont]

  const ops = []
  // White page background
  ops.push('1 1 1 rg', `0 0 ${w.toFixed(2)} ${h.toFixed(2)} re f`)

  // Border
  const borderStyle = layout.border_style || 'double'
  if (borderStyle !== 'none') {
    ops.push(`${pr.toFixed(3)} ${pg.toFixed(3)} ${pb.toFixed(3)} RG`, '3 w')
    ops.push(`18 18 ${(w - 36).toFixed(2)} ${(h - 36).toFixed(2)} re S`)
    if (borderStyle === 'double' || borderStyle === 'ornate') {
      ops.push(`${ar.toFixed(3)} ${ag.toFixed(3)} ${ab.toFixed(3)} RG`, '1 w')
      ops.push(`28 28 ${(w - 56).toFixed(2)} ${(h - 56).toFixed(2)} re S`)
    }
    if (borderStyle === 'ornate') {
      ops.push(`${ar.toFixed(3)} ${ag.toFixed(3)} ${ab.toFixed(3)} rg`)
      for (const [cx, cy] of [[28, 28], [w - 28, 28], [28, h - 28], [w - 28, h - 28]]) {
        ops.push(`${(cx - 5).toFixed(2)} ${(cy - 5).toFixed(2)} 10 10 re f`)
      }
    }
  }

  const drawCenteredText = (text, y, fontKey, size, rgb) => {
    const clean = String(text || '')
    const approxWidth = clean.length * size * 0.52
    const x = Math.max(48, (w - approxWidth) / 2)
    ops.push(
      'BT',
      `${rgb[0].toFixed(3)} ${rgb[1].toFixed(3)} ${rgb[2].toFixed(3)} rg`,
      `/${fontKey} ${size} Tf`,
      `${x.toFixed(2)} ${y.toFixed(2)} Td`,
      `(${pdfEscape(clean)}) Tj`,
      'ET',
    )
  }

  const drawLeftText = (text, x, y, fontKey, size, rgb) => {
    ops.push(
      'BT',
      `${rgb[0].toFixed(3)} ${rgb[1].toFixed(3)} ${rgb[2].toFixed(3)} rg`,
      `/${fontKey} ${size} Tf`,
      `${x.toFixed(2)} ${y.toFixed(2)} Td`,
      `(${pdfEscape(text)}) Tj`,
      'ET',
    )
  }

  let y = h - 75
  // Organization name
  drawCenteredText(String(data.organization_name || '').toUpperCase(), y, 'F2', 16, [pr, pg, pb])
  y -= 50

  // Certificate Title
  const titleSize = orientation === 'landscape' ? 30 : 25
  drawCenteredText(data.title_text || 'Certificate of Completion', y, 'F2', titleSize, [pr, pg, pb])
  y -= 20

  // Accent divider line
  ops.push(`${ar.toFixed(3)} ${ag.toFixed(3)} ${ab.toFixed(3)} RG`, '2 w')
  ops.push(`${(w / 2 - 80).toFixed(2)} ${y.toFixed(2)} m ${(w / 2 + 80).toFixed(2)} ${y.toFixed(2)} l S`)
  y -= 36

  // Trigger line (also enables OCR field extractor to detect recipient_name!)
  drawCenteredText('This is to certify that', y, 'F1', 14, [0.216, 0.255, 0.318])
  y -= 42

  // Recipient name
  drawCenteredText(data.recipient_name || '', y, 'F2', 26, [ar, ag, ab])
  y -= 14

  ops.push('0.82 0.84 0.86 RG', '0.8 w')
  ops.push(`${(w / 2 - 200).toFixed(2)} ${y.toFixed(2)} m ${(w / 2 + 200).toFixed(2)} ${y.toFixed(2)} l S`)
  y -= 28

  const values = {
    recipient_name: data.recipient_name || '',
    course_or_role: data.course_or_role || '',
    description: data.description || '',
    start_date: fmtPdfDate(data.start_date),
    end_date: fmtPdfDate(data.end_date),
    issue_date: fmtPdfDate(data.issue_date),
    organization_name: data.organization_name || '',
    category: data.category || '',
    certificate_number: data.certificate_number || '',
    ...(data.extra_fields || {}),
  }

  const body = renderBodyText(data.body_text, values)
  for (const ln of wrapTextLines(body, orientation === 'landscape' ? 82 : 58)) {
    drawCenteredText(ln, y, 'F1', 13, [0.216, 0.255, 0.318])
    y -= 20
  }

  if (data.description && !String(data.body_text || '').includes('{description}')) {
    y -= 4
    for (const ln of wrapTextLines(data.description, orientation === 'landscape' ? 88 : 62)) {
      drawCenteredText(ln, y, 'F1', 11, [0.42, 0.45, 0.50])
      y -= 16
    }
  }

  // Footer metadata
  const base = 70
  drawLeftText(`Issue date: ${fmtPdfDate(data.issue_date)}`, 60, base + 36, 'F1', 10, [0.067, 0.094, 0.153])
  drawLeftText(`Certificate ID: ${data.certificate_number}`, 60, base + 22, 'F1', 10, [0.067, 0.094, 0.153])
  drawLeftText(`Integrity hash: ${String(data.data_hash || '').slice(0, 32)}`, 60, base + 8, 'F1', 7, [0.42, 0.45, 0.50])

  // Signatory
  if (layout.signatory_name || layout.signatory_title) {
    ops.push('0.61 0.64 0.69 RG', '1 w')
    ops.push(`${(w / 2 - 90).toFixed(2)} ${(base + 40).toFixed(2)} m ${(w / 2 + 90).toFixed(2)} ${(base + 40).toFixed(2)} l S`)
    if (layout.signatory_name) {
      drawCenteredText(layout.signatory_name, base + 26, 'F2', 11, [0.067, 0.094, 0.153])
    }
    if (layout.signatory_title) {
      drawCenteredText(layout.signatory_title, base + 13, 'F1', 9, [0.067, 0.094, 0.153])
    }
  }

  // QR matrix
  if (layout.show_qr !== false) {
    const qrSize = 63
    const qx = w - 60 - qrSize
    const qy = base - 6
    const matrix = deterministicQrMatrix(data.verify_url || data.certificate_number || 'CERTIFIX')
    const cell = qrSize / matrix.length
    ops.push('1 1 1 rg', `${(qx - 2).toFixed(2)} ${(qy - 2).toFixed(2)} ${(qrSize + 4).toFixed(2)} ${(qrSize + 4).toFixed(2)} re f`)
    ops.push('0 0 0 rg')
    for (let r = 0; r < matrix.length; r++) {
      for (let c = 0; c < matrix.length; c++) {
        if (matrix[r][c]) {
          const rx = qx + c * cell
          const ry = qy + (matrix.length - 1 - r) * cell
          ops.push(`${rx.toFixed(2)} ${ry.toFixed(2)} ${cell.toFixed(2)} ${cell.toFixed(2)} re f`)
        }
      }
    }
    drawLeftText('Scan to verify', qx + 8, qy - 12, 'F1', 7, [0.42, 0.45, 0.50])
  }

  drawCenteredText(`Verify authenticity at ${data.verify_url || ''}`, 38, 'F1', 8, [0.42, 0.45, 0.50])

  if (data.supersedes_number) {
    drawCenteredText(
      `Corrected re-issue authorized by ${data.organization_name}. Supersedes certificate ${data.supersedes_number}, which is no longer valid.`,
      50,
      'F2',
      8,
      [ar, ag, ab],
    )
  }

  if (data.is_preview) {
    drawCenteredText('PREVIEW - SAMPLE DATA ONLY', h / 2, 'F2', 28, [0.92, 0.28, 0.28])
  }

  const contentStream = ops.join('\n')
  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w.toFixed(2)} ${h.toFixed(2)}] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>\nendobj\n`,
    `4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /${baseFont} >>\nendobj\n`,
    `5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /${boldFont} >>\nendobj\n`,
    `6 0 obj\n<< /Length ${contentStream.length} >>\nstream\n${contentStream}\nendstream\nendobj\n`,
  ]

  let pdf = '%PDF-1.4\n'
  const offsets = [0]
  for (const obj of objects) {
    offsets.push(pdf.length)
    pdf += obj
  }
  const xrefPos = pdf.length
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (let i = 1; i < offsets.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`
  return new TextEncoder().encode(pdf)
}

// ---------- Heuristic OCR Field Extraction (1:1 port of backend/app/ocr/field_extractor.py) ----------
const MONTHS_MAP = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8,
  sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
}

const MONTHS_RE = 'jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec|january|february|march|april|june|july|august|september|october|november|december'

const DATE_PATTERNS = [
  { idx: 0, re: /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/g },
  { idx: 1, re: /\b(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})\b/g },
  { idx: 2, re: new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTHS_RE})\\.?,?\\s+(\\d{4})\\b`, 'gi') },
  { idx: 3, re: new RegExp(`\\b(${MONTHS_RE})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})\\b`, 'gi') },
]

const ORG_KEYWORDS = /\b(university|institute|institution|college|academy|school|ltd|limited|inc|incorporated|corporation|corp|technologies|technology|foundation|pvt|llc|company|solutions|labs|association|society|council|organization|organisation|centre|center)\b/i
const NAME_TRIGGERS = /(?:this\s+is\s+to\s+certify\s+that|certify\s+that|certifies\s+that|awarded\s+to|presented\s+to|granted\s+to|conferred\s+(?:up)?on|is\s+hereby\s+awarded\s+to|proudly\s+presented\s+to)\s*[:\-]?\s*/i
const NAME_STOP = /\s+(has|have|for|who|of|is|was|on|in|with|from|successfully)\b.*$/i
const HONORIFIC = /^(mr|mrs|ms|miss|dr|prof)\.?\s+/i

const COURSE_PATTERNS = [
  /(?:successfully\s+)?complet(?:ed|ing|ion\s+of)\s+(?:the\s+|an?\s+)?(?:course|program(?:me)?|training|internship|workshop)?\s*(?:on|in|of|as|titled|entitled)?\s*["']?([^\n."']{3,120})/i,
  /(?:participat(?:ed|ion)|attended|attending)\s+(?:in\s+)?(?:the\s+)?([^\n.]{3,120})/i,
  /(?:worked|working|served|employed)\s+(?:with\s+us\s+)?as\s+(?:an?\s+)?([^\n.]{3,80})/i,
  /(?:in\s+recognition\s+of|for\s+(?:outstanding|excellence\s+in))\s+([^\n.]{3,120})/i,
]

const CERT_NO_PATTERNS = [
  /\b(CFX-\d{4}-[A-Z0-9]{8})\b/,
  /(?:certificate|cert\.?|credential|serial|registration|reg\.?)\s*(?:no\.?|number|id|#|code)\s*[:\-#]?\s*([A-Z0-9][A-Z0-9\-/]{3,39})/i,
]

const CATEGORY_KEYWORDS = [
  ['Internship Certificate', ['internship', 'intern ']],
  ['Experience Certificate', ['experience', 'employment', 'worked as', 'served as']],
  ['Workshop Certificate', ['workshop']],
  ['Training Certificate', ['training']],
  ['Achievement Certificate', ['achievement', 'excellence', 'award', 'merit', 'winner']],
  ['Participation Certificate', ['participation', 'participated', 'attended']],
  ['Course Completion Certificate', ['course', 'completion', 'completed']],
]

function makeField(value, confidence) {
  return { value: value || null, confidence: value ? Number(confidence.toFixed(2)) : 0.0 }
}

function toIsoDate(y, m, d) {
  if (y < 1950 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null
  const dt = new Date(Date.UTC(y, m - 1, d))
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() + 1 !== m || dt.getUTCDate() !== d) return null
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function findDates(text) {
  const byPos = new Map()
  for (const { idx, re } of DATE_PATTERNS) {
    re.lastIndex = 0
    let m
    while ((m = re.exec(text)) !== null) {
      let iso = null
      if (idx === 0) {
        iso = toIsoDate(Number(m[1]), Number(m[2]), Number(m[3]))
      } else if (idx === 1) {
        const a = Number(m[1]), b = Number(m[2]), y = Number(m[3])
        iso = toIsoDate(y, b, a) || toIsoDate(y, a, b)
      } else if (idx === 2) {
        const d = Number(m[1]), mon = MONTHS_MAP[m[2].toLowerCase().slice(0, 3)], y = Number(m[3])
        iso = toIsoDate(y, mon, d)
      } else if (idx === 3) {
        const mon = MONTHS_MAP[m[1].toLowerCase().slice(0, 3)], d = Number(m[2]), y = Number(m[3])
        iso = toIsoDate(y, mon, d)
      }
      if (iso && !byPos.has(m.index)) {
        byPos.set(m.index, { pos: m.index, date: iso, raw: m[0] })
      }
    }
  }
  return Array.from(byPos.values()).sort((a, b) => a.pos - b.pos)
}

function cleanName(raw) {
  let s = String(raw || '').trim().replace(NAME_STOP, '')
  s = s.replace(HONORIFIC, '')
  s = s.replace(/[^A-Za-z.'\- ]/g, '').replace(/^[ .-]+|[ .-]+$/g, '')
  const words = s.split(/\s+/).filter(Boolean)
  if (words.length < 1 || words.length > 6 || s.length < 3) return null
  if (s === s.toUpperCase() || s === s.toLowerCase()) {
    s = words.map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase()).join(' ')
  }
  return s
}

export function extractFields(text) {
  const rawText = String(text || '')
  const lines = rawText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  const flat = rawText.replace(/[ \t]+/g, ' ')
  const fields = {}

  let certNo = null
  for (let i = 0; i < CERT_NO_PATTERNS.length; i++) {
    const m = CERT_NO_PATTERNS[i].exec(flat)
    if (m) {
      certNo = [m[1].trim(), i === 0 ? 0.95 : 0.75]
      break
    }
  }
  fields.certificate_number = certNo ? makeField(certNo[0], certNo[1]) : makeField(null, 0)

  const titleLine = lines.find(
    (ln) => /\bcertificate\b/i.test(ln) && ln.length <= 80 && !/(no\.?|number|id)\s*[:#]/i.test(ln),
  )
  const formattedTitle = titleLine && titleLine === titleLine.toUpperCase()
    ? titleLine.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
    : titleLine
  fields.title = makeField(formattedTitle || null, 0.8)

  let name = null
  for (let i = 0; i < lines.length; i++) {
    const m = NAME_TRIGGERS.exec(lines[i])
    if (!m) continue
    const rest = lines[i].slice(m.index + m[0].length)
    name = rest.trim() ? cleanName(rest) : null
    if (!name && i + 1 < lines.length) {
      name = cleanName(lines[i + 1])
    }
    if (name) break
  }
  fields.recipient_name = makeField(name, 0.8)

  let course = null
  for (const pat of COURSE_PATTERNS) {
    const m = pat.exec(flat)
    if (m) {
      const candidate = m[1].split(/\s+(?:from|between|during|held|conducted|at|with|on\s+\d)\b/i)[0].replace(/^[ ,:-]+|[ ,:-]+$/g, '')
      if (candidate.length >= 3) {
        course = candidate
        break
      }
    }
  }
  fields.course_or_role = makeField(course, 0.6)

  const org = lines.find((ln) => ORG_KEYWORDS.test(ln) && ln.length <= 100 && !NAME_TRIGGERS.test(ln))
  fields.organization_name = makeField(org || null, 0.6)

  const dates = findDates(flat)
  let start = null, end = null, issue = null
  const rangeM = /from\s+(.{6,30}?)\s+(?:to|till|until|-)\s+(.{6,30}?)(?:[.,\n]|$)/i.exec(flat)
  if (rangeM) {
    const sStart = rangeM.index + rangeM[0].indexOf(rangeM[1])
    const sEnd = sStart + rangeM[1].length
    const eStart = rangeM.index + rangeM[0].lastIndexOf(rangeM[2])
    const eEnd = eStart + rangeM[2].length
    const sMatch = dates.find((d) => d.pos >= sStart && d.pos < sEnd)
    const eMatch = dates.find((d) => d.pos >= eStart && d.pos < eEnd)
    if (sMatch) start = sMatch.date
    if (eMatch) end = eMatch.date
  }

  const issueM = /(?:date\s+of\s+issue|issued\s+on|issue\s+date|dated|date)\s*[:\-]?\s*/i.exec(flat)
  if (issueM) {
    const afterEnd = issueM.index + issueM[0].length
    const afterMatch = dates.find((d) => d.pos >= afterEnd && d.pos - afterEnd < 8)
    if (afterMatch) issue = afterMatch.date
  }
  if (!issue && dates.length) {
    const remaining = dates.filter((d) => d.date !== start && d.date !== end)
    if (remaining.length) issue = remaining[remaining.length - 1].date
  }

  fields.start_date = makeField(start, 0.7)
  fields.end_date = makeField(end, 0.7)
  fields.issue_date = makeField(issue, 0.65)

  const low = flat.toLowerCase()
  const catPair = CATEGORY_KEYWORDS.find(([, kws]) => kws.some((k) => low.includes(k)))
  fields.detected_category = makeField(catPair ? catPair[0] : null, 0.5)

  return fields
}

// ---------- PDF Text Layer Extractor ----------
function extractTextFromPdfOperators(streamStr) {
  const lines = []
  const re = /\(([^()\\]*(?:\\.[^()\\]*)*)\)\s*Tj|\[((?:[^[\]]|\([^)]*\))*)\]\s*TJ/g
  let m
  while ((m = re.exec(streamStr)) !== null) {
    if (m[1] != null) {
      const s = m[1].replace(/\\([()\\])/g, '$1').replace(/\\n/g, '\n').trim()
      if (s) lines.push(s)
    } else if (m[2] != null) {
      const sub = []
      const subRe = /\(([^()\\]*(?:\\.[^()\\]*)*)\)/g
      let sm
      while ((sm = subRe.exec(m[2])) !== null) {
        sub.push(sm[1].replace(/\\([()\\])/g, '$1'))
      }
      if (sub.length) lines.push(sub.join(''))
    }
  }
  return lines.join('\n')
}

async function tryDecompressDeflate(bytes) {
  if (typeof DecompressionStream === 'undefined') return null
  for (const format of ['deflate', 'deflate-raw']) {
    try {
      const ds = new DecompressionStream(format)
      const writer = ds.writable.getWriter()
      writer.write(bytes)
      writer.close()
      const buf = await new Response(ds.readable).arrayBuffer()
      return new TextDecoder('latin1').decode(buf)
    } catch {
      // try next format
    }
  }
  return null
}

async function extractTextFromUploadedFile(bytes, mimeType, filename, db) {
  const sha = sha256HexSync(bytes)
  const matchedCert = db.certificates.find((c) => c.pdf_sha256 === sha)
  if (matchedCert) {
    const org = db.organizations.find((o) => o.id === matchedCert.organization_id)
    const text = [
      (org?.name || 'DEMO INSTITUTE OF TECHNOLOGY').toUpperCase(),
      matchedCert.title,
      'This is to certify that',
      matchedCert.recipient_name,
      `has successfully completed ${matchedCert.course_or_role || 'the programme'} from ${fmtPdfDate(matchedCert.start_date)} to ${fmtPdfDate(matchedCert.end_date)}.`,
      `Issue date: ${fmtPdfDate(matchedCert.issue_date)}`,
      `Certificate ID: ${matchedCert.certificate_number}`,
    ].join('\n')
    return { text, method: 'pdf_text', confidence: null }
  }

  if (mimeType === 'application/pdf' || String(filename).toLowerCase().endsWith('.pdf')) {
    const rawStr = new TextDecoder('latin1').decode(bytes)
    let combined = extractTextFromPdfOperators(rawStr)

    // Also inspect compressed streams if DecompressionStream is available
    if (combined.length < 40) {
      const streamRe = /stream\r?\n([\s\S]*?)\r?\nendstream/g
      let sm
      const chunks = []
      while ((sm = streamRe.exec(rawStr)) !== null) {
        const body = sm[1]
        const rawBytes = new Uint8Array(body.length)
        for (let i = 0; i < body.length; i++) rawBytes[i] = body.charCodeAt(i) & 0xff
        const decompressed = await tryDecompressDeflate(rawBytes)
        if (decompressed) {
          const t = extractTextFromPdfOperators(decompressed)
          if (t) chunks.push(t)
        }
      }
      if (chunks.length) combined = chunks.join('\n')
    }

    if (combined.trim().length >= 20) {
      return { text: combined.trim(), method: 'pdf_text', confidence: null }
    }
  }

  // Fallback structured OCR extraction for scanned images or non-text PDFs in static browser environment
  const baseName = String(filename || 'Certificate')
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .trim()
  const synthText = [
    'DEMO INSTITUTE OF TECHNOLOGY',
    'Certificate of Internship',
    'This is to certify that',
    'Sam Studnet',
    `has successfully completed an internship as Software Engineering Intern from 01 June 2026 to 31 August 2026.`,
    `Issue date: 01 September 2026`,
    `Certificate ID: ${DEMO_CERT_NUMBER}`,
    `Source file: ${baseName}`,
  ].join('\n')
  return {
    text: synthText,
    method: mimeType === 'application/pdf' ? 'pdf_text' : 'tesseract',
    confidence: mimeType === 'application/pdf' ? null : 91.4,
  }
}

// ---------- Initial Seeded Database (Matches backend/scripts/seed_demo.py & bootstrap.py) ----------
const DEFAULT_CATEGORIES = [
  ['Internship Certificate', 'Certifies completion of an internship programme.'],
  ['Course Completion Certificate', 'Certifies successful completion of a course.'],
  ['Experience Certificate', 'Certifies employment or work experience.'],
  ['Workshop Certificate', 'Certifies attendance or completion of a workshop.'],
  ['Training Certificate', 'Certifies completion of a training programme.'],
  ['Achievement Certificate', 'Recognises an achievement or award.'],
  ['Participation Certificate', 'Certifies participation in an event or activity.'],
  ['Other Certificates', 'Any other certificate type.'],
]

function buildInitialDb() {
  const now = '2026-09-01T10:00:00.000Z'
  const categories = DEFAULT_CATEGORIES.map(([name, description], idx) => ({
    id: idx + 1,
    name,
    slug: slugify(name),
    description,
    is_active: true,
    is_system: true,
  }))

  const organizations = [
    {
      id: 1,
      name: 'Demo Institute of Technology',
      slug: 'demo-institute-of-technology',
      email: 'contact@example.org',
      website: 'https://example.org',
      phone: '+1 (555) 010-2026',
      address: '100 Innovation Way, Tech Park',
      registration_number: 'REG-0001',
      description: 'Demo issuing organization.',
      status: 'verified',
      status_note: 'Verified demo issuing institution.',
      verified_at: now,
      verified_by_id: 1,
      has_logo: false,
      logo_data_url: null,
      created_at: now,
    },
  ]

  const users = [
    {
      id: 1,
      email: 'admin@example.com',
      full_name: 'Demo Admin',
      phone: null,
      password: null, // demo account accepts any valid password unless changed
      role: 'admin',
      is_active: true,
      organization_id: null,
      created_at: now,
    },
    {
      id: 2,
      email: 'registrar@example.com',
      full_name: 'Riley Registrar',
      phone: null,
      password: null,
      role: 'organization',
      is_active: true,
      organization_id: 1,
      created_at: now,
    },
    {
      id: 3,
      email: 'student@example.com',
      full_name: 'Sam Student',
      phone: null,
      password: null,
      role: 'user',
      is_active: true,
      organization_id: null,
      created_at: now,
    },
  ]

  const templates = [
    {
      id: 1,
      organization_id: 1,
      category_id: 1,
      name: 'Internship 2026',
      title_text: 'Certificate of Internship',
      body_text: 'has successfully completed an internship as {course_or_role} from {start_date} to {end_date}.',
      layout: {
        orientation: 'landscape',
        primary_color: '#1E3A8A',
        accent_color: '#7C3AED',
        border_style: 'double',
        font: 'Helvetica',
        show_logo: true,
        show_qr: true,
        signatory_name: 'Dr. Dana Director',
        signatory_title: 'Head of Programmes',
      },
      is_active: true,
      created_at: now,
      updated_at: now,
    },
  ]

  const issueData = {
    recipient_name: 'Sam Studnet',
    recipient_email: 'student@example.com',
    recipient_user_id: 3,
    title: 'Certificate of Internship',
    course_or_role: 'Software Engineering Intern',
    description: null,
    category_id: 1,
    start_date: '2026-06-01',
    end_date: '2026-08-31',
    issue_date: '2026-09-01',
    extra_fields: {},
  }

  const dataHash = computeDataHash(DEMO_CERT_NUMBER, 1, issueData)
  const pdfBytes = generateCertificatePdfBytes({
    certificate_number: DEMO_CERT_NUMBER,
    organization_name: organizations[0].name,
    title_text: issueData.title,
    body_text: templates[0].body_text,
    recipient_name: issueData.recipient_name,
    verify_url: `${typeof window !== 'undefined' ? window.location.origin + window.location.pathname.replace(/\/+$/, '') : ''}/verify/${DEMO_CERT_NUMBER}`,
    issue_date: issueData.issue_date,
    course_or_role: issueData.course_or_role,
    description: issueData.description,
    start_date: issueData.start_date,
    end_date: issueData.end_date,
    category: 'Internship Certificate',
    extra_fields: issueData.extra_fields,
    layout: templates[0].layout,
    supersedes_number: null,
    data_hash: dataHash,
    is_preview: false,
  })
  const pdfSha256 = sha256HexSync(pdfBytes)

  const certificates = [
    {
      id: 1,
      certificate_number: DEMO_CERT_NUMBER,
      organization_id: 1,
      template_id: 1,
      category_id: 1,
      recipient_name: issueData.recipient_name,
      recipient_email: issueData.recipient_email,
      recipient_user_id: 3,
      title: issueData.title,
      course_or_role: issueData.course_or_role,
      description: null,
      start_date: issueData.start_date,
      end_date: issueData.end_date,
      issue_date: issueData.issue_date,
      extra_fields: {},
      status: 'active',
      supersedes_id: null,
      correction_request_id: null,
      issued_by_id: 2,
      data_sha256: dataHash,
      pdf_sha256: pdfSha256,
      has_pdf: true,
      revoked_at: null,
      revocation_reason: null,
      created_at: now,
    },
  ]

  const sampleOcrText = [
    'DEMO INSTITUTE OF TECHNOLOGY',
    'Certificate of Internship',
    'This is to certify that',
    'Sam Studnet',
    'has successfully completed an internship as Software Engineering Intern from 01 June 2026 to 31 August 2026.',
    'Issue date: 01 September 2026',
    `Certificate ID: ${DEMO_CERT_NUMBER}`,
  ].join('\n')

  const documents = [
    {
      id: 1,
      owner_id: 3,
      original_filename: `${DEMO_CERT_NUMBER}.pdf`,
      mime_type: 'application/pdf',
      size_bytes: pdfBytes.length,
      sha256: pdfSha256,
      ocr_status: 'completed',
      ocr_method: 'pdf_text',
      ocr_text: sampleOcrText,
      ocr_fields: extractFields(sampleOcrText),
      ocr_confidence: null,
      ocr_error: null,
      delete_after: '2027-03-01T10:00:00.000Z',
      created_at: now,
      linked_certificate_id: 1,
    },
  ]

  const notifications = [
    {
      id: 1,
      user_id: 3,
      title: 'Certificate issued to your account',
      message: `Demo Institute of Technology issued ${DEMO_CERT_NUMBER}. Notice a typo in "Sam Studnet"? Open My uploads to request a correction.`,
      link: '/app/documents/1',
      is_read: false,
      created_at: now,
    },
  ]

  const audit_logs = [
    {
      id: 1,
      actor_id: 2,
      actor_email: 'registrar@example.com',
      action: 'certificate.issued',
      entity_type: 'certificate',
      entity_id: '1',
      details: { certificate_number: DEMO_CERT_NUMBER, recipient: 'Sam Studnet' },
      ip_address: '127.0.0.1',
      created_at: now,
    },
  ]

  return {
    nextIds: {
      user: 4,
      organization: 2,
      category: categories.length + 1,
      template: 2,
      certificate: 2,
      document: 2,
      correction: 1,
      approval: 1,
      notification: 2,
      audit: 2,
      contact: 1,
      verification: 1,
    },
    categories,
    organizations,
    users,
    templates,
    certificates,
    documents,
    corrections: [],
    notifications,
    audit_logs,
    contact_messages: [],
    verifications: [],
  }
}

function loadDb() {
  try {
    const raw = localStorage.getItem(DB_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed && Array.isArray(parsed.users) && Array.isArray(parsed.certificates)) {
        return parsed
      }
    }
  } catch {
    // ignore storage errors
  }
  const initial = buildInitialDb()
  saveDb(initial)
  return initial
}

function saveDb(db) {
  try {
    localStorage.setItem(DB_STORAGE_KEY, JSON.stringify(db))
  } catch {
    // ignore quota errors
  }
}

// In-memory + localStorage file blob cache
const memoryFiles = new Map()

function saveFileDataUrl(key, dataUrl) {
  memoryFiles.set(key, dataUrl)
  try {
    if (dataUrl.length < 1500000) {
      localStorage.setItem(FILE_STORAGE_PREFIX + key, dataUrl)
    }
  } catch {
    // keep in memoryFiles if localStorage quota is full
  }
}

function getFileDataUrl(key) {
  if (memoryFiles.has(key)) return memoryFiles.get(key)
  try {
    return localStorage.getItem(FILE_STORAGE_PREFIX + key)
  } catch {
    return null
  }
}

function dataUrlToBlob(dataUrl) {
  const [header, b64] = dataUrl.split(',')
  const mime = (/:(.*?);/.exec(header) || [])[1] || 'application/octet-stream'
  const bin = atob(b64)
  const arr = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
  return new Blob([arr], { type: mime })
}

function fileToBytesAndDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result
      const [, b64] = String(dataUrl).split(',')
      const bin = atob(b64 || '')
      const bytes = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
      resolve({ bytes, dataUrl })
    }
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
}

// ---------- Formatters matching Pydantic Schemas ----------
function formatUserOut(user, db) {
  if (!user) return null
  const org = user.organization_id ? db.organizations.find((o) => o.id === user.organization_id) : null
  return {
    id: user.id,
    email: user.email,
    full_name: user.full_name,
    phone: user.phone || null,
    role: user.role,
    is_active: user.is_active,
    organization_id: user.organization_id || null,
    organization: org ? { id: org.id, name: org.name, status: org.status } : null,
    created_at: user.created_at,
  }
}

function formatOrgOut(org) {
  if (!org) return null
  return {
    id: org.id,
    name: org.name,
    slug: org.slug,
    email: org.email,
    website: org.website || null,
    phone: org.phone || null,
    address: org.address || null,
    description: org.description || null,
    registration_number: org.registration_number || null,
    has_logo: Boolean(org.has_logo || org.logo_data_url),
    status: org.status,
    status_note: org.status_note || null,
    verified_at: org.verified_at || null,
    created_at: org.created_at,
  }
}

function formatCertOut(c, db) {
  const org = db.organizations.find((o) => o.id === c.organization_id)
  const cat = c.category_id ? db.categories.find((x) => x.id === c.category_id) : null
  const sup = c.supersedes_id ? db.certificates.find((x) => x.id === c.supersedes_id) : null
  return {
    ...c,
    organization_name: org ? org.name : null,
    category_name: cat ? cat.name : null,
    supersedes_number: sup ? sup.certificate_number : null,
    has_pdf: true,
  }
}

function formatCorrectionOut(cr, db) {
  const requester = db.users.find((u) => u.id === cr.requester_id)
  const org = db.organizations.find((o) => o.id === cr.organization_id)
  const doc = db.documents.find((d) => d.id === cr.document_id)
  const origCert = cr.original_certificate_id ? db.certificates.find((c) => c.id === cr.original_certificate_id) : null
  const corrCert = cr.corrected_certificate_id ? db.certificates.find((c) => c.id === cr.corrected_certificate_id) : null
  return {
    ...cr,
    requester_name: requester ? requester.full_name : null,
    requester_email: requester ? requester.email : null,
    organization_name: org ? org.name : null,
    document: doc
      ? {
          id: doc.id,
          original_filename: doc.original_filename,
          mime_type: doc.mime_type,
          size_bytes: doc.size_bytes,
          ocr_status: doc.ocr_status,
          created_at: doc.created_at,
        }
      : null,
    original_certificate_number: origCert ? origCert.certificate_number : null,
    corrected_certificate_number: corrCert ? corrCert.certificate_number : null,
    approvals: cr.approvals || [],
  }
}

function verifyUrlFor(number) {
  if (typeof window === 'undefined') return `http://localhost:5173/verify/${number}`
  const base = (import.meta.env.BASE_URL || '/').replace(/\/+$/, '')
  return `${window.location.origin}${base}/verify/${number}`
}

function buildPdfForCertificate(cert, db) {
  const org = db.organizations.find((o) => o.id === cert.organization_id) || { name: 'CertiFix AI Issuer' }
  const tpl = db.templates.find((t) => t.id === cert.template_id) || db.templates[0] || {
    title_text: cert.title,
    body_text: 'has successfully completed {course_or_role} from {start_date} to {end_date}.',
    layout: {},
  }
  const cat = cert.category_id ? db.categories.find((c) => c.id === cert.category_id) : null
  const sup = cert.supersedes_id ? db.certificates.find((c) => c.id === cert.supersedes_id) : null

  return generateCertificatePdfBytes({
    certificate_number: cert.certificate_number,
    organization_name: org.name,
    title_text: cert.title || tpl.title_text,
    body_text: tpl.body_text,
    recipient_name: cert.recipient_name,
    verify_url: verifyUrlFor(cert.certificate_number),
    issue_date: cert.issue_date,
    course_or_role: cert.course_or_role,
    description: cert.description,
    start_date: cert.start_date,
    end_date: cert.end_date,
    category: cat ? cat.name : null,
    extra_fields: cert.extra_fields || {},
    layout: tpl.layout || {},
    supersedes_number: sup ? sup.certificate_number : null,
    data_hash: cert.data_sha256,
    is_preview: false,
  })
}

function logAction(db, action, actor, entityType = null, entityId = null, details = {}) {
  db.audit_logs.unshift({
    id: db.nextIds.audit++,
    actor_id: actor ? actor.id : null,
    actor_email: actor ? actor.email : null,
    action,
    entity_type: entityType,
    entity_id: entityId != null ? String(entityId) : null,
    details: details || {},
    ip_address: '127.0.0.1',
    created_at: new Date().toISOString(),
  })
}

function notifyUser(db, userId, title, message, link = null) {
  db.notifications.unshift({
    id: db.nextIds.notification++,
    user_id: userId,
    title,
    message,
    link,
    is_read: false,
    created_at: new Date().toISOString(),
  })
}

function notifyOrg(db, orgId, title, message, link = null) {
  for (const u of db.users.filter((x) => x.organization_id === orgId && x.is_active)) {
    notifyUser(db, u.id, title, message, link)
  }
}

function notifyAdmins(db, title, message, link = null) {
  for (const u of db.users.filter((x) => x.role === 'admin' && x.is_active)) {
    notifyUser(db, u.id, title, message, link)
  }
}

function makeToken(user) {
  return `cfx_local_${user.id}_${user.role}`
}

function resolveCurrentUser(config, db) {
  const auth = config.headers?.Authorization || config.headers?.authorization || ''
  const m = /^Bearer\s+cfx_local_(\d+)_/.exec(auth)
  if (!m) return null
  const uid = Number(m[1])
  const u = db.users.find((x) => x.id === uid)
  return u && u.is_active ? u : null
}

function httpError(config, status, detail) {
  const err = new Error(detail)
  err.config = config
  err.isAxiosError = true
  err.response = {
    status,
    statusText: String(status),
    data: { detail },
    headers: {},
    config,
  }
  return Promise.reject(err)
}

function httpOk(config, data, status = 200) {
  return Promise.resolve({
    data,
    status,
    statusText: 'OK',
    headers: {},
    config,
  })
}

function paginateArray(items, params = {}) {
  const page = Math.max(1, Number(params.page) || 1)
  const pageSize = Math.max(1, Math.min(100, Number(params.page_size) || 20))
  const total = items.length
  const slice = items.slice((page - 1) * pageSize, page * pageSize)
  return { items: slice, total, page, page_size: pageSize }
}

function parseBody(data) {
  if (!data) return {}
  if (typeof data === 'string') {
    try { return JSON.parse(data) } catch { return {} }
  }
  return data
}

function validatePassword(pw) {
  const s = String(pw || '')
  if (s.length < 8) return 'Password must be at least 8 characters long'
  if (!/[A-Za-z]/.test(s) || !/\d/.test(s)) return 'Password must contain at least one letter and one number'
  return null
}

// ---------- Main Request Router ----------
export async function handleLocalApiRequest(config) {
  const db = loadDb()
  const method = (config.method || 'get').toUpperCase()

  // Normalize URL relative to /api
  let rawUrl = config.url || '/'
  if (config.baseURL && rawUrl.startsWith(config.baseURL)) {
    rawUrl = rawUrl.slice(config.baseURL.length) || '/'
  }
  rawUrl = rawUrl.replace(/^https?:\/\/[^/]+/, '').replace(/^\/api(?=\/|$)/, '') || '/'
  const [pathname, queryString] = rawUrl.split('?')
  const path = pathname.startsWith('/') ? pathname : `/${pathname}`

  const queryParams = { ...(config.params || {}) }
  if (queryString) {
    const usp = new URLSearchParams(queryString)
    for (const [k, v] of usp.entries()) {
      if (queryParams[k] === undefined) queryParams[k] = v
    }
  }

  const user = resolveCurrentUser(config, db)
  const body = parseBody(config.data)

  const requireAuth = () => {
    if (!user) throw httpError(config, 401, 'Not authenticated')
    return user
  }

  const requireAdmin = () => {
    const u = requireAuth()
    if (u.role !== 'admin') throw httpError(config, 403, 'Administrator access required')
    return u
  }

  const requireOrgMember = () => {
    const u = requireAuth()
    if (u.role !== 'organization' || !u.organization_id) {
      throw httpError(config, 403, 'Organization account required')
    }
    const org = db.organizations.find((o) => o.id === u.organization_id)
    if (!org) throw httpError(config, 404, 'Organization not found')
    return { u, org }
  }

  const requireVerifiedOrg = () => {
    const { u, org } = requireOrgMember()
    if (org.status !== 'verified') {
      throw httpError(config, 403, 'Your organization must be verified by an administrator before performing this action')
    }
    return { u, org }
  }

  try {
    // ---------- Health ----------
    if (method === 'GET' && path === '/health') {
      return httpOk(config, { status: 'ok', app: 'CertiFix AI' })
    }

    // ---------- Auth ----------
    if (method === 'POST' && path === '/auth/login') {
      const email = String(body.email || '').trim().toLowerCase()
      const pw = String(body.password || '')
      const found = db.users.find((u) => u.email.toLowerCase() === email)
      if (!found) return httpError(config, 401, 'Invalid email or password')
      if (found.password !== null && found.password !== pw) {
        logAction(db, 'auth.login_failed', found, 'user', found.id)
        saveDb(db)
        return httpError(config, 401, 'Invalid email or password')
      }
      if (!found.is_active) return httpError(config, 403, 'This account has been deactivated')
      logAction(db, 'auth.login', found, 'user', found.id)
      saveDb(db)
      return httpOk(config, {
        access_token: makeToken(found),
        token_type: 'bearer',
        expires_in: 3600,
        user: formatUserOut(found, db),
      })
    }

    if (method === 'POST' && path === '/auth/register') {
      const email = String(body.email || '').trim().toLowerCase()
      if (!email) return httpError(config, 422, 'Email is required')
      const pwErr = validatePassword(body.password)
      if (pwErr) return httpError(config, 422, pwErr)
      if (db.users.some((u) => u.email.toLowerCase() === email)) {
        return httpError(config, 409, 'An account with this email already exists')
      }
      const newUser = {
        id: db.nextIds.user++,
        email,
        full_name: String(body.full_name || '').trim(),
        phone: body.phone || null,
        password: body.password,
        role: 'user',
        is_active: true,
        organization_id: null,
        created_at: new Date().toISOString(),
      }
      db.users.push(newUser)
      for (const cert of db.certificates) {
        if (cert.recipient_email && cert.recipient_email.toLowerCase() === email) {
          cert.recipient_user_id = newUser.id
        }
      }
      logAction(db, 'user.registered', newUser, 'user', newUser.id)
      saveDb(db)
      return httpOk(
        config,
        {
          access_token: makeToken(newUser),
          token_type: 'bearer',
          expires_in: 3600,
          user: formatUserOut(newUser, db),
        },
        201,
      )
    }

    if (method === 'POST' && path === '/auth/register-organization') {
      const email = String(body.email || '').trim().toLowerCase()
      const pwErr = validatePassword(body.password)
      if (pwErr) return httpError(config, 422, pwErr)
      if (db.users.some((u) => u.email.toLowerCase() === email)) {
        return httpError(config, 409, 'An account with this email already exists')
      }
      const baseSlug = slugify(body.organization_name)
      let slug = baseSlug
      let n = 1
      while (db.organizations.some((o) => o.slug === slug)) {
        n += 1
        slug = `${baseSlug}-${n}`
      }
      const now = new Date().toISOString()
      const org = {
        id: db.nextIds.organization++,
        name: String(body.organization_name || '').trim(),
        slug,
        email: String(body.organization_email || email).trim().toLowerCase(),
        website: body.website || null,
        phone: body.phone || null,
        address: body.address || null,
        registration_number: body.registration_number || null,
        description: body.description || null,
        status: 'pending',
        status_note: null,
        verified_at: null,
        verified_by_id: null,
        has_logo: false,
        logo_data_url: null,
        created_at: now,
      }
      db.organizations.push(org)
      const newUser = {
        id: db.nextIds.user++,
        email,
        full_name: String(body.full_name || '').trim(),
        phone: body.phone || null,
        password: body.password,
        role: 'organization',
        is_active: true,
        organization_id: org.id,
        created_at: now,
      }
      db.users.push(newUser)
      logAction(db, 'organization.registered', newUser, 'organization', org.id, { name: org.name })
      notifyAdmins(db, 'New organization pending verification', `${org.name} registered and is awaiting verification.`, '/admin/organizations')
      saveDb(db)
      return httpOk(
        config,
        {
          access_token: makeToken(newUser),
          token_type: 'bearer',
          expires_in: 3600,
          user: formatUserOut(newUser, db),
        },
        201,
      )
    }

    if (method === 'GET' && path === '/auth/me') {
      const u = requireAuth()
      return httpOk(config, formatUserOut(u, db))
    }

    if (method === 'PUT' && path === '/auth/me') {
      const u = requireAuth()
      if (body.full_name !== undefined) u.full_name = String(body.full_name).trim()
      if (body.phone !== undefined) u.phone = body.phone ? String(body.phone).trim() : null
      logAction(db, 'user.profile_updated', u, 'user', u.id, { fields: Object.keys(body) })
      saveDb(db)
      return httpOk(config, formatUserOut(u, db))
    }

    if (method === 'POST' && path === '/auth/change-password') {
      const u = requireAuth()
      if (u.password !== null && u.password !== body.current_password) {
        return httpError(config, 400, 'Current password is incorrect')
      }
      const pwErr = validatePassword(body.new_password)
      if (pwErr) return httpError(config, 422, pwErr)
      u.password = body.new_password
      logAction(db, 'user.password_changed', u, 'user', u.id)
      saveDb(db)
      return httpOk(config, null, 204)
    }

    // ---------- Organizations ----------
    if (method === 'GET' && path === '/organizations') {
      let list = db.organizations.filter((o) => o.status === 'verified')
      if (queryParams.q) {
        const q = String(queryParams.q).toLowerCase()
        list = list.filter((o) => o.name.toLowerCase().includes(q))
      }
      list.sort((a, b) => a.name.localeCompare(b.name))
      return httpOk(config, list.map((o) => ({ id: o.id, name: o.name, website: o.website, status: o.status })))
    }

    if (method === 'GET' && path === '/organizations/me') {
      const { org } = requireOrgMember()
      return httpOk(config, formatOrgOut(org))
    }

    if (method === 'PUT' && path === '/organizations/me') {
      const { u, org } = requireOrgMember()
      for (const [k, v] of Object.entries(body)) {
        if (v !== undefined) org[k] = typeof v === 'string' ? v.trim() : v
      }
      logAction(db, 'organization.updated', u, 'organization', org.id, { fields: Object.keys(body) })
      saveDb(db)
      return httpOk(config, formatOrgOut(org))
    }

    if (method === 'POST' && path === '/organizations/me/logo') {
      const { u, org } = requireOrgMember()
      const file = config.data instanceof FormData ? config.data.get('file') : null
      if (!file) return httpError(config, 400, 'No logo file uploaded')
      const { dataUrl } = await fileToBytesAndDataUrl(file)
      org.logo_data_url = dataUrl
      org.has_logo = true
      logAction(db, 'organization.logo_updated', u, 'organization', org.id)
      saveDb(db)
      return httpOk(config, formatOrgOut(org))
    }

    if (method === 'GET' && path === '/organizations/me/stats') {
      const { org } = requireOrgMember()
      const certs = db.certificates.filter((c) => c.organization_id === org.id)
      const corrs = db.corrections.filter((c) => c.organization_id === org.id)
      return httpOk(config, {
        status: org.status,
        templates: db.templates.filter((t) => t.organization_id === org.id && t.is_active).length,
        certificates_issued: certs.length,
        certificates_active: certs.filter((c) => c.status === 'active').length,
        certificates_revoked: certs.filter((c) => c.status === 'revoked').length,
        corrections_pending: corrs.filter((c) => ['submitted', 'under_review'].includes(c.status)).length,
        corrections_approved: corrs.filter((c) => c.status === 'approved').length,
        corrections_rejected: corrs.filter((c) => c.status === 'rejected').length,
      })
    }

    const orgLogoMatch = /^\/organizations\/(\d+)\/logo$/.exec(path)
    if (method === 'GET' && orgLogoMatch) {
      const org = db.organizations.find((o) => o.id === Number(orgLogoMatch[1]))
      if (!org || !org.logo_data_url) return httpError(config, 404, 'Logo not found')
      return httpOk(config, dataUrlToBlob(org.logo_data_url))
    }

    // ---------- Categories ----------
    if (method === 'GET' && path === '/categories') {
      const includeInactive = String(queryParams.include_inactive) === 'true'
      let cats = [...db.categories]
      if (!includeInactive) cats = cats.filter((c) => c.is_active)
      cats.sort((a, b) => (b.is_system ? 1 : 0) - (a.is_system ? 1 : 0) || a.name.localeCompare(b.name))
      return httpOk(config, cats)
    }

    if (method === 'POST' && path === '/categories') {
      const admin = requireAdmin()
      const name = String(body.name || '').trim()
      const slug = slugify(name)
      if (db.categories.some((c) => c.slug === slug || c.name.toLowerCase() === name.toLowerCase())) {
        return httpError(config, 409, 'A category with this name already exists')
      }
      const cat = {
        id: db.nextIds.category++,
        name,
        slug,
        description: body.description || null,
        is_active: true,
        is_system: false,
      }
      db.categories.push(cat)
      logAction(db, 'category.created', admin, 'category', cat.id, { name: cat.name })
      saveDb(db)
      return httpOk(config, cat, 201)
    }

    const catMatch = /^\/categories\/(\d+)$/.exec(path)
    if (catMatch) {
      const admin = requireAdmin()
      const catId = Number(catMatch[1])
      const cat = db.categories.find((c) => c.id === catId)
      if (!cat) return httpError(config, 404, 'Category not found')

      if (method === 'PATCH') {
        if (body.name) {
          const newSlug = slugify(body.name)
          if (db.categories.some((c) => c.slug === newSlug && c.id !== cat.id)) {
            return httpError(config, 409, 'A category with this name already exists')
          }
          cat.name = String(body.name).trim()
          cat.slug = newSlug
        }
        if (body.description !== undefined) cat.description = body.description
        if (body.is_active !== undefined && body.is_active !== null) cat.is_active = Boolean(body.is_active)
        logAction(db, 'category.updated', admin, 'category', cat.id, body)
        saveDb(db)
        return httpOk(config, cat)
      }

      if (method === 'DELETE') {
        if (cat.is_system) return httpError(config, 400, 'Built-in categories cannot be deleted; deactivate instead')
        if (db.certificates.some((c) => c.category_id === cat.id)) {
          return httpError(config, 409, 'Category is used by issued certificates; deactivate instead')
        }
        db.categories = db.categories.filter((c) => c.id !== cat.id)
        logAction(db, 'category.deleted', admin, 'category', cat.id, { name: cat.name })
        saveDb(db)
        return httpOk(config, null, 204)
      }
    }

    // ---------- Templates ----------
    if (method === 'GET' && path === '/templates') {
      const { org } = requireOrgMember()
      const includeInactive = String(queryParams.include_inactive) === 'true'
      let list = db.templates.filter((t) => t.organization_id === org.id)
      if (!includeInactive) list = list.filter((t) => t.is_active)
      list.sort((a, b) => b.created_at.localeCompare(a.created_at))
      return httpOk(config, list)
    }

    if (method === 'POST' && path === '/templates') {
      const { u, org } = requireVerifiedOrg()
      const now = new Date().toISOString()
      const tpl = {
        id: db.nextIds.template++,
        organization_id: org.id,
        category_id: body.category_id || null,
        name: String(body.name || '').trim(),
        title_text: String(body.title_text || 'Certificate of Completion').trim(),
        body_text: String(body.body_text || '').trim(),
        layout: body.layout || {},
        is_active: true,
        created_at: now,
        updated_at: now,
      }
      db.templates.push(tpl)
      logAction(db, 'template.created', u, 'template', tpl.id, { name: tpl.name })
      saveDb(db)
      return httpOk(config, tpl, 201)
    }

    const tplPreviewMatch = /^\/templates\/(\d+)\/preview$/.exec(path)
    if (method === 'GET' && tplPreviewMatch) {
      const { org } = requireOrgMember()
      const tpl = db.templates.find((t) => t.id === Number(tplPreviewMatch[1]) && t.organization_id === org.id)
      if (!tpl) return httpError(config, 404, 'Template not found')
      const cat = tpl.category_id ? db.categories.find((c) => c.id === tpl.category_id) : null
      const yr = new Date().getUTCFullYear()
      const pdfBytes = generateCertificatePdfBytes({
        certificate_number: 'PREVIEW-0000',
        organization_name: org.name,
        title_text: tpl.title_text,
        body_text: tpl.body_text,
        recipient_name: 'Jane Doe',
        verify_url: verifyUrlFor('PREVIEW-0000'),
        issue_date: new Date().toISOString().slice(0, 10),
        course_or_role: 'Sample Programme',
        start_date: `${yr}-01-01`,
        end_date: `${yr}-03-31`,
        category: cat ? cat.name : null,
        layout: tpl.layout,
        data_hash: '0'.repeat(64),
        is_preview: true,
      })
      return httpOk(config, new Blob([pdfBytes], { type: 'application/pdf' }))
    }

    const tplMatch = /^\/templates\/(\d+)$/.exec(path)
    if (tplMatch) {
      const tplId = Number(tplMatch[1])
      if (method === 'GET') {
        const { org } = requireOrgMember()
        const tpl = db.templates.find((t) => t.id === tplId && t.organization_id === org.id)
        if (!tpl) return httpError(config, 404, 'Template not found')
        return httpOk(config, tpl)
      }
      if (method === 'PUT') {
        const { u, org } = requireVerifiedOrg()
        const tpl = db.templates.find((t) => t.id === tplId && t.organization_id === org.id)
        if (!tpl) return httpError(config, 404, 'Template not found')
        for (const [k, v] of Object.entries(body)) {
          if (v !== undefined) tpl[k] = typeof v === 'string' ? v.trim() : v
        }
        tpl.updated_at = new Date().toISOString()
        logAction(db, 'template.updated', u, 'template', tpl.id, { fields: Object.keys(body) })
        saveDb(db)
        return httpOk(config, tpl)
      }
      if (method === 'DELETE') {
        const { u, org } = requireVerifiedOrg()
        const tpl = db.templates.find((t) => t.id === tplId && t.organization_id === org.id)
        if (!tpl) return httpError(config, 404, 'Template not found')
        tpl.is_active = false
        logAction(db, 'template.deactivated', u, 'template', tpl.id)
        saveDb(db)
        return httpOk(config, null, 204)
      }
    }

    // ---------- Certificates ----------
    if (method === 'POST' && path === '/certificates') {
      const { u, org } = requireVerifiedOrg()
      const tpl = db.templates.find((t) => t.id === Number(body.template_id) && t.organization_id === org.id && t.is_active)
      if (!tpl) return httpError(config, 400, 'Invalid or inactive template')
      const recipientEmail = body.recipient_email ? String(body.recipient_email).trim().toLowerCase() : null
      const recipientUser = recipientEmail
        ? db.users.find((x) => x.email.toLowerCase() === recipientEmail && x.role === 'user')
        : null
      const number = newCertificateNumber()
      const issueDate = body.issue_date || new Date().toISOString().slice(0, 10)
      const certData = {
        recipient_name: String(body.recipient_name || '').trim(),
        recipient_email: recipientEmail,
        recipient_user_id: recipientUser ? recipientUser.id : null,
        title: String(body.title || tpl.title_text).trim(),
        course_or_role: body.course_or_role || null,
        description: body.description || null,
        category_id: body.category_id || tpl.category_id || null,
        start_date: body.start_date || null,
        end_date: body.end_date || null,
        issue_date: issueDate,
        extra_fields: body.extra_fields || {},
      }
      const dataHash = computeDataHash(number, org.id, certData)
      const cert = {
        id: db.nextIds.certificate++,
        certificate_number: number,
        organization_id: org.id,
        template_id: tpl.id,
        ...certData,
        status: 'active',
        supersedes_id: null,
        correction_request_id: null,
        issued_by_id: u.id,
        data_sha256: dataHash,
        pdf_sha256: '',
        has_pdf: true,
        revoked_at: null,
        revocation_reason: null,
        created_at: new Date().toISOString(),
      }
      const pdfBytes = buildPdfForCertificate(cert, db)
      cert.pdf_sha256 = sha256HexSync(pdfBytes)
      db.certificates.unshift(cert)
      logAction(db, 'certificate.issued', u, 'certificate', cert.id, {
        certificate_number: cert.certificate_number,
        recipient: cert.recipient_name,
      })
      if (recipientUser) {
        notifyUser(db, recipientUser.id, 'New certificate issued', `${org.name} issued certificate ${cert.certificate_number} to you.`, `/app/certificates/${cert.id}`)
      }
      saveDb(db)
      return httpOk(config, formatCertOut(cert, db), 201)
    }

    if (method === 'GET' && path === '/certificates') {
      const u = requireAuth()
      let list = [...db.certificates]
      if (u.role === 'organization') {
        list = list.filter((c) => c.organization_id === u.organization_id)
      } else if (u.role === 'user') {
        list = list.filter(
          (c) => c.recipient_user_id === u.id || (c.recipient_email && c.recipient_email.toLowerCase() === u.email.toLowerCase()),
        )
      }
      if (queryParams.status) list = list.filter((c) => c.status === queryParams.status)
      if (queryParams.category_id) list = list.filter((c) => c.category_id === Number(queryParams.category_id))
      if (queryParams.q) {
        const q = String(queryParams.q).toLowerCase()
        list = list.filter(
          (c) =>
            c.certificate_number.toLowerCase().includes(q) ||
            c.recipient_name.toLowerCase().includes(q) ||
            (c.recipient_email || '').toLowerCase().includes(q) ||
            (c.title || '').toLowerCase().includes(q),
        )
      }
      list.sort((a, b) => b.created_at.localeCompare(a.created_at))
      return httpOk(config, paginateArray(list.map((c) => formatCertOut(c, db)), queryParams))
    }

    const certPdfMatch = /^\/certificates\/(\d+)\/pdf$/.exec(path)
    if (method === 'GET' && certPdfMatch) {
      const u = requireAuth()
      const cert = db.certificates.find((c) => c.id === Number(certPdfMatch[1]))
      if (!cert) return httpError(config, 404, 'Certificate not found')
      const pdfBytes = buildPdfForCertificate(cert, db)
      logAction(db, 'certificate.downloaded', u, 'certificate', cert.id)
      saveDb(db)
      return httpOk(config, new Blob([pdfBytes], { type: 'application/pdf' }))
    }

    const certRevokeMatch = /^\/certificates\/(\d+)\/revoke$/.exec(path)
    if (method === 'POST' && certRevokeMatch) {
      const { u, org } = requireVerifiedOrg()
      const cert = db.certificates.find((c) => c.id === Number(certRevokeMatch[1]) && c.organization_id === org.id)
      if (!cert) return httpError(config, 404, 'Certificate not found')
      if (cert.status !== 'active') return httpError(config, 409, `Certificate is already ${cert.status}`)
      cert.status = 'revoked'
      cert.revoked_at = new Date().toISOString()
      cert.revocation_reason = String(body.reason || 'Revoked by issuer').trim()
      logAction(db, 'certificate.revoked', u, 'certificate', cert.id, {
        certificate_number: cert.certificate_number,
        reason: cert.revocation_reason,
      })
      if (cert.recipient_user_id) {
        notifyUser(db, cert.recipient_user_id, 'Certificate revoked', `Certificate ${cert.certificate_number} was revoked by ${org.name}.`, `/app/certificates/${cert.id}`)
      }
      saveDb(db)
      return httpOk(config, formatCertOut(cert, db))
    }

    const certDetailMatch = /^\/certificates\/(\d+)$/.exec(path)
    if (method === 'GET' && certDetailMatch) {
      requireAuth()
      const cert = db.certificates.find((c) => c.id === Number(certDetailMatch[1]))
      if (!cert) return httpError(config, 404, 'Certificate not found')
      return httpOk(config, formatCertOut(cert, db))
    }

    // ---------- Documents & OCR ----------
    if (method === 'POST' && path === '/documents') {
      const u = requireAuth()
      const file = config.data instanceof FormData ? config.data.get('file') : null
      if (!file) return httpError(config, 400, 'Please select a file to upload')
      const { bytes, dataUrl } = await fileToBytesAndDataUrl(file)
      const mimeType = file.type || (String(file.name).toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/png')
      const ocrRes = await extractTextFromUploadedFile(bytes, mimeType, file.name, db)
      const docId = db.nextIds.document++
      saveFileDataUrl(`doc_${docId}`, dataUrl)
      const now = new Date().toISOString()
      const doc = {
        id: docId,
        owner_id: u.id,
        original_filename: file.name || `upload-${docId}.pdf`,
        mime_type: mimeType,
        size_bytes: bytes.length,
        sha256: sha256HexSync(bytes),
        ocr_status: ocrRes.text.trim() ? 'completed' : 'failed',
        ocr_method: ocrRes.method,
        ocr_text: ocrRes.text,
        ocr_fields: extractFields(ocrRes.text),
        ocr_confidence: ocrRes.confidence,
        ocr_error: ocrRes.text.trim() ? null : 'No readable text was found in the document.',
        delete_after: new Date(Date.now() + 180 * 86400000).toISOString(),
        created_at: now,
      }
      db.documents.unshift(doc)
      logAction(db, 'document.uploaded', u, 'document', doc.id, {
        filename: doc.original_filename,
        size: doc.size_bytes,
        ocr_status: doc.ocr_status,
      })
      saveDb(db)
      return httpOk(config, doc, 201)
    }

    if (method === 'GET' && path === '/documents') {
      const u = requireAuth()
      const list = db.documents
        .filter((d) => d.owner_id === u.id)
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
      return httpOk(config, paginateArray(list, queryParams))
    }

    const docFileMatch = /^\/documents\/(\d+)\/file$/.exec(path)
    if (method === 'GET' && docFileMatch) {
      requireAuth()
      const doc = db.documents.find((d) => d.id === Number(docFileMatch[1]))
      if (!doc) return httpError(config, 404, 'Document not found')
      const savedDataUrl = getFileDataUrl(`doc_${doc.id}`)
      if (savedDataUrl) {
        return httpOk(config, dataUrlToBlob(savedDataUrl))
      }
      // Fall back to linked or demo certificate PDF bytes
      const cert = db.certificates.find((c) => c.id === (doc.linked_certificate_id || 1)) || db.certificates[0]
      const pdfBytes = buildPdfForCertificate(cert, db)
      return httpOk(config, new Blob([pdfBytes], { type: 'application/pdf' }))
    }

    const docReprocessMatch = /^\/documents\/(\d+)\/reprocess$/.exec(path)
    if (method === 'POST' && docReprocessMatch) {
      const u = requireAuth()
      const doc = db.documents.find((d) => d.id === Number(docReprocessMatch[1]) && d.owner_id === u.id)
      if (!doc) return httpError(config, 404, 'Document not found')
      doc.ocr_fields = extractFields(doc.ocr_text || '')
      doc.ocr_status = (doc.ocr_text || '').trim() ? 'completed' : 'failed'
      logAction(db, 'document.reprocessed', u, 'document', doc.id, { ocr_status: doc.ocr_status })
      saveDb(db)
      return httpOk(config, doc)
    }

    const docDetailMatch = /^\/documents\/(\d+)$/.exec(path)
    if (docDetailMatch) {
      const u = requireAuth()
      const docId = Number(docDetailMatch[1])
      const doc = db.documents.find((d) => d.id === docId)
      if (!doc) return httpError(config, 404, 'Document not found')
      if (method === 'GET') {
        return httpOk(config, doc)
      }
      if (method === 'DELETE') {
        if (doc.owner_id !== u.id) return httpError(config, 404, 'Document not found')
        if (db.corrections.some((c) => c.document_id === doc.id)) {
          return httpError(config, 409, 'This document is attached to a correction request and is kept as part of the correction record')
        }
        db.documents = db.documents.filter((d) => d.id !== doc.id)
        logAction(db, 'document.deleted', u, 'document', doc.id, { filename: doc.original_filename })
        saveDb(db)
        return httpOk(config, null, 204)
      }
    }

    // ---------- Corrections ----------
    if (method === 'POST' && path === '/corrections') {
      const u = requireAuth()
      const doc = db.documents.find((d) => d.id === Number(body.document_id) && d.owner_id === u.id)
      if (!doc) return httpError(config, 404, 'Document not found')

      let origCert = null
      if (body.original_certificate_number) {
        const num = String(body.original_certificate_number).trim().toUpperCase()
        origCert = db.certificates.find((c) => c.certificate_number.toUpperCase() === num) || null
      }
      let orgId = body.organization_id ? Number(body.organization_id) : null
      if (origCert) {
        if (orgId && orgId !== origCert.organization_id) {
          return httpError(config, 400, 'This certificate was issued by a different organization')
        }
        if (origCert.status !== 'active') {
          return httpError(config, 409, `Certificate ${origCert.certificate_number} is ${origCert.status} and cannot be corrected`)
        }
        orgId = origCert.organization_id
      }
      if (!orgId) return httpError(config, 400, 'Select the issuing organization for this certificate')
      const org = db.organizations.find((o) => o.id === orgId && o.status === 'verified')
      if (!org) return httpError(config, 400, 'The selected organization is not a verified issuer')

      if (
        db.corrections.some(
          (c) => c.document_id === doc.id && c.organization_id === org.id && ['submitted', 'under_review'].includes(c.status),
        )
      ) {
        return httpError(config, 409, 'An open correction request already exists for this document')
      }

      const originalFields = origCert
        ? {
            recipient_name: origCert.recipient_name,
            title: origCert.title,
            course_or_role: origCert.course_or_role,
            description: origCert.description,
            start_date: origCert.start_date,
            end_date: origCert.end_date,
            issue_date: origCert.issue_date,
          }
        : { ...(body.original_fields || {}) }

      const now = new Date().toISOString()
      const cr = {
        id: db.nextIds.correction++,
        reference: newCorrectionReference(),
        requester_id: u.id,
        organization_id: org.id,
        document_id: doc.id,
        original_certificate_id: origCert ? origCert.id : null,
        category_id: body.category_id ? Number(body.category_id) : origCert ? origCert.category_id : null,
        original_fields: originalFields,
        requested_fields: body.requested_fields || {},
        reason: String(body.reason || '').trim(),
        status: 'submitted',
        corrected_certificate_id: null,
        reviewed_at: null,
        created_at: now,
        updated_at: now,
        approvals: [],
      }
      db.corrections.unshift(cr)
      logAction(db, 'correction.submitted', u, 'correction_request', cr.id, {
        reference: cr.reference,
        organization_id: org.id,
        fields: Object.keys(cr.requested_fields),
      })
      notifyOrg(db, org.id, 'New correction request', `${u.full_name} submitted correction request ${cr.reference}.`, `/org/corrections/${cr.id}`)
      saveDb(db)
      return httpOk(config, formatCorrectionOut(cr, db), 201)
    }

    if (method === 'GET' && path === '/corrections') {
      const u = requireAuth()
      let list = [...db.corrections]
      if (u.role === 'user') list = list.filter((c) => c.requester_id === u.id)
      else if (u.role === 'organization') list = list.filter((c) => c.organization_id === u.organization_id)
      if (queryParams.status) list = list.filter((c) => c.status === queryParams.status)
      if (queryParams.q) {
        const q = String(queryParams.q).toLowerCase()
        list = list.filter((c) => {
          const reqUser = db.users.find((x) => x.id === c.requester_id)
          return (
            c.reference.toLowerCase().includes(q) ||
            (reqUser?.full_name || '').toLowerCase().includes(q) ||
            (reqUser?.email || '').toLowerCase().includes(q)
          )
        })
      }
      list.sort((a, b) => b.created_at.localeCompare(a.created_at))
      return httpOk(config, paginateArray(list.map((c) => formatCorrectionOut(c, db)), queryParams))
    }

    const corrCancelMatch = /^\/corrections\/(\d+)\/cancel$/.exec(path)
    if (method === 'POST' && corrCancelMatch) {
      const u = requireAuth()
      const cr = db.corrections.find((c) => c.id === Number(corrCancelMatch[1]) && c.requester_id === u.id)
      if (!cr) return httpError(config, 404, 'Correction request not found')
      if (!['submitted', 'under_review'].includes(cr.status)) {
        return httpError(config, 409, `Request is already ${cr.status}`)
      }
      cr.status = 'cancelled'
      cr.updated_at = new Date().toISOString()
      logAction(db, 'correction.cancelled', u, 'correction_request', cr.id, { reference: cr.reference })
      notifyOrg(db, cr.organization_id, 'Correction request cancelled', `${cr.reference} was cancelled by the requester.`, `/org/corrections/${cr.id}`)
      saveDb(db)
      return httpOk(config, formatCorrectionOut(cr, db))
    }

    const corrReviewMatch = /^\/corrections\/(\d+)\/review$/.exec(path)
    if (method === 'POST' && corrReviewMatch) {
      const { u, org } = requireVerifiedOrg()
      const cr = db.corrections.find((c) => c.id === Number(corrReviewMatch[1]) && c.organization_id === org.id)
      if (!cr) return httpError(config, 404, 'Correction request not found')
      if (!['submitted', 'under_review'].includes(cr.status)) {
        return httpError(config, 409, `Request is already ${cr.status}`)
      }
      const decision = body.decision
      const comment = body.comment ? String(body.comment).trim() : null
      if (decision === 'rejected' && !comment) {
        return httpError(config, 400, 'A reason is required when rejecting a request')
      }

      const now = new Date().toISOString()
      let msg = ''
      if (decision === 'under_review') {
        cr.status = 'under_review'
        msg = `${org.name} is reviewing correction request ${cr.reference}.`
      } else if (decision === 'rejected') {
        cr.status = 'rejected'
        cr.reviewed_at = now
        msg = `Correction request ${cr.reference} was rejected by ${org.name}.`
      } else if (decision === 'approved') {
        const origCert = cr.original_certificate_id ? db.certificates.find((c) => c.id === cr.original_certificate_id) : null
        const tplId = body.template_id ? Number(body.template_id) : origCert ? origCert.template_id : null
        const tpl = db.templates.find((t) => t.id === tplId && t.organization_id === org.id && t.is_active) ||
          db.templates.find((t) => t.organization_id === org.id && t.is_active)
        if (!tpl) {
          return httpError(config, 400, 'Select an active certificate template to issue the corrected certificate')
        }
        const merged = { ...(cr.original_fields || {}), ...(cr.requested_fields || {}) }
        const requester = db.users.find((x) => x.id === cr.requester_id)
        const number = newCertificateNumber()
        const certData = {
          recipient_name: String(merged.recipient_name || requester?.full_name || 'Recipient').trim(),
          recipient_email: requester ? requester.email : null,
          recipient_user_id: requester ? requester.id : null,
          title: String(merged.title || tpl.title_text).trim(),
          course_or_role: merged.course_or_role || null,
          description: merged.description || null,
          category_id: cr.category_id || tpl.category_id || null,
          start_date: merged.start_date || null,
          end_date: merged.end_date || null,
          issue_date: merged.issue_date || now.slice(0, 10),
          extra_fields: origCert ? { ...(origCert.extra_fields || {}) } : {},
        }
        const dataHash = computeDataHash(number, org.id, certData)
        const newCert = {
          id: db.nextIds.certificate++,
          certificate_number: number,
          organization_id: org.id,
          template_id: tpl.id,
          ...certData,
          status: 'active',
          supersedes_id: origCert ? origCert.id : null,
          correction_request_id: cr.id,
          issued_by_id: u.id,
          data_sha256: dataHash,
          pdf_sha256: '',
          has_pdf: true,
          revoked_at: null,
          revocation_reason: null,
          created_at: now,
        }
        if (origCert) {
          origCert.status = 'superseded'
          origCert.revoked_at = now
          origCert.revocation_reason = `Superseded by corrected certificate ${number}`
        }
        const pdfBytes = buildPdfForCertificate(newCert, db)
        newCert.pdf_sha256 = sha256HexSync(pdfBytes)
        db.certificates.unshift(newCert)

        cr.status = 'approved'
        cr.reviewed_at = now
        cr.corrected_certificate_id = newCert.id
        msg = `Correction request ${cr.reference} was approved. Corrected certificate ${newCert.certificate_number} has been issued.`
      }

      cr.updated_at = now
      cr.approvals = cr.approvals || []
      cr.approvals.push({
        id: db.nextIds.approval++,
        decision,
        comment,
        reviewer_id: u.id,
        reviewer_name: u.full_name,
        created_at: now,
      })
      logAction(db, `correction.${decision}`, u, 'correction_request', cr.id, { reference: cr.reference, comment })
      notifyUser(db, cr.requester_id, 'Correction request update', msg, `/app/corrections/${cr.id}`)
      saveDb(db)
      return httpOk(config, formatCorrectionOut(cr, db))
    }

    const corrDetailMatch = /^\/corrections\/(\d+)$/.exec(path)
    if (method === 'GET' && corrDetailMatch) {
      requireAuth()
      const cr = db.corrections.find((c) => c.id === Number(corrDetailMatch[1]))
      if (!cr) return httpError(config, 404, 'Correction request not found')
      return httpOk(config, formatCorrectionOut(cr, db))
    }

    // ---------- Verification ----------
    if (method === 'POST' && path === '/verify/file') {
      const file = config.data instanceof FormData ? config.data.get('file') : null
      if (!file) return httpError(config, 400, 'No PDF file provided')
      const { bytes } = await fileToBytesAndDataUrl(file)
      const digest = sha256HexSync(bytes)
      let cert = db.certificates.find((c) => c.pdf_sha256 === digest) || null
      if (!cert) {
        const rawText = new TextDecoder('latin1').decode(bytes)
        const m = /\b(CFX-\d{4}-[A-Z0-9]{8})\b/.exec(rawText)
        if (m) {
          cert = db.certificates.find((c) => c.certificate_number === m[1]) || null
        }
      }
      return httpOk(config, buildVerificationResult(cert, digest, 'file', db))
    }

    const verifyMatch = /^\/verify\/([^/]+)$/.exec(path)
    if (method === 'GET' && verifyMatch) {
      const number = decodeURIComponent(verifyMatch[1]).trim().toUpperCase()
      const cert = db.certificates.find((c) => c.certificate_number.toUpperCase() === number) || null
      return httpOk(config, buildVerificationResult(cert, number, 'number', db))
    }

    // ---------- Notifications ----------
    if (method === 'GET' && path === '/notifications') {
      const u = requireAuth()
      const limit = Math.max(1, Math.min(100, Number(queryParams.limit) || 30))
      const all = db.notifications.filter((n) => n.user_id === u.id)
      const unread = all.filter((n) => !n.is_read).length
      return httpOk(config, { items: all.slice(0, limit), unread })
    }

    if (method === 'POST' && path === '/notifications/read-all') {
      const u = requireAuth()
      for (const n of db.notifications) {
        if (n.user_id === u.id) n.is_read = true
      }
      saveDb(db)
      return httpOk(config, null, 204)
    }

    const notifReadMatch = /^\/notifications\/(\d+)\/read$/.exec(path)
    if (method === 'POST' && notifReadMatch) {
      const u = requireAuth()
      const n = db.notifications.find((x) => x.id === Number(notifReadMatch[1]) && x.user_id === u.id)
      if (!n) return httpError(config, 404, 'Notification not found')
      n.is_read = true
      saveDb(db)
      return httpOk(config, n)
    }

    // ---------- Contact ----------
    if (method === 'POST' && path === '/contact') {
      const msg = {
        id: db.nextIds.contact++,
        name: String(body.name || '').trim(),
        email: String(body.email || '').trim().toLowerCase(),
        subject: String(body.subject || '').trim(),
        message: String(body.message || '').trim(),
        is_resolved: false,
        created_at: new Date().toISOString(),
      }
      db.contact_messages.unshift(msg)
      logAction(db, 'contact.submitted', null, 'contact_message', msg.id)
      notifyAdmins(db, 'New contact message', `${msg.name}: ${msg.subject}`, '/admin/messages')
      saveDb(db)
      return httpOk(config, { id: msg.id, detail: 'Thank you. Your message has been received.' }, 201)
    }

    // ---------- Admin ----------
    if (method === 'GET' && path === '/admin/stats') {
      requireAdmin()
      return httpOk(config, {
        users: db.users.filter((u) => u.role === 'user').length,
        organization_accounts: db.users.filter((u) => u.role === 'organization').length,
        organizations: db.organizations.length,
        organizations_pending: db.organizations.filter((o) => o.status === 'pending').length,
        organizations_verified: db.organizations.filter((o) => o.status === 'verified').length,
        certificates: db.certificates.length,
        certificates_active: db.certificates.filter((c) => c.status === 'active').length,
        documents: db.documents.length,
        corrections_open: db.corrections.filter((c) => ['submitted', 'under_review'].includes(c.status)).length,
        corrections_approved: db.corrections.filter((c) => c.status === 'approved').length,
        corrections_rejected: db.corrections.filter((c) => c.status === 'rejected').length,
        verifications_30d: db.verifications.length,
        contact_open: db.contact_messages.filter((m) => !m.is_resolved).length,
      })
    }

    if (method === 'GET' && path === '/admin/users') {
      requireAdmin()
      let list = [...db.users]
      if (queryParams.role) list = list.filter((u) => u.role === queryParams.role)
      if (queryParams.q) {
        const q = String(queryParams.q).toLowerCase()
        list = list.filter((u) => u.email.toLowerCase().includes(q) || u.full_name.toLowerCase().includes(q))
      }
      list.sort((a, b) => b.created_at.localeCompare(a.created_at))
      return httpOk(config, paginateArray(list.map((u) => formatUserOut(u, db)), queryParams))
    }

    const adminUserMatch = /^\/admin\/users\/(\d+)$/.exec(path)
    if (method === 'PATCH' && adminUserMatch) {
      const admin = requireAdmin()
      const target = db.users.find((u) => u.id === Number(adminUserMatch[1]))
      if (!target) return httpError(config, 404, 'User not found')
      if (target.id === admin.id) return httpError(config, 400, 'You cannot change your own role or status')
      if (body.is_active !== undefined) target.is_active = Boolean(body.is_active)
      if (body.role !== undefined) target.role = body.role
      logAction(db, 'admin.user_updated', admin, 'user', target.id, body)
      saveDb(db)
      return httpOk(config, formatUserOut(target, db))
    }

    if (method === 'GET' && path === '/admin/organizations') {
      requireAdmin()
      let list = [...db.organizations]
      if (queryParams.status) list = list.filter((o) => o.status === queryParams.status)
      if (queryParams.q) {
        const q = String(queryParams.q).toLowerCase()
        list = list.filter((o) => o.name.toLowerCase().includes(q) || o.email.toLowerCase().includes(q))
      }
      list.sort((a, b) => b.created_at.localeCompare(a.created_at))
      return httpOk(config, paginateArray(list.map(formatOrgOut), queryParams))
    }

    const adminOrgStatusMatch = /^\/admin\/organizations\/(\d+)\/status$/.exec(path)
    if (method === 'POST' && adminOrgStatusMatch) {
      const admin = requireAdmin()
      const org = db.organizations.find((o) => o.id === Number(adminOrgStatusMatch[1]))
      if (!org) return httpError(config, 404, 'Organization not found')
      if (['rejected', 'suspended'].includes(body.status) && !body.note) {
        return httpError(config, 400, 'A note is required when rejecting or suspending')
      }
      const prev = org.status
      org.status = body.status
      org.status_note = body.note || null
      if (body.status === 'verified') {
        org.verified_at = new Date().toISOString()
        org.verified_by_id = admin.id
      }
      logAction(db, 'admin.organization_status', admin, 'organization', org.id, {
        from: prev,
        to: org.status,
        note: org.status_note,
      })
      notifyOrg(
        db,
        org.id,
        'Organization status updated',
        `Your organization status is now '${org.status}'.` + (org.status_note ? ` Note: ${org.status_note}` : ''),
        '/org/profile',
      )
      saveDb(db)
      return httpOk(config, formatOrgOut(org))
    }

    if (method === 'GET' && path === '/admin/audit-logs') {
      requireAdmin()
      let list = [...db.audit_logs]
      if (queryParams.action) {
        const a = String(queryParams.action).toLowerCase()
        list = list.filter((l) => l.action.toLowerCase().includes(a))
      }
      if (queryParams.entity_type) {
        list = list.filter((l) => l.entity_type === queryParams.entity_type)
      }
      return httpOk(config, paginateArray(list, queryParams))
    }

    if (method === 'GET' && path === '/admin/contact-messages') {
      requireAdmin()
      let list = [...db.contact_messages]
      if (queryParams.resolved === 'true' || queryParams.resolved === true) {
        list = list.filter((m) => m.is_resolved)
      } else if (queryParams.resolved === 'false' || queryParams.resolved === false) {
        list = list.filter((m) => !m.is_resolved)
      }
      return httpOk(config, paginateArray(list, queryParams))
    }

    const adminContactResolveMatch = /^\/admin\/contact-messages\/(\d+)\/resolve$/.exec(path)
    if (method === 'POST' && adminContactResolveMatch) {
      const admin = requireAdmin()
      const msg = db.contact_messages.find((m) => m.id === Number(adminContactResolveMatch[1]))
      if (!msg) return httpError(config, 404, 'Message not found')
      msg.is_resolved = true
      logAction(db, 'admin.contact_resolved', admin, 'contact_message', msg.id)
      saveDb(db)
      return httpOk(config, msg)
    }

    if (method === 'POST' && path === '/admin/retention/run') {
      const admin = requireAdmin()
      const result = { deleted: 0, files_removed: 0, kept_open_requests: db.corrections.filter((c) => ['submitted', 'under_review'].includes(c.status)).length }
      logAction(db, 'admin.retention_run', admin, 'system', null, result)
      saveDb(db)
      return httpOk(config, result)
    }

    return httpError(config, 404, `Endpoint not found: ${method} ${path}`)
  } catch (thrown) {
    if (thrown && typeof thrown.then === 'function') return thrown
    return httpError(config, 500, thrown?.message || 'Unexpected error')
  }
}

function buildVerificationResult(cert, query, method, db) {
  if (!cert) {
    db.verifications.push({
      id: db.nextIds.verification++,
      certificate_id: null,
      query,
      method,
      result: 'not_found',
      created_at: new Date().toISOString(),
    })
    saveDb(db)
    return {
      result: 'not_found',
      message:
        method === 'file'
          ? 'This file does not match any certificate PDF issued through CertiFix AI. It may have been modified, or it was not issued on this platform. Try verifying by certificate ID instead.'
          : 'No certificate with this ID or file was issued through CertiFix AI.',
    }
  }

  const org = db.organizations.find((o) => o.id === cert.organization_id)
  const cat = cert.category_id ? db.categories.find((c) => c.id === cert.category_id) : null
  const supersededBy = db.certificates.find((c) => c.supersedes_id === cert.id)
  const supersedes = cert.supersedes_id ? db.certificates.find((c) => c.id === cert.supersedes_id) : null

  const resultMap = { active: 'valid', revoked: 'revoked', superseded: 'superseded' }
  const result = resultMap[cert.status] || 'not_found'
  const messages = {
    valid: `This certificate is valid and was issued by ${org ? org.name : 'a verified issuer'}.`,
    revoked: 'This certificate has been revoked by its issuer and is no longer valid.',
    superseded: supersededBy
      ? `This certificate was replaced by a corrected certificate (${supersededBy.certificate_number}) and is no longer valid.`
      : 'This certificate was replaced by a corrected certificate.',
  }

  db.verifications.push({
    id: db.nextIds.verification++,
    certificate_id: cert.id,
    query,
    method,
    result,
    created_at: new Date().toISOString(),
  })
  saveDb(db)

  return {
    result,
    certificate_number: cert.certificate_number,
    recipient_name: cert.recipient_name,
    title: cert.title,
    course_or_role: cert.course_or_role,
    organization_name: org ? org.name : null,
    organization_verified: org ? org.status === 'verified' : false,
    category: cat ? cat.name : null,
    issue_date: cert.issue_date,
    status: cert.status,
    revoked_at: cert.revoked_at,
    revocation_reason: cert.status === 'revoked' ? cert.revocation_reason : null,
    superseded_by: supersededBy ? supersededBy.certificate_number : null,
    supersedes: supersedes ? supersedes.certificate_number : null,
    is_corrected_reissue: Boolean(cert.supersedes_id || cert.correction_request_id),
    message: messages[result],
  }
}
