from datetime import datetime, timezone
from app.extensions import db


class LoginAttempt(db.Model):
    """Tracks failed login attempts per IP for multi-worker-safe rate limiting."""
    __tablename__ = 'login_attempts'

    id = db.Column(db.Integer, primary_key=True)
    ip_address = db.Column(db.String(45), nullable=False, index=True)  # supports IPv6
    attempted_at = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc)
    )
