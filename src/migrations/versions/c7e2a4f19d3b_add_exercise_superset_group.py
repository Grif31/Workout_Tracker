"""add superset_group to exercises

Revision ID: c7e2a4f19d3b
Revises: b4c6d0e7f2a9
Create Date: 2026-11-17

Exercises in one workout sharing a superset_group are a superset: the lifter
alternates between them and rests once per round. NULL = not in one.
"""
from alembic import op
import sqlalchemy as sa

revision = 'c7e2a4f19d3b'
down_revision = 'b4c6d0e7f2a9'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('exercises') as batch_op:
        batch_op.add_column(sa.Column('superset_group', sa.Integer(), nullable=True))


def downgrade():
    with op.batch_alter_table('exercises') as batch_op:
        batch_op.drop_column('superset_group')
