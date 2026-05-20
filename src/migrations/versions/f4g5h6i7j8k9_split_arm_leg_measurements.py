"""split arms/legs into right_arm, left_arm, right_leg, left_leg

Revision ID: f4g5h6i7j8k9
Revises: e3f4g5h6i7j8
Create Date: 2026-05-14
"""
from alembic import op
import sqlalchemy as sa

revision = 'f4g5h6i7j8k9'
down_revision = 'e3f4g5h6i7j8'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('body_measurements', sa.Column('right_arm', sa.Float(), nullable=True))
    op.add_column('body_measurements', sa.Column('left_arm', sa.Float(), nullable=True))
    op.add_column('body_measurements', sa.Column('right_leg', sa.Float(), nullable=True))
    op.add_column('body_measurements', sa.Column('left_leg', sa.Float(), nullable=True))
    # Migrate existing combined values into right_arm / right_leg (left side stays null)
    op.execute('UPDATE body_measurements SET right_arm = arms, right_leg = legs')
    op.drop_column('body_measurements', 'arms')
    op.drop_column('body_measurements', 'legs')


def downgrade():
    op.add_column('body_measurements', sa.Column('arms', sa.Float(), nullable=True))
    op.add_column('body_measurements', sa.Column('legs', sa.Float(), nullable=True))
    op.execute('UPDATE body_measurements SET arms = right_arm, legs = right_leg')
    op.drop_column('body_measurements', 'right_arm')
    op.drop_column('body_measurements', 'left_arm')
    op.drop_column('body_measurements', 'right_leg')
    op.drop_column('body_measurements', 'left_leg')
