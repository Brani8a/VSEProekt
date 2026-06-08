from datetime import datetime, timedelta, timezone
from db import SessionLocal
from models import BlacklistedTokens
import sqlalchemy
from sqlalchemy.exc import SQLAlchemyError

def cleanup_blacklistDB():
    db = SessionLocal()
    try:
        cutoff = datetime.now(timezone.utc)-timedelta(days=7)

        del_rows = db.query(BlacklistedTokens).filter(BlacklistedTokens.time_listing<=cutoff).delete()
        db.commit()
        print("Database cleared successfully")
    except SQLAlchemyError:
        db.rollback()
        print("Error occurred during database clean up")
    finally:
        db.close()

    if __name__ == "__main__":
        cleanup_blacklistDB()