"""important documents: folders, subfolders and per-user audience

Revision ID: y9z0a1b2c3d4
Revises: x8y9z0a1b2c3
Create Date: 2026-11-26
"""
from alembic import op
import sqlalchemy as sa


revision = 'y9z0a1b2c3d4'
down_revision = 'x8y9z0a1b2c3'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'document_folders',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=150), nullable=False),
        sa.Column('parent_id', sa.Integer(), nullable=True),
        sa.Column('created_by', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(['parent_id'], ['document_folders.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['created_by'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_document_folders_parent_id', 'document_folders', ['parent_id'], unique=False)

    with op.batch_alter_table('important_documents') as batch:
        batch.add_column(sa.Column('folder_id', sa.Integer(), nullable=True))
        # Existing documents stay visible to everyone (restricted = false).
        batch.add_column(sa.Column('restricted', sa.Boolean(), nullable=False, server_default=sa.false()))
        batch.create_foreign_key(
            'fk_important_documents_folder', 'document_folders', ['folder_id'], ['id'], ondelete='SET NULL'
        )
        batch.create_index('ix_important_documents_folder_id', ['folder_id'], unique=False)
        batch.create_index('ix_important_documents_name', ['name'], unique=False)
        batch.create_index('ix_important_documents_category', ['category'], unique=False)
        batch.create_index('ix_important_documents_uploaded_by', ['uploaded_by'], unique=False)

    op.create_table(
        'document_audience',
        sa.Column('document_id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(['document_id'], ['important_documents.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('document_id', 'user_id'),
    )
    op.create_index('ix_document_audience_user_id', 'document_audience', ['user_id'], unique=False)


def downgrade():
    op.drop_index('ix_document_audience_user_id', table_name='document_audience')
    op.drop_table('document_audience')
    with op.batch_alter_table('important_documents') as batch:
        batch.drop_index('ix_important_documents_uploaded_by')
        batch.drop_index('ix_important_documents_category')
        batch.drop_index('ix_important_documents_name')
        batch.drop_index('ix_important_documents_folder_id')
        batch.drop_constraint('fk_important_documents_folder', type_='foreignkey')
        batch.drop_column('restricted')
        batch.drop_column('folder_id')
    op.drop_index('ix_document_folders_parent_id', table_name='document_folders')
    op.drop_table('document_folders')
