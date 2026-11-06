"""achievements: Eos start hour, Kairos negative split, pinned badges

Revision ID: d9e2f6a3b8c5
Revises: c8d1e5f2a7b4
Create Date: 2026-11-06

The last hidden badges need data the app now sends with a save, and up to
three earned badges can be pinned to the profile.
"""
from alembic import op
import sqlalchemy as sa

revision = 'd9e2f6a3b8c5'
down_revision = 'c8d1e5f2a7b4'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('workouts', sa.Column('local_start_hour', sa.Integer(), nullable=True))
    op.add_column('exercises', sa.Column('negative_split', sa.Boolean(), nullable=True))
    op.add_column('user_achievements', sa.Column('pin_position', sa.Integer(), nullable=True))
    op.add_column('user', sa.Column('badge_pins_saved', sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade():
    op.drop_column('user', 'badge_pins_saved')
    op.drop_column('user_achievements', 'pin_position')
    op.drop_column('exercises', 'negative_split')
    op.drop_column('workouts', 'local_start_hour')
