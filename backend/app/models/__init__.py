"""ORM models. Importing this package registers every table on Base.metadata."""
from app.models.enums import (  # noqa: F401
    ApprovalDecision, CertificateStatus, CorrectionStatus, OCRStatus, OrganizationStatus,
    UserRole, VerificationResult,
)
from app.models.user import User  # noqa: F401
from app.models.organization import Organization  # noqa: F401
from app.models.category import CertificateCategory  # noqa: F401
from app.models.template import CertificateTemplate  # noqa: F401
from app.models.certificate import Certificate  # noqa: F401
from app.models.document import UploadedDocument  # noqa: F401
from app.models.correction import ApprovalRecord, CorrectionRequest  # noqa: F401
from app.models.verification import VerificationRecord  # noqa: F401
from app.models.audit import AuditLog  # noqa: F401
from app.models.notification import Notification  # noqa: F401
from app.models.contact import ContactMessage  # noqa: F401
