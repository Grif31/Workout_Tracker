"""imported workouts: duration from seconds to minutes

Revision ID: e1f3a7b4c9d6
Revises: d9e2f6a3b8c5
Create Date: 2026-11-11

The Hevy and Strong import stored Workout.duration in seconds; every other
writer and reader uses minutes, so an imported 65-minute session showed as 65
hours. Imported rows are the ones whose client_id starts with the app's name.
Runs with the deploy that makes the import write minutes, so every row it
finds is still in seconds.
"""
from alembic import op

revision = 'e1f3a7b4c9d6'
down_revision = 'd9e2f6a3b8c5'
branch_labels = None
depends_on = None


def upgrade():
    # Under a minute becomes NULL, as the import now stores it
    op.execute(
        "UPDATE workouts SET duration = NULLIF(duration / 60, 0) "
        "WHERE duration IS NOT NULL AND (client_id LIKE 'hevy:%' OR client_id LIKE 'strong:%')"
    )


def downgrade():
    # The seconds are gone; minutes are what the column means everywhere else
    pass
