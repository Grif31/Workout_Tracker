"""add indexes and document volume-in-lbs invariant

Revision ID: a1b2c3d4e5f6
Revises: f5g6h7i8j9k0
Create Date: 2026-05-08

"""
from alembic import op

revision = 'a1b2c3d4e5f6'
down_revision = 'f5g6h7i8j9k0'
branch_labels = None
depends_on = None


def upgrade():
    # Compound index: the most common query — workouts for a user ordered by date
    op.create_index('ix_workouts_user_date', 'workouts', ['user_id', 'date'])
    # FK indexes: SQLAlchemy relationship loads always filter on these columns
    op.create_index('ix_exercises_workout_id', 'exercises', ['workout_id'])
    op.create_index('ix_sets_exercise_id', 'sets', ['exercise_id'])
    # Bodyweight history: filtered by user and ordered by date
    op.create_index('ix_bodyweight_user_date', 'bodyweight_logs', ['user_id', 'date'])


def downgrade():
    op.drop_index('ix_bodyweight_user_date', table_name='bodyweight_logs')
    op.drop_index('ix_sets_exercise_id', table_name='sets')
    op.drop_index('ix_exercises_workout_id', table_name='exercises')
    op.drop_index('ix_workouts_user_date', table_name='workouts')
