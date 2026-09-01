"""add bodyweight_load_factor to exercise_templates

Revision ID: k9l0m1n2o3p4
Revises: j8k9l0m1n2o3
Create Date: 2026-09-01

Bodyweight/Weighted volume math adds the user's bodyweight scaled by this
fraction -- a push-up shifts ~60% of bodyweight, a sit-up ~35%, a pull-up
~100%. NULL is treated as 1.0 by compute_effective_weight, so pre-existing
custom exercises on other equipment are unaffected. Seeds the library (and
any existing Bodyweight/Weighted customs) from the name-based heuristic in
utils/volume.derive_bodyweight_load_factor.
"""
from alembic import op
import sqlalchemy as sa

revision = 'k9l0m1n2o3p4'
down_revision = 'j8k9l0m1n2o3'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('exerciseTemplates', sa.Column('bodyweight_load_factor', sa.Float(), nullable=True))

    bind = op.get_bind()
    rows = bind.execute(sa.text(
        'SELECT id, name, equipment FROM "exerciseTemplates" '
        "WHERE equipment IN ('Bodyweight', 'Weighted')"
    )).fetchall()

    import sys, os
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))
    from utils.volume import derive_bodyweight_load_factor

    for tmpl_id, name, equipment in rows:
        factor = derive_bodyweight_load_factor(name, equipment)
        if factor is not None:
            bind.execute(
                sa.text('UPDATE "exerciseTemplates" SET bodyweight_load_factor = :f WHERE id = :id'),
                {'f': factor, 'id': tmpl_id},
            )


def downgrade():
    op.drop_column('exerciseTemplates', 'bodyweight_load_factor')
