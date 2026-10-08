from app.extensions import db

# Display names used ONLY to seed the roles table for the built-in role keys
# (the keys drive permissions/routing in app.models.user.ROLES). Once seeded,
# the `roles` table is the single source of truth for display names and an
# admin can rename any role without touching code.
BUILTIN_ROLE_NAMES = {
    'CHAIRMAN': 'Chairman',
    'DIRECTOR': 'School Director',
    'PROPERTY': 'Property & Maintenance Head',
    'FINANCE': 'Finance Head',
    'ADMIN': 'Admin Head',
    'PRINCIPAL': 'Principal',
    'ADMISSION': 'Admission Head',
    'HR': 'HR Head',
    'PURCHASE': 'Purchase Head',
    'IT': 'IT & ERP Head',
    'TRANSPORT': 'Transport Head',
    'HOUSEKEEPING': 'HouseKeeping Head',
    'FRONT_DESK': 'Front Desk / Reception',
}


class Role(db.Model):
    """Dynamic role catalog.

    `key` is the stable identity of a role: it is what `users.role` stores and
    it never changes. `name` is only the display label and can be renamed by an
    admin. Built-in roles use their code as the key (CHAIRMAN, HR, ...); a custom
    role created through the "Other" option uses its original name as the key,
    which keeps users created before the key column existed valid.
    """

    __tablename__ = 'roles'

    id = db.Column(db.Integer, primary_key=True)
    key = db.Column(db.String(60), nullable=False, unique=True, index=True)
    name = db.Column(db.String(50), nullable=False, unique=True)
    is_builtin = db.Column(db.Boolean, nullable=False, default=False)
    created_at = db.Column(db.DateTime, server_default=db.func.now())

    def to_dict(self):
        return {
            'id': self.id,
            'key': self.key,
            'name': self.name,
            'is_builtin': bool(self.is_builtin),
        }


def sync_roles():
    """Make sure every role a user can hold has a row in `roles`.

    Idempotent. Seeds the built-in roles and adds a row (key == name) for any
    `users.role` value that has none, so a role assigned to a user always
    exists in the catalog -- which is what lets it appear on the Performance
    page without a code change. Returns {key: Role}.
    """
    from app.models.user import ROLES, User

    existing = {r.key: r for r in Role.query.all()}
    taken_names = {r.name.lower() for r in existing.values()}
    changed = False

    def _add(key, name, builtin):
        nonlocal changed
        if key in existing:
            return
        label = name
        if label.lower() in taken_names:  # names are unique; never collide
            label = key
        role = Role(key=key, name=label, is_builtin=builtin)
        db.session.add(role)
        existing[key] = role
        taken_names.add(label.lower())
        changed = True

    for code in ROLES:
        _add(code, BUILTIN_ROLE_NAMES.get(code, code), True)
    for (value,) in db.session.query(User.role).distinct().all():
        if value:
            _add(value, value, False)

    if changed:
        db.session.commit()
    return existing
