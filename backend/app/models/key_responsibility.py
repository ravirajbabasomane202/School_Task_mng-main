from datetime import datetime, timezone

from app.extensions import db


class UserKeyResponsibility(db.Model):
    """One key responsibility belonging to exactly one user (ordered)."""

    __tablename__ = 'user_key_responsibilities'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(
        db.Integer, db.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True
    )
    description = db.Column(db.Text, nullable=False)
    sort_order = db.Column(db.Integer, nullable=False, default=0)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        return {
            'id': self.id,
            'description': self.description,
            'sort_order': self.sort_order,
        }
