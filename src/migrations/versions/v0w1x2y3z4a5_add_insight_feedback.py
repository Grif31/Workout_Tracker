"""add insight_feedback

Revision ID: v0w1x2y3z4a5
Revises: t8u9v0w1x2y3
Create Date: 2026-10-15

A user's helpful / not helpful vote on a Coach insight, read back into the
next insights prompt so the Coach leans toward what the user finds useful.
"""
from alembic import op
import sqlalchemy as sa

revision = 'v0w1x2y3z4a5'
down_revision = 't8u9v0w1x2y3'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'insight_feedback',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('insight_type', sa.String(length=32), nullable=True),
        sa.Column('title', sa.String(length=200), nullable=False),
        sa.Column('body', sa.String(length=1000), nullable=False),
        sa.Column('helpful', sa.Boolean(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['user.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_insight_feedback_user_id', 'insight_feedback', ['user_id'])


def downgrade():
    op.drop_index('ix_insight_feedback_user_id', table_name='insight_feedback')
    op.drop_table('insight_feedback')
