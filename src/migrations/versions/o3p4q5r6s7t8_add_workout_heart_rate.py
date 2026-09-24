"""add avg/max heart rate to workouts

Revision ID: o3p4q5r6s7t8
Revises: n2o3p4q5r6s7
Create Date: 2026-09-23

Beats per minute read back from Apple Health / Health Connect after a
workout is saved. Nullable with no default: a workout logged without a
wearable has no heart rate, which is distinct from a measured 0.
"""
from alembic import op
import sqlalchemy as sa

revision = 'o3p4q5r6s7t8'
down_revision = 'n2o3p4q5r6s7'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('workouts') as batch_op:
        batch_op.add_column(sa.Column('avg_heart_rate', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('max_heart_rate', sa.Integer(), nullable=True))


def downgrade():
    with op.batch_alter_table('workouts') as batch_op:
        batch_op.drop_column('max_heart_rate')
        batch_op.drop_column('avg_heart_rate')
