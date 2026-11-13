"""add coach_profiles

Revision ID: f2a4b8c5d0e7
Revises: e1f3a7b4c9d6
Create Date: 2026-11-11

The Coach profile (goal, experience, equipment, schedule, injuries, notes)
lived only in the app's AsyncStorage, so a reinstall lost it and nothing on
the server could read it. One row per user; the app uploads its copy the
first time it runs a build that knows about this.
"""
from alembic import op
import sqlalchemy as sa

revision = 'f2a4b8c5d0e7'
down_revision = 'e1f3a7b4c9d6'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'coach_profiles',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('goal', sa.String(length=100), nullable=False),
        sa.Column('experience', sa.String(length=100), nullable=False),
        sa.Column('equipment', sa.String(length=100), nullable=False),
        sa.Column('days_per_week', sa.Integer(), nullable=False),
        sa.Column('session_length_min', sa.Integer(), nullable=False),
        sa.Column('avoid', sa.JSON(), nullable=False),
        sa.Column('notes', sa.String(length=1000), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['user.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id'),
    )


def downgrade():
    op.drop_table('coach_profiles')
