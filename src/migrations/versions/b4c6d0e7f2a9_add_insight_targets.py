"""add target, outcome and checked_at to insights

Revision ID: b4c6d0e7f2a9
Revises: a3b5c9d6e1f8
Create Date: 2026-11-12

A suggestion can name a measurable change (sets for a muscle, workouts in a
week, a lift's heaviest set). The server records where the client started
and later checks the data against it, so the Coach's follow-up rests on a
measurement and each user builds a record of which changes they make.
"""
from alembic import op
import sqlalchemy as sa

revision = 'b4c6d0e7f2a9'
down_revision = 'a3b5c9d6e1f8'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('insights') as batch_op:
        batch_op.add_column(sa.Column('target', sa.JSON(), nullable=True))
        batch_op.add_column(sa.Column('outcome', sa.String(length=16), nullable=True))
        batch_op.add_column(sa.Column('checked_at', sa.DateTime(), nullable=True))


def downgrade():
    with op.batch_alter_table('insights') as batch_op:
        batch_op.drop_column('checked_at')
        batch_op.drop_column('outcome')
        batch_op.drop_column('target')
