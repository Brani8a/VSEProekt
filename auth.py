from passlib.context import CryptContext
import jwt
from models import BlacklistedTokens
from datetime import datetime, timedelta, timezone
import os
from sqlalchemy.exc import SQLAlchemyError
from db import get_db
from sqlalchemy import select
from dotenv import load_dotenv
from flask import request
import bcrypt

load_dotenv()

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
ALGORITHM = "HS256"
JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY")

def hash_password(password: str) -> str:

    pwd_bytes = password.encode('utf-8')
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(pwd_bytes, salt)
    return hashed.decode('utf-8')

def verify_password(plain_password: str, hashed_password: str) -> bool:

    pwd_bytes = plain_password.encode('utf-8')
    hashed_bytes = hashed_password.encode('utf-8')
    return bcrypt.checkpw(pwd_bytes, hashed_bytes)

def createAccessToken(data:dict):
    print("Creating access token")
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(minutes=15)
    to_encode["exp"] = expire
    return jwt.encode(to_encode, JWT_SECRET_KEY, algorithm=ALGORITHM)

def createRefreshToken(user_id:int):
    print("Creating refresh token")
    payload = {
        "user_id": user_id,
        "type": "refresh",
        "exp": datetime.now(timezone.utc) + timedelta(days=7)
    }
    return jwt.encode(payload, JWT_SECRET_KEY, algorithm=ALGORITHM)

def get_token_from_header():
    auth_header = request.headers.get("Authorization")
    
    if not auth_header:
        raise ValueError("Missing Authorization Header")

    parts = auth_header.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise ValueError("Invalid Authorization Header format")

    return parts[1]

def extract_user_info_from_acToken():
    token = get_token_from_header()
    payload = verifyAccToken(token)
    user_id = payload.get("user_id")
    userName = payload.get("user_name")
    return user_id, userName
    
def verifyAccToken(token):
    if isTokenBlisted(token):
        raise jwt.InvalidTokenError("Token is blacklisted")
    return jwt.decode(token, JWT_SECRET_KEY, algorithms=[ALGORITHM])

def verifyRefToken(token):
    if isTokenBlisted(token):
        raise jwt.InvalidTokenError("Token is blacklisted")
    
    payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[ALGORITHM])
    if payload.get("type") != "refresh":
        raise jwt.InvalidTokenError("Invalid refresh token")
    return payload

def isTokenBlisted(token):
    try:
        db = get_db()
        statement = select(BlacklistedTokens).where(BlacklistedTokens.token == token)
        result = db.execute(statement).first()

        if result:
            return True
        else:
            return False

    except SQLAlchemyError:
        raise Exception("Database error while checking blacklist")