from datetime import datetime, timezone

from app.extensions import db


class DocumentFolder(db.Model):
    """A folder (or subfolder, via ``parent_id``) inside Important Documents."""

    __tablename__ = 'document_folders'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(150), nullable=False)
    parent_id = db.Column(
        db.Integer, db.ForeignKey('document_folders.id', ondelete='CASCADE'), nullable=True, index=True
    )
    created_by = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='SET NULL'), nullable=True)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at = db.Column(
        db.DateTime(timezone=True), nullable=False,
        default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc),
    )

    parent = db.relationship('DocumentFolder', remote_side=[id], backref='children')

    def path_ids(self):
        """Ids from the top-level folder down to this one."""
        chain, node, guard = [], self, 0
        while node is not None and guard < 100:
            chain.append(node.id)
            node = node.parent
            guard += 1
        return list(reversed(chain))


class DocumentAudience(db.Model):
    """One user who may see one restricted document."""

    __tablename__ = 'document_audience'

    document_id = db.Column(
        db.Integer, db.ForeignKey('important_documents.id', ondelete='CASCADE'), primary_key=True
    )
    user_id = db.Column(
        db.Integer, db.ForeignKey('users.id', ondelete='CASCADE'), primary_key=True, index=True
    )


class ImportantDocument(db.Model):
    __tablename__ = 'important_documents'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(255), nullable=False, index=True)
    description = db.Column(db.Text, nullable=True)
    category = db.Column(db.String(100), nullable=False, index=True)
    original_filename = db.Column(db.String(255), nullable=False)
    storage_filename = db.Column(db.String(80), nullable=False, unique=True)
    file_type = db.Column(db.String(10), nullable=False)
    file_size = db.Column(db.BigInteger, nullable=False)
    uploaded_by = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='SET NULL'), nullable=True, index=True)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc), index=True)

    folder_id = db.Column(db.Integer, db.ForeignKey('document_folders.id', ondelete='SET NULL'), nullable=True, index=True)
    # False (the default, and what every pre-existing document has) = visible to
    # every signed-in user, exactly as before. True = only the uploader, the
    # Chairman-level managers and the users listed in ``audience``.
    restricted = db.Column(db.Boolean, nullable=False, default=False, server_default=db.false())

    uploader = db.relationship('User', lazy='joined')
    folder = db.relationship('DocumentFolder', lazy='joined')
    audience = db.relationship(
        'DocumentAudience', cascade='all, delete-orphan', lazy='selectin', passive_deletes=True
    )

    def audience_user_ids(self):
        return sorted(entry.user_id for entry in self.audience)

    def to_dict(self, include_audience=False):
        data = {
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
            'folder_id': self.folder_id,
            'visible_to_all': not self.restricted,
        }
        if include_audience:
            data['audience_user_ids'] = self.audience_user_ids()
        return data
