"""add user_achievements

Revision ID: e0f1a2b3c4d5
Revises: d0e1f2a3b4c5
Create Date: 2026-11-05

One row per badge a user has earned (TODO §27), with the workout that earned
it. Existing users get theirs from `flask backfill-achievements --apply`.
"""
from alembic import op
import sqlalchemy as sa

revision = 'e0f1a2b3c4d5'
down_revision = 'd0e1f2a3b4c5'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'user_achievements',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('key', sa.String(length=48), nullable=False),
        sa.Column('earned_at', sa.DateTime(), nullable=False),
        sa.Column('workout_id', sa.Integer(), nullable=True),
        sa.Column('seen', sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['user.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['workout_id'], ['workouts.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id', 'key', name='uq_user_achievements_user_key'),
    )
    op.create_index('ix_user_achievements_user_id', 'user_achievements', ['user_id'])


def downgrade():
    op.drop_index('ix_user_achievements_user_id', table_name='user_achievements')
    op.drop_table('user_achievements')
