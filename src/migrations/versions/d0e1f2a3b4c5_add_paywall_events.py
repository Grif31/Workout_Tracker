"""add paywall_events

Revision ID: d0e1f2a3b4c5
Revises: c9d0e1f2a3b4
Create Date: 2026-10-31

One row per step toward Premium (teaser shown, paywall opened, plan picked,
purchase or restore and its outcome), for the admin's Paywall page.
"""
from alembic import op
import sqlalchemy as sa

revision = 'd0e1f2a3b4c5'
down_revision = 'c9d0e1f2a3b4'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'paywall_events',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=True),
        sa.Column('event', sa.String(length=32), nullable=False),
        sa.Column('source', sa.String(length=32), nullable=True),
        sa.Column('plan', sa.String(length=16), nullable=True),
        sa.Column('trial', sa.Boolean(), nullable=True),
        sa.Column('outcome', sa.String(length=16), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['user.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_paywall_events_user_id', 'paywall_events', ['user_id'])
    op.create_index('ix_paywall_events_created_at', 'paywall_events', ['created_at'])


def downgrade():
    op.drop_index('ix_paywall_events_created_at', table_name='paywall_events')
    op.drop_index('ix_paywall_events_user_id', table_name='paywall_events')
    op.drop_table('paywall_events')
