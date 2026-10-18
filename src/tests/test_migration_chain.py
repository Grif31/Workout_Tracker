"""The migration files form one unbroken chain. The suite builds its tables
with create_all, so a broken chain would otherwise only show on deploy, where
`flask db upgrade` runs before gunicorn and a failure keeps the app down."""
import os
import re
from collections import Counter

VERSIONS = os.path.join(os.path.dirname(__file__), '..', 'migrations', 'versions')


def _revisions():
    out = []
    for name in sorted(os.listdir(VERSIONS)):
        if not name.endswith('.py'):
            continue
        text = open(os.path.join(VERSIONS, name), encoding='utf-8').read()
        rev = re.search(r"^revision\s*=\s*['\"]([^'\"]+)['\"]", text, re.M).group(1)
        down = re.search(r"^down_revision\s*=\s*(.+)$", text, re.M).group(1).strip()
        downs = re.findall(r"['\"]([^'\"]+)['\"]", down)
        out.append((name, rev, downs))
    return out


def test_every_revision_id_is_unique():
    counts = Counter(rev for _, rev, _ in _revisions())
    dupes = {rev: [n for n, r, _ in _revisions() if r == rev] for rev, c in counts.items() if c > 1}
    assert not dupes, f'Two migrations share a revision id: {dupes}'


def test_every_down_revision_exists():
    revs = {rev for _, rev, _ in _revisions()}
    missing = [(n, d) for n, _, downs in _revisions() for d in downs if d not in revs]
    assert not missing, f'down_revision points at no migration: {missing}'


def test_there_is_exactly_one_head():
    revs = {rev for _, rev, _ in _revisions()}
    pointed_at = {d for _, _, downs in _revisions() for d in downs}
    heads = revs - pointed_at
    assert len(heads) == 1, f'Expected one head, found {sorted(heads)}'
