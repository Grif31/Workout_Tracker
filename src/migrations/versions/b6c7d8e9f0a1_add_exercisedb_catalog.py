"""add exercisedb catalog, thumbnail cache and image_source_id

Revision ID: b6c7d8e9f0a1
Revises: a5b6c7d8e9f0
Create Date: 2026-10-17

A local copy of ExerciseDB's exercise list for the admin's GIF search, a
cache of the thumbnails it shows (each costs one RapidAPI call), and the
ExerciseDB id an exercise's image came from.
"""
from alembic import op
import sqlalchemy as sa

revision = 'b6c7d8e9f0a1'
down_revision = 'a5b6c7d8e9f0'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'exercisedb_catalog',
        sa.Column('id', sa.String(length=16), nullable=False),
        sa.Column('name', sa.String(length=250), nullable=False),
        sa.Column('equipment', sa.String(length=64), nullable=False),
        sa.Column('body_part', sa.String(length=64), nullable=False),
        sa.Column('target', sa.String(length=64), nullable=False),
        sa.Column('secondary_muscles', sa.JSON(), nullable=True),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('fetched_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_table(
        'exercisedb_thumbnails',
        sa.Column('exercisedb_id', sa.String(length=16), nullable=False),
        sa.Column('content', sa.LargeBinary(), nullable=False),
        sa.Column('content_type', sa.String(length=64), nullable=False),
        sa.Column('fetched_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('exercisedb_id'),
    )
    with op.batch_alter_table('exerciseTemplates') as batch_op:
        batch_op.add_column(sa.Column('image_source_id', sa.String(length=16), nullable=True))


def downgrade():
    with op.batch_alter_table('exerciseTemplates') as batch_op:
        batch_op.drop_column('image_source_id')
    op.drop_table('exercisedb_thumbnails')
    op.drop_table('exercisedb_catalog')
