"""add profile_pr_pins and user.pr_pins_saved

Revision ID: c8d1e5f2a7b4
Revises: f1a2b3c4d5e6
Create Date: 2026-11-06

The PRs shown on Profile were kept only on the phone, so a reinstall or a new
phone lost the choice.
"""
from alembic import op
import sqlalchemy as sa

revision = 'c8d1e5f2a7b4'
down_revision = 'f1a2b3c4d5e6'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'profile_pr_pins',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('user.id', ondelete='CASCADE'), nullable=False),
        sa.Column('position', sa.Integer(), nullable=False),
        sa.Column('exercise_template_id', sa.Integer(), sa.ForeignKey('exerciseTemplates.id', ondelete='CASCADE'), nullable=False),
        sa.Column('pr_type', sa.String(length=20), nullable=False),
        sa.Column('weight_context', sa.Float(), nullable=False),
    )
    op.create_index('ix_profile_pr_pins_user_id', 'profile_pr_pins', ['user_id'])
    op.add_column('user', sa.Column('pr_pins_saved', sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade():
    op.drop_column('user', 'pr_pins_saved')
    op.drop_index('ix_profile_pr_pins_user_id', table_name='profile_pr_pins')
    op.drop_table('profile_pr_pins')
