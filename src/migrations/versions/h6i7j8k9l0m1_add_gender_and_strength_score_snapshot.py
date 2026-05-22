"""add gender to user and strength_score_snapshots table

Revision ID: h6i7j8k9l0m1
Revises: 6625b7742226
Create Date: 2026-05-21

"""
from alembic import op
import sqlalchemy as sa

revision = 'h6i7j8k9l0m1'
down_revision = '6625b7742226'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('user', sa.Column('gender', sa.String(10), nullable=True))
    op.create_table(
        'strength_score_snapshots',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('user.id', ondelete='CASCADE'), nullable=False),
        sa.Column('score', sa.Float(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_strength_score_snapshots_user_id', 'strength_score_snapshots', ['user_id'])


def downgrade():
    op.drop_index('ix_strength_score_snapshots_user_id', table_name='strength_score_snapshots')
    op.drop_table('strength_score_snapshots')
    op.drop_column('user', 'gender')
