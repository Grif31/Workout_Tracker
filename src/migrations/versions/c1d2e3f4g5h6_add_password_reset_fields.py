"""add password reset OTP fields to user

Revision ID: c1d2e3f4g5h6
Revises: b2c3d4e5f6g7
Create Date: 2026-05-12
"""
from alembic import op
import sqlalchemy as sa

revision = 'c1d2e3f4g5h6'
down_revision = 'b2c3d4e5f6g7'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('user', schema=None) as batch_op:
        batch_op.add_column(sa.Column('reset_otp_hash',   sa.String(64), nullable=True))
        batch_op.add_column(sa.Column('reset_otp_expiry', sa.DateTime,   nullable=True))
        batch_op.add_column(sa.Column('is_social_only',   sa.Boolean,    nullable=False,
                                       server_default='0'))


def downgrade():
    with op.batch_alter_table('user', schema=None) as batch_op:
        batch_op.drop_column('is_social_only')
        batch_op.drop_column('reset_otp_expiry')
        batch_op.drop_column('reset_otp_hash')
