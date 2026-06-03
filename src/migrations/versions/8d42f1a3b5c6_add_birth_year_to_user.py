"""add birth_date to user

Revision ID: 8d42f1a3b5c6
Revises: 7c31ec05b69d
Create Date: 2026-06-03

"""
from alembic import op
import sqlalchemy as sa

revision = '8d42f1a3b5c6'
down_revision = '7c31ec05b69d'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('user', sa.Column('birth_date', sa.Date(), nullable=True))


def downgrade():
    op.drop_column('user', 'birth_date')
