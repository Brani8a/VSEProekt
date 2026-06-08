from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from flask import g
from dotenv import load_dotenv
import os

load_dotenv(override=True)

DATABASE_URL = os.getenv("DATABASE_URL")

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(bind=engine)

def get_db():
    if 'db' not in g:
        g.db = SessionLocal()
    return g.db

def init_app(app):
    @app.teardown_appcontext
    def shutdown_session(exception=None):
        db = g.pop('db', None)
        if db is not None:
            db.close()