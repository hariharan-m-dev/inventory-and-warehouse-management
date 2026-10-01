import datetime as dt

import bcrypt
import jwt

from config import Config


def hash_password(password):
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password, hashed):
    try:
        return bcrypt.checkpw(password.encode(), hashed.encode())
    except ValueError:
        return False


def create_token(user):
    payload = {
        "user_id": user["id"],
        "name": user["name"],
        "role": user["role"],
        "warehouse_id": user["warehouse_id"],
        "supplier_id": user["supplier_id"],
        "exp": dt.datetime.now(dt.timezone.utc) + dt.timedelta(hours=Config.JWT_EXPIRY_HOURS),
    }
    return jwt.encode(payload, Config.JWT_SECRET, algorithm="HS256")


def decode_token(token):
    return jwt.decode(token, Config.JWT_SECRET, algorithms=["HS256"])
