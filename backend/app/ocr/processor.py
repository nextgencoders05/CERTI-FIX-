"""Document text extraction.

Pipeline:
  * PDF with an embedded text layer -> text read directly with PyMuPDF (no OCR needed).
  * Scanned PDF -> each page rasterised at 300 DPI -> OpenCV preprocessing -> Tesseract.
  * Image -> OpenCV preprocessing -> Tesseract.

The extracted text is only an aid for filling in a correction request. It is NOT evidence that
the document is authentic.
"""
import io
from dataclasses import dataclass

import cv2
import fitz  # PyMuPDF
import numpy as np
import pytesseract
from PIL import Image, ImageOps

from app.config import get_settings

MIN_EMBEDDED_TEXT_CHARS = 40
RASTER_DPI = 300


class OCRError(Exception):
    pass


class OCRUnavailableError(OCRError):
    pass


@dataclass
class OCRResult:
    text: str
    method: str  # pdf_text | tesseract
    confidence: float | None  # 0-100 mean word confidence (tesseract only)
    pages: int


def _configure_tesseract() -> None:
    cmd = get_settings().TESSERACT_CMD
    if cmd:
        pytesseract.pytesseract.tesseract_cmd = cmd
    try:
        pytesseract.get_tesseract_version()
    except (pytesseract.TesseractNotFoundError, OSError) as exc:
        raise OCRUnavailableError(
            "The Tesseract OCR engine is not installed on the server. Install it and/or set TESSERACT_CMD."
        ) from exc


def _deskew(binary: np.ndarray) -> np.ndarray:
    coords = np.column_stack(np.where(binary < 128))
    if coords.shape[0] < 50:
        return binary
    angle = cv2.minAreaRect(coords.astype(np.float32))[-1]
    if angle > 45:
        angle -= 90
    elif angle < -45:
        angle += 90
    if abs(angle) < 0.5 or abs(angle) > 15:
        return binary
    h, w = binary.shape[:2]
    m = cv2.getRotationMatrix2D((w // 2, h // 2), angle, 1.0)
    return cv2.warpAffine(binary, m, (w, h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)


def preprocess(image: Image.Image) -> np.ndarray:
    """Grayscale, upscale small images, denoise, binarise (Otsu) and deskew."""
    image = ImageOps.exif_transpose(image).convert("RGB")
    arr = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2GRAY)
    h, w = arr.shape[:2]
    if w < 1600:
        factor = 1600 / w
        arr = cv2.resize(arr, (int(w * factor), int(h * factor)), interpolation=cv2.INTER_CUBIC)
    arr = cv2.medianBlur(arr, 3)
    _, binary = cv2.threshold(arr, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    return _deskew(binary)


def _ocr_image(image: Image.Image) -> tuple[str, float | None]:
    processed = preprocess(image)
    lang = get_settings().OCR_LANG
    config = "--oem 3 --psm 3"
    data = pytesseract.image_to_data(processed, lang=lang, config=config, output_type=pytesseract.Output.DICT)
    confs = [float(c) for c, t in zip(data["conf"], data["text"]) if str(t).strip() and float(c) >= 0]
    text = pytesseract.image_to_string(processed, lang=lang, config=config)
    return text, (sum(confs) / len(confs) if confs else None)


def extract_text(data: bytes, mime_type: str) -> OCRResult:
    if mime_type == "application/pdf":
        try:
            doc = fitz.open(stream=data, filetype="pdf")
        except Exception as exc:
            raise OCRError("Unable to open PDF") from exc
        with doc:
            embedded = "\n".join(page.get_text("text") for page in doc).strip()
            if len(embedded) >= MIN_EMBEDDED_TEXT_CHARS:
                return OCRResult(text=embedded, method="pdf_text", confidence=None, pages=doc.page_count)
            _configure_tesseract()
            texts, confs = [], []
            for page in doc:
                pix = page.get_pixmap(dpi=RASTER_DPI)
                img = Image.open(io.BytesIO(pix.tobytes("png")))
                t, c = _ocr_image(img)
                texts.append(t)
                if c is not None:
                    confs.append(c)
            return OCRResult(text="\n".join(texts).strip(), method="tesseract",
                             confidence=(sum(confs) / len(confs) if confs else None), pages=doc.page_count)

    _configure_tesseract()
    try:
        img = Image.open(io.BytesIO(data))
        frames = getattr(img, "n_frames", 1)
        texts, confs = [], []
        for i in range(min(frames, get_settings().MAX_PDF_PAGES)):
            img.seek(i)
            t, c = _ocr_image(img.copy())
            texts.append(t)
            if c is not None:
                confs.append(c)
    except OCRError:
        raise
    except Exception as exc:
        raise OCRError("Unable to process image") from exc
    return OCRResult(text="\n".join(texts).strip(), method="tesseract",
                     confidence=(sum(confs) / len(confs) if confs else None), pages=len(texts))
