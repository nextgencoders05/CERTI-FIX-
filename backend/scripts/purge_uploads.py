"""Apply the upload retention policy. Schedule daily (cron, systemd timer, or a platform job):

    cd backend && python -m scripts.purge_uploads
"""
from app.database.session import SessionLocal
from app.services.retention import purge_expired_documents


def main() -> None:
    with SessionLocal() as db:
        result = purge_expired_documents(db)
    print(f"Retention run complete: {result}")


if __name__ == "__main__":
    main()
