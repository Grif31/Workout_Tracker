"""Add weight_context to personal_records for per-weight rep PRs

Revision ID: e3f4a5b6c7d8
Revises: af3f1dfc30e9
Create Date: 2026-05-04 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = 'e3f4a5b6c7d8'
down_revision = 'af3f1dfc30e9'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('personal_records', schema=None) as batch_op:
        batch_op.add_column(sa.Column('weight_context', sa.Float(), nullable=False, server_default='-1'))
        batch_op.drop_constraint('uq_pr_user_exercise_type', type_='unique')
        batch_op.create_unique_constraint(
            'uq_pr_user_exercise_type_weight',
            ['user_id', 'exercise_template_id', 'pr_type', 'weight_context'],
        )


def downgrade():
    with op.batch_alter_table('personal_records', schema=None) as batch_op:
        batch_op.drop_constraint('uq_pr_user_exercise_type_weight', type_='unique')
        batch_op.create_unique_constraint(
            'uq_pr_user_exercise_type',
            ['user_id', 'exercise_template_id', 'pr_type'],
        )
        batch_op.drop_column('weight_context')
