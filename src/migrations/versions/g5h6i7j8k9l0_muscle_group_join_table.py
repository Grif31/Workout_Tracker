"""replace muscle_group column with exercise_muscle_mappings join table

Revision ID: g5h6i7j8k9l0
Revises: f4g5h6i7j8k9
Create Date: 2026-05-15
"""
from collections import defaultdict
from alembic import op
import sqlalchemy as sa

revision = 'g5h6i7j8k9l0'
down_revision = 'f4g5h6i7j8k9'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'exercise_muscle_mappings',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column(
            'exercise_template_id',
            sa.Integer(),
            sa.ForeignKey('exerciseTemplates.id', ondelete='CASCADE'),
            nullable=False,
        ),
        sa.Column('muscle_group', sa.String(50), nullable=False),
        sa.Column('is_primary', sa.Boolean(), nullable=False, server_default='true'),
        sa.UniqueConstraint('exercise_template_id', 'muscle_group', name='uq_exercise_muscle'),
    )
    op.create_index(
        'ix_exercise_muscle_exercise_id',
        'exercise_muscle_mappings',
        ['exercise_template_id'],
    )

    # Migrate existing comma-separated values into the new table.
    # First part of the string is the primary mover; the rest are secondary.
    conn = op.get_bind()
    exercises = conn.execute(
        sa.text('SELECT id, muscle_group FROM "exerciseTemplates"')
    ).fetchall()

    rows = []
    for ex_id, muscle_group_str in exercises:
        if not muscle_group_str:
            continue
        parts = [p.strip() for p in muscle_group_str.split(',') if p.strip()]
        for i, muscle in enumerate(parts):
            rows.append({'ex_id': ex_id, 'muscle': muscle, 'is_primary': i == 0})

    if rows:
        conn.execute(
            sa.text(
                'INSERT INTO exercise_muscle_mappings '
                '(exercise_template_id, muscle_group, is_primary) '
                'VALUES (:ex_id, :muscle, :is_primary) '
                'ON CONFLICT DO NOTHING'
            ),
            rows,
        )

    op.drop_column('exerciseTemplates', 'muscle_group')


def downgrade():
    # Restore the column as nullable first, then backfill, then enforce NOT NULL.
    op.add_column(
        'exerciseTemplates',
        sa.Column('muscle_group', sa.String(250), nullable=True),
    )

    conn = op.get_bind()
    mappings = conn.execute(
        sa.text(
            'SELECT exercise_template_id, muscle_group, is_primary '
            'FROM exercise_muscle_mappings '
            'ORDER BY exercise_template_id, is_primary DESC, muscle_group'
        )
    ).fetchall()

    grouped: dict[int, list[str]] = defaultdict(list)
    for ex_id, muscle, is_primary in mappings:
        if is_primary:
            grouped[ex_id].insert(0, muscle)
        else:
            grouped[ex_id].append(muscle)

    for ex_id, muscles in grouped.items():
        conn.execute(
            sa.text('UPDATE "exerciseTemplates" SET muscle_group = :mg WHERE id = :id'),
            {'mg': ', '.join(muscles), 'id': ex_id},
        )

    op.drop_table('exercise_muscle_mappings')
