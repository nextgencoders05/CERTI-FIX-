from sqlalchemy import JSON, Boolean, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.session import Base
from app.models.mixins import TimestampMixin


class CertificateTemplate(TimestampMixin, Base):
    __tablename__ = "certificate_templates"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    organization_id: Mapped[int] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"),
                                                 nullable=False, index=True)
    category_id: Mapped[int | None] = mapped_column(ForeignKey("certificate_categories.id", ondelete="SET NULL"))
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    title_text: Mapped[str] = mapped_column(String(200), nullable=False, default="Certificate of Completion")
    body_text: Mapped[str] = mapped_column(Text, nullable=False)
    # layout keys: orientation, primary_color, accent_color, border_style, show_logo, show_qr,
    #              signatory_name, signatory_title, font
    layout: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    organization = relationship("Organization", back_populates="templates")
    category = relationship("CertificateCategory")
