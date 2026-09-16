"""add score_type to strength_score_snapshots

Revision ID: m1n2o3p4q5r6
Revises: l0m1n2o3p4q5
Create Date: 2026-09-15

The Endurance Score keeps its own history in the same table, so every read
filters by type. Existing rows are all strength scores, which the
server_default backfills.
"""
from alembic import op
import sqlalchemy as sa

revision = 'm1n2o3p4q5r6'
down_revision = 'l0m1n2o3p4q5'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'strength_score_snapshots',
        sa.Column('score_type', sa.String(length=16), nullable=False, server_default='strength'),
    )


def downgrade():
    op.drop_column('strength_score_snapshots', 'score_type')
