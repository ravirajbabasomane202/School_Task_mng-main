"""role keys + register occurrence due_date

Revision ID: n3o4p5q6r7s8
Revises: m2n3o4p5q6r7

1. roles.key (stable identity) + roles.is_builtin. Backfill: built-in roles get
   their code as key; custom roles keep their current name as key, which is
   exactly what users.role already stores, so no user row changes.
2. register_occurrences.due_date (scheduled due date, never overwritten by the
   check). Backfill: the first day of the period (= occurrence_date) for existing rows.
"""
import sqlalchemy as sa
from alembic import op
from datetime import date

revision = 'n3o4p5q6r7s8'
down_revision = 'm2n3o4p5q6r7'
branch_labels = None
depends_on = None

BUILTIN = {
    'CHAIRMAN': 'Chairman', 'DIRECTOR': 'School Director', 'PROPERTY': 'Property & Maintenance Head',
    'FINANCE': 'Finance Head', 'ADMIN': 'Admin Head', 'PRINCIPAL': 'Principal', 'ADMISSION': 'Admission Head',
    'HR': 'HR Head', 'PURCHASE': 'Purchase Head', 'IT': 'IT & ERP Head', 'TRANSPORT': 'Transport Head',
    'HOUSEKEEPING': 'HouseKeeping Head', 'FRONT_DESK': 'Front Desk / Reception',
}


def _period_end(cycle, d):
    # Same calendar rules the app uses to derive a period's last day.
    from app.models.register import period_bounds
    return period_bounds(cycle, d)[1]


def upgrade():
    op.add_column('roles', sa.Column('key', sa.String(60), nullable=True))
    op.add_column('roles', sa.Column('is_builtin', sa.Boolean(), nullable=False, server_default=sa.false()))
    bind = op.get_bind()

    roles = bind.execute(sa.text('SELECT id, name FROM roles')).fetchall()
    for rid, name in roles:
        code = next((c for c, n in BUILTIN.items() if n.lower() == name.lower() or c == name), None)
        bind.execute(sa.text('UPDATE roles SET key=:k, is_builtin=:b WHERE id=:i'),
                     {'k': code or name, 'b': code is not None, 'i': rid})
    op.alter_column('roles', 'key', existing_type=sa.String(60), nullable=False)
    op.create_index('ix_roles_key', 'roles', ['key'], unique=True)

    op.add_column('register_occurrences', sa.Column('due_date', sa.Date(), nullable=True))
    rows = bind.execute(sa.text(
        'SELECT o.id, o.occurrence_date, r.cycle FROM register_occurrences o '
        'JOIN registers r ON r.id = o.register_id WHERE o.due_date IS NULL')).fetchall()
    for oid, occ_date, cycle in rows:
        if isinstance(occ_date, str):
            occ_date = date.fromisoformat(occ_date[:10])
        bind.execute(sa.text('UPDATE register_occurrences SET due_date=:d WHERE id=:i'),
                     {'d': occ_date, 'i': oid})


def downgrade():
    op.drop_column('register_occurrences', 'due_date')
    op.drop_index('ix_roles_key', table_name='roles')
    op.drop_column('roles', 'is_builtin')
    op.drop_column('roles', 'key')
