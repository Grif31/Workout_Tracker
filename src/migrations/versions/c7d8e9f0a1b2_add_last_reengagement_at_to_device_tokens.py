"""add last_reengagement_at to device_tokens for push throttling

Revision ID: c7d8e9f0a1b2
Revises: b1c2d3e4f5g6
Create Date: 2026-06-11

"""
from alembic import op
import sqlalchemy as sa

revision = 'c7d8e9f0a1b2'
down_revision = 'b1c2d3e4f5g6'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('device_tokens', schema=None) as batch_op:
        batch_op.add_column(sa.Column('last_reengagement_at', sa.DateTime(), nullable=True))


def downgrade():
    with op.batch_alter_table('device_tokens', schema=None) as batch_op:
        batch_op.drop_column('last_reengagement_at')
