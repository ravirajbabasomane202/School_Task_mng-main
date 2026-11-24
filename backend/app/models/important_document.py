from datetime import datetime, timezone

from app.extensions import db


class ImportantDocument(db.Model):
    __tablename__ = 'important_documents'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(255), nullable=False)
    description = db.Column(db.Text, nullable=True)
    category = db.Column(db.String(100), nullable=False)
    original_filename = db.Column(db.String(255), nullable=False)
    storage_filename = db.Column(db.String(80), nullable=False, unique=True)
    file_type = db.Column(db.String(10), nullable=False)
    file_size = db.Column(db.BigInteger, nullable=False)
    uploaded_by = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='SET NULL'), nullable=True)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc), index=True)

    uploader = db.relationship('User', lazy='joined')

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'description': self.description,
            'category': self.category,
            'original_filename': self.original_filename,
            'uploaded_by': self.uploader.name if self.uploader else 'Unknown',
            'uploaded_by_id': self.uploaded_by,
            'upload_date': self.created_at.isoformat() if self.created_at else None,
            'file_type': self.file_type,
            'file_size': self.file_size,
        }
