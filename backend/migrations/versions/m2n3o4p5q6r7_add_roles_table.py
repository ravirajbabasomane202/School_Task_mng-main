"""Add roles table and seed built-in roles

Revision ID: m2n3o4p5q6r7
Revises: l1m2n3o4p5q6, 897356ca9cba
Create Date: 2026-08-03 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.sql import table, column


# revision identifiers, used by Alembic.
revision = 'm2n3o4p5q6r7'
down_revision = ('l1m2n3o4p5q6', '897356ca9cba')
branch_labels = None
depends_on = None

BUILT_IN_ROLES = [
    'CHAIRMAN', 'DIRECTOR', 'PROPERTY', 'FINANCE', 'ADMIN',
    'PRINCIPAL', 'ADMISSION', 'HR', 'PURCHASE', 'IT', 'TRANSPORT',
    'HOUSEKEEPING', 'FRONT_DESK'
]


def upgrade():
    op.create_table(
        'roles',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=50), nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('name')
    )

    roles_table = table('roles', column('name', sa.String))
    op.bulk_insert(roles_table, [{'name': name} for name in BUILT_IN_ROLES])


def downgrade():
    op.drop_table('roles')
