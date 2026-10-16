"""add reason to insight_feedback

Revision ID: w1x2y3z4a5b6
Revises: u9v0w1x2y3z4
Create Date: 2026-10-16

Why a not-helpful vote was cast (already knew it, not relevant, looks wrong,
too vague), so the Coach can tell which way to change rather than guess from
a title. Nullable: helpful votes and votes from before this have none.
"""
from alembic import op
import sqlalchemy as sa

revision = 'w1x2y3z4a5b6'
down_revision = 'u9v0w1x2y3z4'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('insight_feedback') as batch_op:
        batch_op.add_column(sa.Column('reason', sa.String(length=32), nullable=True))


def downgrade():
    with op.batch_alter_table('insight_feedback') as batch_op:
        batch_op.drop_column('reason')
