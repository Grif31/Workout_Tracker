"""add user_id to exercise_templates for user-scoped custom exercises

Revision ID: b1c2d3e4f5g6
Revises: a0b1c2d3e4f5
Create Date: 2026-06-08

"""
from alembic import op
import sqlalchemy as sa

revision = 'b1c2d3e4f5g6'
down_revision = 'a0b1c2d3e4f5'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('exerciseTemplates', schema=None) as batch_op:
        batch_op.add_column(sa.Column('user_id', sa.Integer, nullable=True))
        batch_op.create_foreign_key(
            'fk_exercise_templates_user_id',
            'user', ['user_id'], ['id'],
            ondelete='CASCADE',
        )
        batch_op.create_index('ix_exercisetemplates_user_id', ['user_id'])
        batch_op.drop_constraint('uq_exercise_name_equipment', type_='unique')
        batch_op.create_unique_constraint(
            'uq_exercise_name_equipment_user', ['name', 'equipment', 'user_id']
        )


def downgrade():
    with op.batch_alter_table('exerciseTemplates', schema=None) as batch_op:
        batch_op.drop_constraint('uq_exercise_name_equipment_user', type_='unique')
        batch_op.create_unique_constraint('uq_exercise_name_equipment', ['name', 'equipment'])
        batch_op.drop_index('ix_exercisetemplates_user_id')
        batch_op.drop_constraint('fk_exercise_templates_user_id', type_='foreignkey')
        batch_op.drop_column('user_id')
