import hashlib
import re
import secrets
from functools import wraps

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from flask import abort, g, request

from .db import db, execute, one

PASSWORDS = PasswordHasher(time_cost=2, memory_cost=19456, parallelism=1)
DUMMY_HASH = PASSWORDS.hash(secrets.token_urlsafe(32))
EMAIL = re.compile(
    r"[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*"
    r"@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?"
    r"(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+",
    re.ASCII,
)
TOKEN = re.compile(r"Bearer ([A-Za-z0-9_-]{43})", re.IGNORECASE | re.ASCII)
SESSION_SECONDS = 8 * 60 * 60
WINDOW_SECONDS = 15 * 60


def digest(value):
    return hashlib.sha256(value.encode("utf-8")).digest()


def validate_email(value):
    if not isinstance(value, str) or not value.isascii():
        abort(400, "Invalid email")
    value = value.strip().lower()
    local_part = value.partition("@")[0]
    if len(value) > 254 or len(local_part) > 64 or not EMAIL.fullmatch(value):
        abort(400, "Invalid email")
    return value


def validate_password(value, minimum=15):
    if not isinstance(value, str) or not minimum <= len(value) <= 128:
        abort(400, "Invalid password length or characters")
    if any(0xD800 <= ord(char) <= 0xDFFF for char in value):
        abort(400, "Invalid password length or characters")
    return value


def validate_full_name(value):
    if not isinstance(value, str):
        abort(400, "Invalid full_name")
    value = value.strip()
    if not 1 <= len(value) <= 120 or not value.isprintable():
        abort(400, "Invalid full_name")
    return value


def read_json(*fields):
    data = request.get_json()
    if not isinstance(data, dict) or set(data) != set(fields):
        abort(400, "Unexpected or missing JSON fields")
    return data


def enforce_rate_limit(scope, identifier, limit):
    bucket_key = digest(f"{scope}:{identifier}")
    now = one("SELECT UNIX_TIMESTAMP() AS now")["now"]
    window_start = now - now % WINDOW_SECONDS
    execute(
        """INSERT INTO auth_rate_limits (bucket_key, window_start, hits)
           VALUES (%s, %s, 1)
           ON DUPLICATE KEY UPDATE hits = LEAST(hits + 1, %s)""",
        (bucket_key, window_start, limit + 1),
    )
    count = one(
        "SELECT hits FROM auth_rate_limits WHERE bucket_key = %s AND window_start = %s",
        (bucket_key, window_start),
    )["hits"]
    db().commit()
    if count > limit:
        g.retry_after = window_start + WINDOW_SECONDS - now
        abort(429, "Too many requests")


def verify_password(password, account):
    stored_hash = account["password_hash"] if account else DUMMY_HASH
    try:
        PASSWORDS.verify(stored_hash, password)
    except VerifyMismatchError:
        return False
    return bool(account and account["is_active"])


def record_audit(user_id, action):
    execute(
        "INSERT INTO audit_logs (user_id, action, entity_type, entity_id) VALUES (%s, %s, 'USER', %s)",
        (user_id, action, user_id),
    )


def require_user(*roles):
    def decorator(view):
        @wraps(view)
        def wrapped(*args, **kwargs):
            match = TOKEN.fullmatch(request.headers.get("Authorization", ""))
            if not match:
                abort(401, "Authentication required")
            g.token_hash = digest(match[1])
            g.user = one(
                """SELECT u.user_id, u.role_code, u.email, u.full_name
                   FROM auth_sessions s JOIN users u ON u.user_id = s.user_id
                   WHERE s.token_hash = %s AND s.expires_at > UTC_TIMESTAMP(6)
                     AND u.is_active = TRUE""",
                (g.token_hash,),
            )
            if not g.user:
                abort(401, "Authentication required")
            if roles and g.user["role_code"] not in roles:
                abort(403, "Access denied")
            return view(*args, **kwargs)
        return wrapped
    return decorator
