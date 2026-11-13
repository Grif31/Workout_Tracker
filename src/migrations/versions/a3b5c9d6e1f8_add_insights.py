"""add insights, and insight_id on insight_feedback

Revision ID: a3b5c9d6e1f8
Revises: f2a4b8c5d0e7
Create Date: 2026-11-11

Insights were written fresh on every refresh and never kept, so a vote had to
carry the insight's text and the Coach had no record of what it had said.
One row per insight per batch. Votes gain a nullable insight_id: rows from
before this keep matching on their text.
"""
from alembic import op
import sqlalchemy as sa

revision = 'a3b5c9d6e1f8'
down_revision = 'f2a4b8c5d0e7'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'insights',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('batch_id', sa.String(length=32), nullable=False),
        sa.Column('position', sa.Integer(), nullable=False),
        sa.Column('insight_type', sa.String(length=32), nullable=True),
        sa.Column('title', sa.String(length=200), nullable=False),
        sa.Column('body', sa.String(length=1000), nullable=False),
        sa.Column('priority', sa.String(length=16), nullable=True),
        sa.Column('evidence', sa.JSON(), nullable=True),
        sa.Column('follows_id', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['user.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['follows_id'], ['insights.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_insights_user_id', 'insights', ['user_id'])
    op.create_index('ix_insights_batch_id', 'insights', ['batch_id'])

    with op.batch_alter_table('insight_feedback') as batch_op:
        batch_op.add_column(sa.Column('insight_id', sa.Integer(), nullable=True))
        batch_op.create_index('ix_insight_feedback_insight_id', ['insight_id'])
        batch_op.create_foreign_key('fk_insight_feedback_insight_id', 'insights', ['insight_id'], ['id'],
                                    ondelete='SET NULL')


def downgrade():
    with op.batch_alter_table('insight_feedback') as batch_op:
        batch_op.drop_constraint('fk_insight_feedback_insight_id', type_='foreignkey')
        batch_op.drop_index('ix_insight_feedback_insight_id')
        batch_op.drop_column('insight_id')
    op.drop_index('ix_insights_batch_id', table_name='insights')
    op.drop_index('ix_insights_user_id', table_name='insights')
    op.drop_table('insights')
