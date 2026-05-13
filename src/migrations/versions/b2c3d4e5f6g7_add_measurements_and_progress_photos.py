"""add body_measurements and progress_photos tables

Revision ID: b2c3d4e5f6g7
Revises: a1b2c3d4e5f6
Create Date: 2026-05-07

"""
from alembic import op
import sqlalchemy as sa

revision = 'b2c3d4e5f6g7'
down_revision = 'a1b2c3d4e5f6'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'body_measurements',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('user.id', ondelete='CASCADE'), nullable=False),
        sa.Column('date', sa.DateTime(), nullable=False),
        sa.Column('waist', sa.Float(), nullable=True),
        sa.Column('chest', sa.Float(), nullable=True),
        sa.Column('arms', sa.Float(), nullable=True),
        sa.Column('legs', sa.Float(), nullable=True),
    )
    op.create_index('ix_measurements_user_date', 'body_measurements', ['user_id', 'date'])

    op.create_table(
        'progress_photos',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('user.id', ondelete='CASCADE'), nullable=False),
        sa.Column('date', sa.DateTime(), nullable=False),
        sa.Column('photo_url', sa.Text(), nullable=False),
        sa.Column('notes', sa.String(250), nullable=True),
    )
    op.create_index('ix_progress_photos_user_date', 'progress_photos', ['user_id', 'date'])


def downgrade():
    op.drop_index('ix_progress_photos_user_date', table_name='progress_photos')
    op.drop_table('progress_photos')
    op.drop_index('ix_measurements_user_date', table_name='body_measurements')
    op.drop_table('body_measurements')
