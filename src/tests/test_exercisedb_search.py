"""The admin's GIF search over the local ExerciseDB catalog (utils/exercisedb.py).
Pure functions, so no app or DB: each case is a wording someone types that
ExerciseDB spells differently."""
from utils.exercisedb import highlight, normalize, search


def _e(name, equipment='barbell', target='pectorals', body_part='chest', id_=None):
    return {'id': id_ or name, 'name': name, 'equipment': equipment, 'target': target, 'body_part': body_part}


def _names(entries, query, **kw):
    matches, _, _ = search(entries, query, **kw)
    return [e['name'] for e in matches]


class TestNormalize:

    def test_lowercases_and_drops_punctuation(self):
        assert normalize('3/4 Sit-Up') == ['3', '4', 'situp']

    def test_plurals_match_singulars(self):
        assert normalize('lateral raises') == normalize('lateral raise')
        assert normalize('pull ups') == normalize('pull-up') == ['pullup']

    def test_press_keeps_its_double_s(self):
        assert normalize('press') == ['press']

    def test_split_words_are_joined(self):
        assert normalize('lat pull down') == ['lat', 'pulldown']
        assert normalize('triceps push-down') == normalize('tricep pushdown')
        assert normalize('dead lift') == ['deadlift']

    def test_word_aliases(self):
        assert normalize('DB fly') == ['dumbbell', 'fly']
        assert normalize('dumbbell flyes') == ['dumbbell', 'fly']
        assert normalize('bb row') == ['barbell', 'row']
        assert normalize('kb swing') == ['kettlebell', 'swing']


class TestSearch:

    CATALOG = [
        _e('dumbbell incline bench press', equipment='dumbbell'),
        _e('barbell incline bench press'),
        _e('barbell bench press'),
        _e('barbell decline bench press'),
        _e('barbell romanian deadlift', target='hamstrings', body_part='upper legs'),
        _e('barbell deadlift', target='glutes', body_part='upper legs'),
        _e('cable pulldown', equipment='cable', target='lats', body_part='back'),
        _e('barbell lying triceps extension skull crusher', target='triceps', body_part='upper arms'),
        _e('dumbbell seated shoulder press', equipment='dumbbell', target='delts', body_part='shoulders'),
        _e('pull-up', equipment='body weight', target='lats', body_part='back'),
    ]

    def test_word_order_does_not_matter(self):
        assert _names(self.CATALOG, 'incline dumbbell press') == ['dumbbell incline bench press']

    def test_every_word_must_appear(self):
        assert 'barbell deadlift' not in _names(self.CATALOG, 'romanian deadlift')

    def test_fewest_extra_words_rank_first(self):
        assert _names(self.CATALOG, 'bench press')[0] == 'barbell bench press'

    def test_shorthand_finds_the_spelled_out_name(self):
        assert _names(self.CATALOG, 'rdl') == ['barbell romanian deadlift']
        assert _names(self.CATALOG, 'skull crusher') == ['barbell lying triceps extension skull crusher']
        assert _names(self.CATALOG, 'db shoulder press') == ['dumbbell seated shoulder press']

    def test_overhead_and_military_press_find_shoulder_press(self):
        assert _names(self.CATALOG, 'dumbbell overhead press') == ['dumbbell seated shoulder press']
        assert _names(self.CATALOG, 'military press') == ['dumbbell seated shoulder press']

    def test_lat_pulldown_finds_a_name_without_lat(self):
        assert _names(self.CATALOG, 'lat pulldown') == ['cable pulldown']

    def test_spacing_and_plurals_in_the_query(self):
        assert _names(self.CATALOG, 'pull ups') == ['pull-up']
        assert _names(self.CATALOG, 'lat pull down') == ['cable pulldown']

    def test_last_word_matches_as_a_prefix_while_typing(self):
        assert 'dumbbell incline bench press' in _names(self.CATALOG, 'dumbbell incl')

    def test_filters(self):
        # Same number of extra words, so alphabetical
        assert _names(self.CATALOG, 'press', equipment='dumbbell') == [
            'dumbbell incline bench press', 'dumbbell seated shoulder press']
        assert _names(self.CATALOG, '', target='lats') == ['pull-up', 'cable pulldown']
        assert _names(self.CATALOG, 'deadlift', body_part='upper legs') == [
            'barbell deadlift', 'barbell romanian deadlift']

    def test_target_matching_our_muscle_group_breaks_ties(self):
        catalog = [_e('cable row a', target='biceps'), _e('cable row b', target='upper back')]
        assert _names(catalog, 'cable row', our_muscle_group='Back, Biceps') == ['cable row b', 'cable row a']
        assert _names(catalog, 'cable row', our_muscle_group='Biceps') == ['cable row a', 'cable row b']

    def test_close_matches_miss_one_word_and_only_show_when_few_full_matches(self):
        matches, close, _ = search(self.CATALOG, 'barbell romanian row')
        assert matches == []
        assert [e['name'] for e in close] == ['barbell romanian deadlift']
        _, close, _ = search([_e(f'barbell bench press {i}') for i in range(5)] + [_e('barbell press')],
                             'barbell bench press')
        assert close == []

    def test_a_one_word_query_has_no_close_matches(self):
        _, close, _ = search(self.CATALOG, 'zercher')
        assert close == []

    def test_empty_query_lists_everything_shortest_first(self):
        names = _names(self.CATALOG, '')
        assert len(names) == len(self.CATALOG)
        assert names[0] == 'pull-up'


class TestHighlight:

    def test_marks_the_words_the_query_matched(self):
        assert highlight('Dumbbell Incline Bench Press', normalize('incline db press')) == [
            ['Dumbbell', True], ['Incline', True], ['Bench', False], ['Press', True]]

    def test_prefix_of_the_last_word(self):
        assert highlight('barbell incline press', normalize('barbell inc'))[1] == ['incline', True]

    def test_empty_query_marks_nothing(self):
        assert highlight('barbell squat', []) == [['barbell', False], ['squat', False]]
