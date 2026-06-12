"""add weighted pull up and dips exercise templates

Bodyweight exercises are reps-only; added-weight work belongs on these
separate 'Weighted' equipment variants (same standards_key, so both feed
the same strength-score percentile).

Revision ID: d8e9f0a1b2c3
Revises: c7d8e9f0a1b2
Create Date: 2026-06-12

"""
from alembic import op
import sqlalchemy as sa

revision = 'd8e9f0a1b2c3'
down_revision = 'c7d8e9f0a1b2'
branch_labels = None
depends_on = None

WEIGHTED_VARIANTS = [
    # (name, standards_key, [muscles, primary first])
    ('Pull Up', 'Pull-up', ['Back', 'Biceps']),
    ('Dips',    'Dips',    ['Triceps', 'Chest', 'Shoulders']),
]


def upgrade():
    bind = op.get_bind()
    for name, standards_key, muscles in WEIGHTED_VARIANTS:
        existing = bind.execute(
            sa.text(
                'SELECT id FROM "exerciseTemplates" '
                "WHERE name = :name AND equipment = 'Weighted' AND user_id IS NULL"
            ),
            {'name': name},
        ).fetchone()
        if existing:
            continue

        image_row = bind.execute(
            sa.text(
                'SELECT image_url FROM "exerciseTemplates" '
                "WHERE name = :name AND equipment = 'Bodyweight' AND user_id IS NULL"
            ),
            {'name': name},
        ).fetchone()
        image_url = image_row[0] if image_row else None

        result = bind.execute(
            sa.text(
                'INSERT INTO "exerciseTemplates" '
                '(name, equipment, image_url, exercise_type, standards_key) '
                "VALUES (:name, 'Weighted', :image_url, 'strength', :sk) "
                'RETURNING id'
            ),
            {'name': name, 'image_url': image_url, 'sk': standards_key},
        )
        tmpl_id = result.fetchone()[0]

        for i, muscle in enumerate(muscles):
            bind.execute(
                sa.text(
                    'INSERT INTO exercise_muscle_mappings '
                    '(exercise_template_id, muscle_group, is_primary) '
                    'VALUES (:tid, :mg, :prim)'
                ),
                {'tid': tmpl_id, 'mg': muscle, 'prim': i == 0},
            )


def downgrade():
    bind = op.get_bind()
    for name, _, _ in WEIGHTED_VARIANTS:
        bind.execute(
            sa.text(
                'DELETE FROM "exerciseTemplates" '
                "WHERE name = :name AND equipment = 'Weighted' AND user_id IS NULL"
            ),
            {'name': name},
        )
