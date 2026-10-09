"""add starter flag to routines and workout templates

Revision ID: s7t8u9v0w1x2
Revises: r6s7t8u9v0w1
Create Date: 2026-10-08

Marks what onboarding generated, so a free account's 5-template and 2-routine
caps don't count it. Existing rows are not starters.
"""
from alembic import op
import sqlalchemy as sa

revision = 's7t8u9v0w1x2'
down_revision = 'r6s7t8u9v0w1'
branch_labels = None
depends_on = None


def upgrade():
    for table in ('routines', 'workout_templates'):
        with op.batch_alter_table(table) as batch_op:
            batch_op.add_column(sa.Column('starter', sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade():
    for table in ('routines', 'workout_templates'):
        with op.batch_alter_table(table) as batch_op:
            batch_op.drop_column('starter')
