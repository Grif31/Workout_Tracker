"""add ai_call_log

Revision ID: e9f0a1b2c3d4
Revises: b6c7d8e9f0a1
Create Date: 2026-10-18

One row per Anthropic call (endpoint, user, model, tokens, latency, success),
for the admin's AI usage page.
"""
from alembic import op
import sqlalchemy as sa

revision = 'e9f0a1b2c3d4'
down_revision = 'b6c7d8e9f0a1'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'ai_call_log',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('endpoint', sa.String(length=32), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=True),
        sa.Column('model', sa.String(length=64), nullable=False),
        sa.Column('input_tokens', sa.Integer(), nullable=True),
        sa.Column('output_tokens', sa.Integer(), nullable=True),
        sa.Column('cache_read_tokens', sa.Integer(), nullable=True),
        sa.Column('cache_write_tokens', sa.Integer(), nullable=True),
        sa.Column('latency_ms', sa.Integer(), nullable=False),
        sa.Column('ok', sa.Boolean(), nullable=False),
        sa.Column('error', sa.String(length=200), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['user.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_ai_call_log_user_id', 'ai_call_log', ['user_id'])
    op.create_index('ix_ai_call_log_created_at', 'ai_call_log', ['created_at'])


def downgrade():
    op.drop_index('ix_ai_call_log_created_at', table_name='ai_call_log')
    op.drop_index('ix_ai_call_log_user_id', table_name='ai_call_log')
    op.drop_table('ai_call_log')
