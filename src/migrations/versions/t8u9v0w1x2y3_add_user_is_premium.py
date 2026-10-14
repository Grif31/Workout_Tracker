"""add is_premium to user

Revision ID: t8u9v0w1x2y3
Revises: s7t8u9v0w1x2
Create Date: 2026-10-13

Server-side record of a RevenueCat entitlement. Existing rows start false; the
app's first POST /api/premium/sync after this ships fills in the real answer.
"""
from alembic import op
import sqlalchemy as sa

revision = 't8u9v0w1x2y3'
down_revision = 's7t8u9v0w1x2'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('user') as batch_op:
        batch_op.add_column(sa.Column('is_premium', sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade():
    with op.batch_alter_table('user') as batch_op:
        batch_op.drop_column('is_premium')
