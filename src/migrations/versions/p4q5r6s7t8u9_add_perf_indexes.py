"""index exercises.exercise_template_id and personal_records.set_id

Revision ID: p4q5r6s7t8u9
Revises: o3p4q5r6s7t8
Create Date: 2026-09-23

Two FK columns Postgres does not index on its own, both on hot read paths:

exercises.exercise_template_id is what the strength-score percentile queries,
/api/stats/exercise, recent-exercises and muscle-volume all filter or group on.

personal_records.set_id is joined per workout card by /api/workouts/recent and
the date-filtered list, which the Dashboard requests on every focus.
"""
from alembic import op

revision = 'p4q5r6s7t8u9'
down_revision = 'o3p4q5r6s7t8'
branch_labels = None
depends_on = None


def upgrade():
    op.create_index('ix_exercises_exercise_template_id', 'exercises', ['exercise_template_id'])
    op.create_index('ix_personal_records_set_id', 'personal_records', ['set_id'])


def downgrade():
    op.drop_index('ix_personal_records_set_id', table_name='personal_records')
    op.drop_index('ix_exercises_exercise_template_id', table_name='exercises')
