"""add rpe to set

Revision ID: d2e3f4g5h6i7
Revises: c1d2e3f4g5h6
Create Date: 2026-05-12
"""
from alembic import op
import sqlalchemy as sa

revision = 'd2e3f4g5h6i7'
down_revision = 'c1d2e3f4g5h6'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('sets', schema=None) as batch_op:
        batch_op.add_column(sa.Column('rpe', sa.Integer(), nullable=True))


def downgrade():
    with op.batch_alter_table('sets', schema=None) as batch_op:
        batch_op.drop_column('rpe')
