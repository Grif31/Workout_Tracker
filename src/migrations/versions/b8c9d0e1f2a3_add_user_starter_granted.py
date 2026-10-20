"""add starter_granted to user

Revision ID: b8c9d0e1f2a3
Revises: a7b8c9d0e1f2
Create Date: 2026-10-20

A free account may generate and save one onboarding routine. That used to be
read from whether a starter routine exists, so deleting it renewed the
exemption. Accounts that already have one start with the flag set.
"""
from alembic import op
import sqlalchemy as sa

revision = 'b8c9d0e1f2a3'
down_revision = 'a7b8c9d0e1f2'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('user') as batch_op:
        batch_op.add_column(sa.Column('starter_granted', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.execute(sa.text(
        'UPDATE "user" SET starter_granted = :t '
        'WHERE id IN (SELECT user_id FROM routines WHERE starter = :t)'
    ).bindparams(t=True))


def downgrade():
    with op.batch_alter_table('user') as batch_op:
        batch_op.drop_column('starter_granted')
