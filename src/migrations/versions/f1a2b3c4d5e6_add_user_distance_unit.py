"""add user.distance_unit

Revision ID: f1a2b3c4d5e6
Revises: e0f1a2b3c4d5
Create Date: 2026-11-05

The distance unit used to live only on the phone. Distance badges (TODO §27)
need the same ladder on the server, so the app now reports it.
"""
from alembic import op
import sqlalchemy as sa

revision = 'f1a2b3c4d5e6'
down_revision = 'e0f1a2b3c4d5'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('user', sa.Column('distance_unit', sa.String(length=2), nullable=True))


def downgrade():
    op.drop_column('user', 'distance_unit')
