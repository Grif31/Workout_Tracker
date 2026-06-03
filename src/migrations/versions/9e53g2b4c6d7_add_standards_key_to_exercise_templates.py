"""add standards_key to exercise_templates

Revision ID: 9e53g2b4c6d7
Revises: 8d42f1a3b5c6
Create Date: 2026-06-03

"""
from alembic import op
import sqlalchemy as sa

revision = '9e53g2b4c6d7'
down_revision = '8d42f1a3b5c6'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('exerciseTemplates', sa.Column('standards_key', sa.String(100), nullable=True))
    op.create_index('ix_exercisetemplates_standards_key', 'exerciseTemplates', ['standards_key'])

    bind = op.get_bind()
    rows = bind.execute(sa.text('SELECT id, name, equipment FROM "exerciseTemplates"')).fetchall()

    import sys, os
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))
    from utils.strength_standards import SEEDER_STANDARDS_MAP

    for tmpl_id, name, equipment in rows:
        key = (name.lower() if name else '', equipment.lower() if equipment else None)
        standards_key = SEEDER_STANDARDS_MAP.get(key)
        if standards_key:
            bind.execute(
                sa.text('UPDATE "exerciseTemplates" SET standards_key = :sk WHERE id = :id'),
                {'sk': standards_key, 'id': tmpl_id},
            )


def downgrade():
    op.drop_index('ix_exercisetemplates_standards_key', table_name='exerciseTemplates')
    op.drop_column('exerciseTemplates', 'standards_key')
