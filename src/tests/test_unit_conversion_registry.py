"""
Tripwire for the kg<->lbs unit-switch invariant.

Stored weights are always in the user's *current* unit; switching units
bulk-converts them in _convert_stored_weights (routes/user_routes.py). The
pr_events table was originally missed by that function and silently drifted
out of unit after a switch — this test makes that mistake loud for the next
new table.

Every column whose name suggests it may hold a weight (or a weight-derived
value) must be classified below as CONVERTED (handled by
_convert_stored_weights), or EXEMPT (with the reason it doesn't convert).
Adding a new weight-ish column without classifying it fails this test.
"""
from models import db


# Converted by _convert_stored_weights on unit switch. If you add a column
# here, add the matching .update() there AND a round-trip test.
CONVERTED = {
    ('user', 'bodyweight'),                    # converted inline in PATCH /api/me
    ('sets', 'weight'),
    ('bodyweight_logs', 'weight'),
    ('personal_records', 'value'),             # weight-typed prs only (max_weight / estimated_1rm)
    ('personal_records', 'weight_context'),    # max_reps: the weight the reps were done at
    ('pr_events', 'value'),                    # weight-typed prs only
    ('pr_events', 'previous_value'),           # weight-typed prs only
    ('pr_events', 'weight_context'),           # max_reps weight context
}

# Deliberately NOT converted — each entry needs a reason.
EXEMPT = {
    ('user', 'weight_unit'): 'the unit label itself, not a weight',
    ('workouts', 'volume'):  'canonical lbs by convention (see CLAUDE.md)',
}

# Column-name fragments that suggest a weight or weight-derived value.
SUSPICIOUS_FRAGMENTS = ('weight', 'value', 'volume')


def _weightish_columns():
    found = set()
    for table in db.metadata.tables.values():
        for col in table.columns:
            if any(f in col.name.lower() for f in SUSPICIOUS_FRAGMENTS):
                found.add((table.name, col.name))
    return found


def test_every_weightish_column_is_classified():
    unclassified = _weightish_columns() - CONVERTED - set(EXEMPT)
    assert not unclassified, (
        f'New weight-like column(s) {sorted(unclassified)} are not classified for '
        f'kg<->lbs unit switching. Either wire them into _convert_stored_weights '
        f'(routes/user_routes.py) and add them to CONVERTED in this test, or add '
        f'them to EXEMPT with the reason they never convert. Stored weights must '
        f'always be in the user\'s current unit.'
    )


def test_registry_entries_still_exist():
    """Renaming or dropping a classified column must update this registry too."""
    existing = _weightish_columns()
    stale = (CONVERTED | set(EXEMPT)) - existing
    assert not stale, f'Registry entries {sorted(stale)} no longer exist in models.py'
