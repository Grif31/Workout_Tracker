"""add cardio fields

Revision ID: f5g6h7i8j9k0
Revises: e3f4a5b6c7d8
Create Date: 2026-05-04

"""
from alembic import op
import sqlalchemy as sa

revision = 'f5g6h7i8j9k0'
down_revision = 'e3f4a5b6c7d8'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('exerciseTemplates') as batch_op:
        batch_op.add_column(sa.Column('exercise_type', sa.String(10), nullable=False, server_default='strength'))

    with op.batch_alter_table('exercises') as batch_op:
        batch_op.add_column(sa.Column('exercise_type', sa.String(10), nullable=False, server_default='strength'))
        batch_op.add_column(sa.Column('route_polyline', sa.Text(), nullable=True))

    with op.batch_alter_table('sets') as batch_op:
        batch_op.add_column(sa.Column('cardio_duration', sa.Float(), nullable=True))
        batch_op.add_column(sa.Column('distance', sa.Float(), nullable=True))
        batch_op.add_column(sa.Column('distance_unit', sa.String(5), nullable=True))
        batch_op.add_column(sa.Column('intensity', sa.Float(), nullable=True))


def downgrade():
    with op.batch_alter_table('sets') as batch_op:
        batch_op.drop_column('intensity')
        batch_op.drop_column('distance_unit')
        batch_op.drop_column('distance')
        batch_op.drop_column('cardio_duration')

    with op.batch_alter_table('exercises') as batch_op:
        batch_op.drop_column('route_polyline')
        batch_op.drop_column('exercise_type')

    with op.batch_alter_table('exerciseTemplates') as batch_op:
        batch_op.drop_column('exercise_type')
