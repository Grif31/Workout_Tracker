"""add client_id to workouts

Revision ID: x2y3z4a5b6c7
Revises: w1x2y3z4a5b6
Create Date: 2026-10-16

The app's own id for a workout, unique per user, so a save that timed out and
then arrived again from the offline queue returns the first workout instead of
creating a second. Nullable: workouts saved before this have none, and NULLs
never collide in the unique constraint.
"""
from alembic import op
import sqlalchemy as sa

revision = 'x2y3z4a5b6c7'
down_revision = 'w1x2y3z4a5b6'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('workouts') as batch_op:
        batch_op.add_column(sa.Column('client_id', sa.String(length=64), nullable=True))
        batch_op.create_unique_constraint('uq_workouts_user_client_id', ['user_id', 'client_id'])


def downgrade():
    with op.batch_alter_table('workouts') as batch_op:
        batch_op.drop_constraint('uq_workouts_user_client_id', type_='unique')
        batch_op.drop_column('client_id')
