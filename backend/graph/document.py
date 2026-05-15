import base64
import mimetypes
from pathlib import Path

import fitz

from ..schemas.graph import DocumentPageImage, DocumentPayload

PAGE_LIMIT = 10

IMAGE_SUFFIXES = {".jpeg", ".jpg", ".png"}


def _pdf_payload(
    file_path: Path, max_pages: int
) -> tuple[list[DocumentPageImage], int]:
    page_images: list[DocumentPageImage] = []
    with fitz.open(file_path) as pdf:
        page_count = len(pdf)
        for page_number, page in enumerate(pdf[:max_pages], start=1):
            pixmap = page.get_pixmap(dpi=200)
            page_images.append(
                DocumentPageImage(
                    page=page_number,
                    data_url=(
                        "data:image/png;base64,"
                        f"{base64.b64encode(pixmap.tobytes('png')).decode()}"
                    ),
                )
            )
    return page_images, page_count


def _img_payload(file_path: Path) -> DocumentPageImage:
    mime_type = mimetypes.guess_type(file_path.name)[0] or "image/png"
    encoded = base64.b64encode(file_path.read_bytes()).decode()
    return DocumentPageImage(page=1, data_url=f"data:{mime_type};base64,{encoded}")


def read_document(
    path: str,
    max_pages: int = PAGE_LIMIT,
    *,
    title_override: str | None = None,
) -> DocumentPayload:
    file_path = Path(path)
    title = title_override or file_path.stem
    suffix = file_path.suffix.lower()

    if suffix == ".pdf":
        page_images, page_count = _pdf_payload(file_path, max_pages)
        if not page_images:
            raise ValueError(f"No pages rendered from {file_path.name}")
        return DocumentPayload(
            title=title,
            source_type="pdf",
            page_count=page_count,
            page_images=page_images,
        )

    if suffix in IMAGE_SUFFIXES:
        return DocumentPayload(
            title=title,
            source_type=suffix.lstrip("."),
            page_count=1,
            page_images=[_img_payload(file_path)],
        )

    raise ValueError("Supported file types: .pdf, .png, .jpg, .jpeg")


def slice_document_pages(
    payload: DocumentPayload, page_start: int | None, page_end: int | None
) -> DocumentPayload:
    if not payload.page_images or page_start is None or page_end is None:
        return payload

    start = max(1, page_start)
    end = max(start, page_end)
    page_images = [
        page_image
        for page_image in payload.page_images
        if start <= page_image.page <= end
    ]
    if not page_images:
        return payload

    return DocumentPayload(
        title=payload.title,
        source_type=payload.source_type,
        page_count=payload.page_count,
        page_images=page_images,
    )
