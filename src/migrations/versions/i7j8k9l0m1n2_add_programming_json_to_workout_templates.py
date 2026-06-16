"""add programming_json to workout_templates

Revision ID: i7j8k9l0m1n2
Revises: h6i7j8k9l0m1
Create Date: 2026-06-16

"""
from alembic import op
import sqlalchemy as sa

revision = 'i7j8k9l0m1n2'
down_revision = 'd8e9f0a1b2c3'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('workout_templates', sa.Column('programming_json', sa.Text(), nullable=True))


def downgrade():
    op.drop_column('workout_templates', 'programming_json')
