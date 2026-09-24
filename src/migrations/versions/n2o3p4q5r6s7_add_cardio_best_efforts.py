"""add cardio_best_efforts

Revision ID: n2o3p4q5r6s7
Revises: m1n2o3p4q5r6
Create Date: 2026-09-23

Best efforts extracted from a GPS track when the activity is saved. No
backfill is possible: route_polyline encodes latitude and longitude only, so
runs recorded before this shipped have no per-point timing to scan.
"""
from alembic import op
import sqlalchemy as sa

revision = 'n2o3p4q5r6s7'
down_revision = 'm1n2o3p4q5r6'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'cardio_best_efforts',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('exercise_id', sa.Integer(), nullable=False),
        sa.Column('milestone_type', sa.String(length=10), nullable=False),
        sa.Column('distance_km', sa.Float(), nullable=False),
        sa.Column('duration_min', sa.Float(), nullable=False),
        sa.ForeignKeyConstraint(['exercise_id'], ['exercises.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_cardio_best_efforts_exercise_id', 'cardio_best_efforts', ['exercise_id'])


def downgrade():
    op.drop_index('ix_cardio_best_efforts_exercise_id', table_name='cardio_best_efforts')
    op.drop_table('cardio_best_efforts')
