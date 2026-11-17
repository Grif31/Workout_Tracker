"""add superset_group to workout_template_exercises

Revision ID: d3f8b1a6c2e4
Revises: c7e2a4f19d3b
Create Date: 2026-11-17

A template's supersets, so a superset template logs as one. Same rules as
exercises.superset_group; NULL = not in one.
"""
from alembic import op
import sqlalchemy as sa

revision = 'd3f8b1a6c2e4'
down_revision = 'c7e2a4f19d3b'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('workout_template_exercises') as batch_op:
        batch_op.add_column(sa.Column('superset_group', sa.Integer(), nullable=True))


def downgrade():
    with op.batch_alter_table('workout_template_exercises') as batch_op:
        batch_op.drop_column('superset_group')
