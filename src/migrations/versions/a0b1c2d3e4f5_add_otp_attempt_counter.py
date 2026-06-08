"""add reset_otp_attempts to user

Revision ID: a0b1c2d3e4f5
Revises: 9e53g2b4c6d7
Create Date: 2026-06-07

"""
from alembic import op
import sqlalchemy as sa

revision = 'a0b1c2d3e4f5'
down_revision = '9e53g2b4c6d7'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('user', schema=None) as batch_op:
        batch_op.add_column(sa.Column('reset_otp_attempts', sa.Integer,
                                      nullable=False, server_default='0'))


def downgrade():
    with op.batch_alter_table('user', schema=None) as batch_op:
        batch_op.drop_column('reset_otp_attempts')
