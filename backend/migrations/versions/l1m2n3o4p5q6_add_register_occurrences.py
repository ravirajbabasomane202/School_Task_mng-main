"""add register occurrences table

Revision ID: l1m2n3o4p5q6
Revises: k1l2m3n4o5p6
Create Date: 2026-07-15 12:40:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'l1m2n3o4p5q6'
down_revision = 'k1l2m3n4o5p6'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'register_occurrences',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('register_id', sa.Integer(), nullable=False),
        sa.Column('occurrence_date', sa.Date(), nullable=False),
        sa.Column('status', sa.String(length=20), nullable=False),
        sa.Column('completed_by', sa.Integer(), nullable=True),
        sa.Column('completed_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['completed_by'], ['users.id']),
        sa.ForeignKeyConstraint(['register_id'], ['registers.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('register_id', 'occurrence_date', name='uq_register_occurrence_date'),
    )
    op.create_index(op.f('ix_register_occurrences_occurrence_date'), 'register_occurrences', ['occurrence_date'], unique=False)
    op.create_index(op.f('ix_register_occurrences_register_id'), 'register_occurrences', ['register_id'], unique=False)


def downgrade():
    op.drop_index(op.f('ix_register_occurrences_register_id'), table_name='register_occurrences')
    op.drop_index(op.f('ix_register_occurrences_occurrence_date'), table_name='register_occurrences')
    op.drop_table('register_occurrences')
