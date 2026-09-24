"""add token_version to user

Revision ID: q5r6s7t8u9v0
Revises: p4q5r6s7t8u9
Create Date: 2026-09-23

Stamped into every JWT and checked on each request, so a password change or
reset can revoke tokens issued before it. Existing rows start at 0, and a
token with no version claim reads as 0, so nobody is logged out by the deploy.
"""
from alembic import op
import sqlalchemy as sa

revision = 'q5r6s7t8u9v0'
down_revision = 'p4q5r6s7t8u9'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('user') as batch_op:
        batch_op.add_column(sa.Column('token_version', sa.Integer(), nullable=False, server_default='0'))


def downgrade():
    with op.batch_alter_table('user') as batch_op:
        batch_op.drop_column('token_version')
