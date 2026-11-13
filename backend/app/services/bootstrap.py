"""Idempotent seed data required for the platform to work."""
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import CertificateCategory
from app.services.identifiers import slugify

DEFAULT_CATEGORIES = [
    ("Internship Certificate", "Certifies completion of an internship programme."),
    ("Course Completion Certificate", "Certifies successful completion of a course."),
    ("Experience Certificate", "Certifies employment or work experience."),
    ("Workshop Certificate", "Certifies attendance or completion of a workshop."),
    ("Training Certificate", "Certifies completion of a training programme."),
    ("Achievement Certificate", "Recognises an achievement or award."),
    ("Participation Certificate", "Certifies participation in an event or activity."),
    ("Other Certificates", "Any other certificate type."),
]


def seed_default_categories(db: Session) -> int:
    existing = set(db.scalars(select(CertificateCategory.slug)).all())
    created = 0
    for name, desc in DEFAULT_CATEGORIES:
        slug = slugify(name)
        if slug not in existing:
            db.add(CertificateCategory(name=name, slug=slug, description=desc, is_system=True))
            created += 1
    if created:
        db.commit()
    return created
