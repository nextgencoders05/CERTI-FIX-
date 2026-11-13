from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Notification, User, UserRole


def notify(db: Session, user_id: int, title: str, message: str, link: str | None = None) -> None:
    db.add(Notification(user_id=user_id, title=title, message=message, link=link))


def notify_organization(db: Session, organization_id: int, title: str, message: str,
                        link: str | None = None) -> None:
    members = db.scalars(select(User.id).where(User.organization_id == organization_id,
                                               User.role == UserRole.ORGANIZATION,
                                               User.is_active.is_(True))).all()
    for uid in members:
        notify(db, uid, title, message, link)


def notify_admins(db: Session, title: str, message: str, link: str | None = None) -> None:
    admins = db.scalars(select(User.id).where(User.role == UserRole.ADMIN, User.is_active.is_(True))).all()
    for uid in admins:
        notify(db, uid, title, message, link)
