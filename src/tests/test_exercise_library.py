"""The exercise library is defined twice: seed.py (fresh databases) and the
data migrations that add rows to production. These checks keep the two from
drifting, and make sure every library exercise ships with how-to text."""
import importlib.util
import os

from seed import EXERCISES, CARDIO_EXERCISES, MULTI_PRIMARY_OVERRIDES, DURATION_EXERCISES
from utils.exercise_descriptions import EXERCISE_DESCRIPTIONS
from utils.strength_standards import SEEDER_STANDARDS_MAP
from utils.volume import derive_bodyweight_load_factor

_MIGRATION = os.path.join(
    os.path.dirname(__file__), '..', 'migrations', 'versions', 'y3z4a5b6c7d8_add_library_exercises.py'
)


def _load_migration():
    spec = importlib.util.spec_from_file_location('add_library_exercises', _MIGRATION)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_every_library_exercise_has_a_description():
    names = {name for name, _m, _e in EXERCISES} | {name for name, _e in CARDIO_EXERCISES}
    assert sorted(n for n in names if n not in EXERCISE_DESCRIPTIONS) == []


def test_library_has_no_duplicate_rows():
    assert len(EXERCISES) == len(set((n, e) for n, _m, e in EXERCISES))
    assert len(CARDIO_EXERCISES) == len(set(CARDIO_EXERCISES))


def test_duration_names_are_library_exercises():
    names = {name for name, _m, _e in EXERCISES}
    assert DURATION_EXERCISES <= names


def test_migration_rows_match_seed():
    mig = _load_migration()
    seeded = {(n, e): m for n, m, e in EXERCISES}
    for name, equipment, etype, muscles, primaries, sk, lf in mig.STRENGTH:
        parts = [p.strip() for p in seeded[(name, equipment)].split(',')]
        extra = MULTI_PRIMARY_OVERRIDES.get(name, set())
        assert muscles == parts, name
        assert primaries == [p for i, p in enumerate(parts) if i == 0 or p in extra], name
        assert etype == ('duration' if name in DURATION_EXERCISES else 'strength'), name
        assert sk == SEEDER_STANDARDS_MAP.get((name.lower(), equipment.lower())), name
        assert lf == derive_bodyweight_load_factor(name, equipment), name
    for row in mig.CARDIO:
        assert row in CARDIO_EXERCISES
