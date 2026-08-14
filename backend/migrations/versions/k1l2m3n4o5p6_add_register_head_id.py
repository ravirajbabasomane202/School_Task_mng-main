"""add register head_id

Revision ID: k1l2m3n4o5p6
Revises: merge_heads_20260708
Create Date: 2026-07-10 13:59:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'k1l2m3n4o5p6'
down_revision = 'merge_heads_20260708'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('registers', sa.Column('head_id', sa.Integer(), nullable=True))
    op.create_foreign_key(
        'fk_registers_head_id_users',
        'registers',
        'users',
        ['head_id'],
        ['id'],
    )
    # Preserve legacy head_name values while linking to matching active users where possible.
    op.execute(
        """
        UPDATE registers
        SET head_id = users.id
        FROM users
        WHERE registers.head_name = users.name
        """
    )


def downgrade():
    op.drop_constraint('fk_registers_head_id_users', 'registers', type_='foreignkey')
    op.drop_column('registers', 'head_id')
