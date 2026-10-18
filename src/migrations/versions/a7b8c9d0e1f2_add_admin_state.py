"""add admin_state

Revision ID: a7b8c9d0e1f2
Revises: e9f0a1b2c3d4
Create Date: 2026-10-18

Key-value facts the admin keeps between visits, such as when the Coach page
was last opened, for the dashboard's "new since you last looked" counts.
"""
from alembic import op
import sqlalchemy as sa

revision = 'a7b8c9d0e1f2'
down_revision = 'e9f0a1b2c3d4'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'admin_state',
        sa.Column('key', sa.String(length=64), nullable=False),
        sa.Column('value', sa.String(length=255), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('key'),
    )


def downgrade():
    op.drop_table('admin_state')
