"""add user key responsibilities (and seed them from the KRA/JD document)

Revision ID: w7x8y9z0a1b2
Revises: v6w7x8y9z0a1
Create Date: 2026-11-26
"""
from alembic import op
import sqlalchemy as sa


revision = 'w7x8y9z0a1b2'
down_revision = 'v6w7x8y9z0a1'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('users', sa.Column('responsibility_summary', sa.Text(), nullable=True))
    table = op.create_table(
        'user_key_responsibilities',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('description', sa.Text(), nullable=False),
        sa.Column('sort_order', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_user_key_responsibilities_user_id', 'user_key_responsibilities', ['user_id'], unique=False)

    # Data: give every existing user whose role appears in the KRA/JD document
    # its responsibilities. Only users with none yet are touched, and the rows
    # are ordinary data afterwards (editable in User Management).
    from app.key_responsibility_templates import KEY_RESPONSIBILITY_TEMPLATES

    bind = op.get_bind()
    users = sa.table(
        'users',
        sa.column('id', sa.Integer), sa.column('role', sa.String), sa.column('responsibility_summary', sa.Text),
    )
    rows = bind.execute(sa.select(users.c.id, users.c.role)).fetchall()
    inserts = []
    for user_id, role in rows:
        template = KEY_RESPONSIBILITY_TEMPLATES.get(role)
        if not template:
            continue
        bind.execute(
            users.update().where(users.c.id == user_id).values(responsibility_summary=template['summary'])
        )
        for position, text in enumerate(template['items'], start=1):
            inserts.append({'user_id': user_id, 'description': text, 'sort_order': position})
    if inserts:
        op.bulk_insert(table, inserts)


def downgrade():
    op.drop_index('ix_user_key_responsibilities_user_id', table_name='user_key_responsibilities')
    op.drop_table('user_key_responsibilities')
    op.drop_column('users', 'responsibility_summary')
