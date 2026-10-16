"""add route_segments to exercises

Revision ID: u9v0w1x2y3z4
Revises: v0w1x2y3z4a5
Create Date: 2026-10-15

A GPS route split where the recording had a gap, as a list of encoded
polylines, so the app stops drawing a straight line across a pause, a resume
after a kill, or a stretch with no fixes. Nullable: routes saved before this
keep only route_polyline, which the app still draws as one line.
"""
from alembic import op
import sqlalchemy as sa

revision = 'u9v0w1x2y3z4'
down_revision = 'v0w1x2y3z4a5'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('exercises') as batch_op:
        batch_op.add_column(sa.Column('route_segments', sa.JSON(), nullable=True))


def downgrade():
    with op.batch_alter_table('exercises') as batch_op:
        batch_op.drop_column('route_segments')
