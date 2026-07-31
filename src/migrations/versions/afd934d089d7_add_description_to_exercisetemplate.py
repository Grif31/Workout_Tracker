"""Add description to ExerciseTemplate

Revision ID: afd934d089d7
Revises: i7j8k9l0m1n2
Create Date: 2026-07-30 00:09:04.161667

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'afd934d089d7'
down_revision = 'i7j8k9l0m1n2'
branch_labels = None
depends_on = None


def upgrade():
    # Only the new column — the index drop/recreate autogenerate also detected
    # is just a SQLite-vs-Postgres index-name-casing artifact from local dev,
    # unrelated to this change.
    with op.batch_alter_table('exerciseTemplates', schema=None) as batch_op:
        batch_op.add_column(sa.Column('description', sa.Text(), nullable=True))


def downgrade():
    with op.batch_alter_table('exerciseTemplates', schema=None) as batch_op:
        batch_op.drop_column('description')
