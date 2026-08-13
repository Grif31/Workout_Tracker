"""Add pr_events table — append-only PR history

Revision ID: j8k9l0m1n2o3
Revises: afd934d089d7
Create Date: 2026-08-11
"""
from alembic import op
import sqlalchemy as sa

revision = 'j8k9l0m1n2o3'
down_revision = 'afd934d089d7'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'pr_events',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('exercise_template_id', sa.Integer(), nullable=False),
        sa.Column('workout_id', sa.Integer(), nullable=False),
        sa.Column('pr_type', sa.String(length=20), nullable=False),
        sa.Column('value', sa.Float(), nullable=False),
        sa.Column('weight_context', sa.Float(), nullable=False),
        sa.Column('previous_value', sa.Float(), nullable=True),
        sa.Column('achieved_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['user.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['exercise_template_id'], ['exerciseTemplates.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['workout_id'], ['workouts.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_pr_events_user_achieved', 'pr_events', ['user_id', 'achieved_at'])
    op.create_index('ix_pr_events_user_template', 'pr_events', ['user_id', 'exercise_template_id'])


def downgrade():
    op.drop_index('ix_pr_events_user_template', table_name='pr_events')
    op.drop_index('ix_pr_events_user_achieved', table_name='pr_events')
    op.drop_table('pr_events')
