from app.extensions import db


class Role(db.Model):
    """Dynamic role catalog.

    The core set of roles (CHAIRMAN, DIRECTOR, ...) that drive permissions and
    routing is still defined in app.models.user.ROLES. This table lets admins
    add extra role labels (via the "Other" option in the Add/Edit User forms)
    without a code change, mirroring how Department already works.
    """

    __tablename__ = 'roles'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(50), nullable=False, unique=True)
    created_at = db.Column(db.DateTime, server_default=db.func.now())

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name
        }
