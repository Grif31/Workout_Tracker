"""backfill standards_key='Running' on seeded Running templates

Revision ID: l0m1n2o3p4q5
Revises: k9l0m1n2o3p4
Create Date: 2026-09-02

The Endurance Score reads best_time PRs from templates whose standards_key is
'Running' (utils/endurance_standards.py). New databases get the key from
seed.py via SEEDER_STANDARDS_MAP; this backfills the two already-seeded global
Running templates (outdoor + treadmill) on existing databases. Scoped to
global library rows (user_id IS NULL) — user-created customs never carry a
standards_key, same as on the strength side.
"""
from alembic import op
import sqlalchemy as sa

revision = 'l0m1n2o3p4q5'
down_revision = 'k9l0m1n2o3p4'
branch_labels = None
depends_on = None


def upgrade():
    op.get_bind().execute(sa.text(
        '''UPDATE "exerciseTemplates" SET standards_key = 'Running' '''
        "WHERE lower(name) = 'running' AND exercise_type = 'cardio' AND user_id IS NULL"
    ))


def downgrade():
    op.get_bind().execute(sa.text(
        '''UPDATE "exerciseTemplates" SET standards_key = NULL '''
        "WHERE standards_key = 'Running'"
    ))
