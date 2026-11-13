from fastapi import Query, Response
from sqlalchemy import Select, func, select
from sqlalchemy.orm import Session


class Pagination:
    def __init__(self, page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100)):
        self.page = page
        self.page_size = page_size


def paginate(db: Session, stmt: Select, p: Pagination) -> tuple[list, int]:
    total = db.scalar(select(func.count()).select_from(stmt.order_by(None).subquery())) or 0
    items = db.scalars(stmt.offset((p.page - 1) * p.page_size).limit(p.page_size)).unique().all()
    return list(items), total


def like(term: str) -> str:
    escaped = term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


def file_response(data: bytes, media_type: str, filename: str, inline: bool = True) -> Response:
    disposition = "inline" if inline else "attachment"
    safe = "".join(c for c in filename if c.isalnum() or c in "._-") or "file"
    return Response(content=data, media_type=media_type, headers={
        "Content-Disposition": f'{disposition}; filename="{safe}"',
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
    })
