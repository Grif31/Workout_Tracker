"""make library Plank and Dead Hang timed holds

Both were seeded as 'strength' before the 'duration' type existed, so they
asked for reps and weight. Only the library rows change: each logged Exercise
row keeps its own exercise_type, so past rep-logged sets stay as they were,
and exercise stats leave them off the hold chart. Users' own custom exercises
of the same name are left alone.

Revision ID: z4a5b6c7d8e9
Revises: y3z4a5b6c7d8
Create Date: 2026-10-17

"""
from alembic import op
import sqlalchemy as sa

revision = 'z4a5b6c7d8e9'
down_revision = 'y3z4a5b6c7d8'
branch_labels = None
depends_on = None

_WHERE = "WHERE name IN ('Plank', 'Dead Hang') AND equipment = 'Bodyweight' AND user_id IS NULL"


def upgrade():
    op.get_bind().execute(sa.text(f'UPDATE "exerciseTemplates" SET exercise_type = \'duration\' {_WHERE}'))


def downgrade():
    op.get_bind().execute(sa.text(f'UPDATE "exerciseTemplates" SET exercise_type = \'strength\' {_WHERE}'))
