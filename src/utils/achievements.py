"""Achievements (TODO §27): the badge catalogue and the replay that awards it.

Every badge is worked out by replaying the user's history in date order, so a
badge is credited to the workout that actually crossed it. The live check after
a save and `flask backfill-achievements` are the same code, and both only ever
insert: a badge, once earned, is kept even if the workout that earned it is
edited or deleted.

Ladders with a unit (volume, distance, plates) have a round ladder per unit,
and their keys name the rung (`volume_6`), never the value, so a kg/lbs switch
keeps what was earned and never awards the other unit's matching rung again.
"""
import re
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timedelta

from models import (db, BodyweightLog, Exercise, ExerciseTemplate, PREvent, Set,
                    UserAchievement, Workout)
from utils.endurance_standards import is_cycling
from utils.volume import bodyweight_lookup, volume_in_user_unit

KM_PER_MI = 1.609344
LBS_PER_KG = 2.20462262

# Runs and walks count toward running distance; rides, rowing, swimming and the
# rest of the cardio list don't, so a cyclist can't pass Pheidippides in an afternoon.
_ON_FOOT = re.compile(r'\brun|jog|walk|hik(e|ing)|ruck|sprint', re.IGNORECASE)

BIG_THREE = ('Bench Press', 'Squat', 'Deadlift')

# A logged "3.1 mi" is 4.989 km: whole-workout feats allow half a percent.
_FEAT_DISTANCE_TOLERANCE = 0.995

# A workout this many days after the last one is a comeback: the same gap that
# restarts a routine rotation (utils/routineRotation.ts).
COMEBACK_GAP_DAYS = 14

# Workout.duration is the logging screen's timer, in minutes. A timer left
# running overnight would hand out hours for good, so it counts up to this;
# logged cardio minutes are entered on purpose and count in full.
TIMER_CAP_MIN = 240


@dataclass(frozen=True)
class Ladder:
    track: str
    label: str
    measure: str        # what `_Replay.values[track]` holds
    thresholds: dict    # unit ('any' when unitless) -> rung thresholds
    titles: dict        # unit -> rung titles
    shown_after: str    # 'always', 'strength', 'run', 'ride', 'elevation' or 'lift:<standards_key>'
    group: str = None   # 'plates': the app draws the three lifts as one tile

    def unit_for(self, weight_unit, distance_unit):
        if 'any' in self.thresholds:
            return 'any'
        return weight_unit if self.measure in ('weight', 'plates') else distance_unit

    def keys(self):
        return [f'{self.track}_{i + 1}' for i in range(len(next(iter(self.thresholds.values()))))]


def _plates(lift, short):
    return Ladder(
        track=f'plates_{short.lower()}', label=short, measure='plates',
        thresholds={'lbs': [135, 225, 315, 405], 'kg': [60, 100, 140, 180]},
        titles={u: [f'{n} Plate {short}' for n in range(1, 5)] for u in ('lbs', 'kg')},
        shown_after=f'lift:{lift}', group='plates',
    )


LADDERS = [
    Ladder('workouts', 'Workouts', 'count',
           {'any': [1, 10, 25, 50, 100, 250, 500, 1000]},
           {'any': ['Ephebe', 'Palaestra', 'Gymnasion', 'Hoplite', 'Hekaton', 'Phalanx', 'Spartan', 'Chiliad']},
           'always'),
    Ladder('hours', 'Hours', 'hours',
           {'any': [10, 50, 100, 250, 500, 1000, 2500]},
           {'any': ['Hōra', 'Hemera', 'Selene', 'Etos', 'Olympiad', 'Aion', 'Chronos']},
           'always'),
    Ladder('volume', 'Volume', 'weight',
           {'lbs': [10_000, 50_000, 100_000, 250_000, 500_000, 1_000_000, 2_500_000, 5_000_000],
            'kg': [5_000, 25_000, 50_000, 100_000, 250_000, 500_000, 1_000_000, 2_500_000]},
           {'lbs': ['10K', '50K', '100K', 'Quarter Million', 'Half Million', 'Atlas', 'Colossus', 'Herculean'],
            'kg': ['5K', '25K', '50K', '100K', 'Quarter Million', 'Atlas', 'Colossus', 'Herculean']},
           'strength'),
    Ladder('streak', 'Weekly streak', 'weeks',
           {'any': [2, 4, 8, 12, 26, 52, 104]},
           {'any': ['Fortnight', 'Month Strong', '8 Weeks', 'Quarter', 'Half Year', 'One Year', 'Two Years']},
           'always'),
    Ladder('prs', 'PRs', 'count',
           {'any': [1, 25, 100, 250, 500, 1000, 2500, 5000]},
           {'any': ['First PR', '25 PRs', '100 PRs', '250 PRs', '500 PRs', '1,000 PRs', '2,500 PRs', '5,000 PRs']},
           'always'),
    Ladder('running', 'Running', 'distance',
           {'mi': [10, 26.2, 50, 100, 250, 500, 1000],
            'km': [10, 42.2, 100, 250, 500, 1000, 2000]},
           {'mi': ['10 Miles', 'Pheidippides', '50 Miles', '100 Miles', '250 Miles', '500 Miles', 'Odyssey'],
            'km': ['10 km', 'Pheidippides', '100 km', '250 km', '500 km', '1,000 km', 'Odyssey']},
           'run'),
    Ladder('ride', 'Ride', 'distance',
           {'mi': [25, 100, 250, 500, 1000, 2500, 5000],
            'km': [40, 150, 400, 800, 1600, 4000, 8000]},
           {u: ['Hippeus', 'Hippodrome', 'Quadriga', 'Pegasus', 'Helios', 'Okeanos', 'Oikoumene'] for u in ('mi', 'km')},
           'ride'),
    # Real mountain heights in metres, so one ladder serves both units
    Ladder('elevation', 'Elevation', 'metres',
           {'any': [277, 1026, 2457, 2917, 14_585, 35_004]},
           {'any': ['Lycabettus', 'Hymettus', 'Parnassus', 'Olympus', 'Olympus ×5', 'Dodekatheon']},
           'elevation'),
    Ladder('explorer', 'Exercises tried', 'count',
           {'any': [10, 25, 50, 100]},
           {'any': ['Xenos', 'Periegetes', 'Argonaut', 'Polymath']},
           'always'),
    _plates('Bench Press', 'Bench'),
    _plates('Squat', 'Squat'),
    _plates('Deadlift', 'Deadlift'),
]
LADDER_BY_TRACK = {l.track: l for l in LADDERS}

# key -> (title per unit, shown_after). One-off, earned once.
FEATS = {
    'feat_bw_bench':       ({'any': 'Bodyweight Bench'}, 'strength'),
    'feat_2xbw_deadlift':  ({'any': '2× BW Deadlift'}, 'strength'),
    'feat_1000_club':      ({'lbs': '1,000 lb Club', 'kg': '450 kg Club'}, 'strength'),
    'feat_first_5k':       ({'any': 'First 5K'}, 'run'),
    'feat_sub25_5k':       ({'any': 'Sub-25 5K'}, 'run'),
    'feat_marathon':       ({'any': 'Marathon'}, 'run'),
    'feat_century':        ({'mi': 'Century', 'km': 'Metric Century'}, 'ride'),
    'feat_nostos':         ({'any': 'Nostos'}, 'always'),
}
CLUB_TOTAL = {'lbs': 1000, 'kg': 450}
CENTURY_KM = {'mi': 100 * KM_PER_MI, 'km': 100}

# Shown only once earned. GET /api/achievements never sends an unearned one's
# name, only how many are left.
HIDDEN = {
    'hidden_neomenia':      'Neomenia',
    'hidden_embolimos':     'Embolimos',
    'hidden_three_hundred': 'The Three Hundred',
    'hidden_eos':           'Eos',
    'hidden_kairos':        'Kairos',
    'hidden_triad':         'Triad',
    'hidden_eniautos':      'Eniautos',
    'hidden_pi':            'Pi',
}

# Eos: a workout started before this local hour. Only new saves carry the hour
EOS_BEFORE_HOUR = 6

# PR types the app shows: estimated_1rm is never surfaced as a PR
_COUNTED_PR_TYPES_EXCLUDE = ('estimated_1rm',)


def _title(titles, unit):
    return titles.get(unit) or titles.get('any') or next(iter(titles.values()))


def _to_km(distance, unit):
    return distance * KM_PER_MI if (unit or 'km') == 'mi' else distance


def distance_unit_for(user):
    """The unit the app reports (PATCH /api/me). Until an account's app has
    reported it, the user's latest cardio set, then the weight unit."""
    if user.distance_unit in ('mi', 'km'):
        return user.distance_unit
    latest = (
        db.session.query(Set.distance_unit)
        .join(Exercise, Set.exercise_id == Exercise.id)
        .join(Workout, Exercise.workout_id == Workout.id)
        .filter(Workout.user_id == user.id, Set.distance_unit.in_(('mi', 'km')))
        .order_by(Workout.date.desc(), Set.id.desc())
        .first()
    )
    if latest:
        return latest[0]
    return 'km' if user.weight_unit == 'kg' else 'mi'


def _qualifies(reps, cardio_duration, distance):
    return bool((reps and reps > 0) or (cardio_duration and cardio_duration > 0) or (distance and distance > 0))


class _Replay:
    """Walks the user's workouts oldest first, keeping lifetime totals, and
    records the workout at which each badge was first crossed."""

    def __init__(self, user):
        self.user = user
        self.weight_unit = 'kg' if user.weight_unit == 'kg' else 'lbs'
        self.distance_unit = distance_unit_for(user)
        self.values = defaultdict(float)   # track -> lifetime value in the ladder's unit
        self.kinds = {'always'}            # shown_after groups the user has trained
        self.crossed = {}                  # key -> (workout_id, workout datetime)
        self._run()

    def _cross(self, key, workout_id, when):
        self.crossed.setdefault(key, (workout_id, when))

    def _load(self):
        uid = self.user.id
        workouts = (
            db.session.query(Workout.id, Workout.date, Workout.duration, Workout.volume,
                             Workout.local_start_hour)
            .filter(Workout.user_id == uid)
            .order_by(Workout.date.asc(), Workout.id.asc())
            .all()
        )
        sets_by_workout = defaultdict(list)
        for row in (
            db.session.query(
                Exercise.workout_id, Exercise.id, Exercise.exercise_type, Exercise.name,
                Exercise.exercise_template_id, ExerciseTemplate.name, ExerciseTemplate.standards_key,
                Set.reps, Set.weight, Set.set_type, Set.cardio_duration, Set.distance,
                Set.distance_unit, Set.elevation_gain, Exercise.negative_split,
            )
            .join(Workout, Exercise.workout_id == Workout.id)
            .join(Set, Set.exercise_id == Exercise.id)
            .outerjoin(ExerciseTemplate, Exercise.exercise_template_id == ExerciseTemplate.id)
            .filter(Workout.user_id == uid)
            .all()
        ):
            sets_by_workout[row[0]].append(row)
        prs_by_workout = defaultdict(list)
        for workout_id, pr_type, context, value, tmpl_name, standards_key in (
            db.session.query(PREvent.workout_id, PREvent.pr_type, PREvent.weight_context,
                             PREvent.value, ExerciseTemplate.name, ExerciseTemplate.standards_key)
            .join(ExerciseTemplate, PREvent.exercise_template_id == ExerciseTemplate.id)
            .filter(PREvent.user_id == uid, PREvent.pr_type.notin_(_COUNTED_PR_TYPES_EXCLUDE))
            .all()
        ):
            prs_by_workout[workout_id].append((pr_type, context, value, tmpl_name, standards_key))
        bodyweights = (
            db.session.query(BodyweightLog.date, BodyweightLog.weight)
            .filter(BodyweightLog.user_id == uid)
            .order_by(BodyweightLog.date.asc())
            .all()
        )
        return workouts, sets_by_workout, prs_by_workout, bodyweights

    def _run(self):
        workouts, sets_by_workout, prs_by_workout, bodyweights = self._load()
        wu, du = self.weight_unit, self.distance_unit
        count = 0
        volume_lbs = 0.0
        hours = 0.0
        run_km = ride_km = elevation_m = 0.0
        pr_count = 0
        tried = set()
        best_lift = {lift: 0.0 for lift in BIG_THREE}
        first_day = prev_day = None
        streak_monday = None
        streak_run = streak_longest = 0
        triad_weeks = defaultdict(set)
        bodyweight_at = bodyweight_lookup(bodyweights)

        for workout_id, when, duration, volume, start_hour in workouts:
            rows = [r for r in sets_by_workout.get(workout_id, ()) if _qualifies(r[7], r[10], r[11])]
            if not rows:
                continue
            day = when.date() if isinstance(when, datetime) else when
            cross = lambda key: self._cross(key, workout_id, when)

            count += 1
            volume_lbs += volume or 0.0

            w_run_km = w_ride_km = w_cardio_min = 0.0
            foot_by_exercise = defaultdict(float)   # exercise id -> distance in its own unit
            w_best = {lift: 0.0 for lift in BIG_THREE}
            w_negative_split = False
            for (_, ex_id, ex_type, ex_name, tmpl_id, tmpl_name, standards_key,
                 reps, weight, set_type, cardio_min, distance, dist_unit, elevation, negative_split) in rows:
                ex_type = (ex_type or 'strength').lower()
                tried.add(tmpl_id if tmpl_id else f'name:{(ex_name or "").strip().lower()}')
                if ex_type == 'cardio':
                    w_cardio_min += cardio_min or 0.0
                    name = tmpl_name or ex_name
                    km = _to_km(distance, dist_unit) if distance and distance > 0 else 0.0
                    if is_cycling(name):
                        self.kinds.add('ride')
                        w_ride_km += km
                    elif _ON_FOOT.search(name or ''):
                        self.kinds.add('run')
                        w_run_km += km
                        if distance and distance > 0:
                            foot_by_exercise[(ex_id, dist_unit or 'km')] += distance
                        if negative_split:
                            w_negative_split = True
                    if elevation and elevation > 0:
                        self.kinds.add('elevation')
                        elevation_m += elevation
                elif ex_type == 'strength':
                    self.kinds.add('strength')
                    if standards_key in BIG_THREE:
                        self.kinds.add(f'lift:{standards_key}')
                        if set_type != 'W' and reps and reps >= 1 and weight and weight > 0:
                            w_best[standards_key] = max(w_best[standards_key], weight)

            # Same rule as the weekly summary: cardio entered after the fact has
            # a near-zero timer, so the larger figure counts
            hours += max(min(duration or 0, TIMER_CAP_MIN), w_cardio_min) / 60
            run_km += w_run_km
            ride_km += w_ride_km
            for lift in BIG_THREE:
                best_lift[lift] = max(best_lift[lift], w_best[lift])

            # Weekly streak: consecutive Monday-weeks with a workout. Longest,
            # so a broken streak never re-locks anything.
            monday = day - timedelta(days=day.weekday())
            if monday != streak_monday:
                streak_run = streak_run + 1 if streak_monday == monday - timedelta(weeks=1) else 1
                streak_monday = monday
                streak_longest = max(streak_longest, streak_run)

            prs = prs_by_workout.get(workout_id, ())
            pr_count += len(prs)

            self.values.update({
                'workouts': count,
                'hours': hours,
                'volume': volume_in_user_unit(volume_lbs, wu),
                'streak': streak_longest,
                'prs': pr_count,
                'running': run_km / (KM_PER_MI if du == 'mi' else 1),
                'ride': ride_km / (KM_PER_MI if du == 'mi' else 1),
                'elevation': elevation_m,
                'explorer': len(tried),
                'plates_bench': best_lift['Bench Press'],
                'plates_squat': best_lift['Squat'],
                'plates_deadlift': best_lift['Deadlift'],
            })
            for ladder in LADDERS:
                for key, threshold in zip(ladder.keys(), ladder.thresholds[ladder.unit_for(wu, du)]):
                    if self.values[ladder.track] >= threshold:
                        cross(key)

            # ── Feats ──
            bw = bodyweight_at(when) if bodyweights else self.user.bodyweight
            if bw and bw > 0:
                if w_best['Bench Press'] >= bw:
                    cross('feat_bw_bench')
                if w_best['Deadlift'] >= 2 * bw:
                    cross('feat_2xbw_deadlift')
            if sum(best_lift.values()) >= CLUB_TOTAL[wu]:
                cross('feat_1000_club')
            if w_run_km >= 5.0 * _FEAT_DISTANCE_TOLERANCE:
                cross('feat_first_5k')
            if w_run_km >= 42.195 * _FEAT_DISTANCE_TOLERANCE:
                cross('feat_marathon')
            if w_ride_km >= CENTURY_KM[du] * _FEAT_DISTANCE_TOLERANCE:
                cross('feat_century')
            for pr_type, context, value, tmpl_name, _ in prs:
                if (pr_type == 'best_time' and abs(context - 5.0) < 1e-6 and value < 25
                        and not is_cycling(tmpl_name) and _ON_FOOT.search(tmpl_name or '')):
                    cross('feat_sub25_5k')
            if prev_day is not None and (day - prev_day).days >= COMEBACK_GAP_DAYS:
                cross('feat_nostos')

            # ── Hidden ──
            if (day.month, day.day) == (1, 1):
                cross('hidden_neomenia')
            if (day.month, day.day) == (2, 29):
                cross('hidden_embolimos')
            if count == 300:
                cross('hidden_three_hundred')
            if start_hour is not None and start_hour < EOS_BEFORE_HOUR:
                cross('hidden_eos')
            if w_negative_split:
                cross('hidden_kairos')
            if first_day is None:
                first_day = day
            elif (day.month, day.day) == (first_day.month, first_day.day) and day.year > first_day.year:
                cross('hidden_eniautos')
            if (day.month, day.day) == (3, 14) and any(
                round(d, 2) == 3.14 for d in foot_by_exercise.values()
            ):
                cross('hidden_pi')
            for *_, standards_key in prs:
                if standards_key in BIG_THREE:
                    triad_weeks[monday].add(standards_key)
            if len(triad_weeks[monday]) == len(BIG_THREE):
                cross('hidden_triad')

            prev_day = day

        self._streak_run, self._streak_monday = streak_run, streak_monday

    def current_streak(self, today):
        """The run still alive on `today`: it ends in this week or the last one
        (this week's workout may not have happened yet). `values['streak']` is
        the longest ever, which is what awards the badges."""
        if self._streak_monday is None:
            return 0
        this_monday = today - timedelta(days=today.weekday())
        return self._streak_run if self._streak_monday >= this_monday - timedelta(weeks=1) else 0


def evaluate_achievements(user, seen=False):
    """Insert every badge the user's history has crossed but they don't hold
    yet, and return the new ones (oldest first). The caller commits."""
    replay = _Replay(user)
    held = {k for (k,) in db.session.query(UserAchievement.key).filter_by(user_id=user.id)}
    new = sorted(
        ((k, wid, when) for k, (wid, when) in replay.crossed.items() if k not in held),
        key=lambda item: item[2],
    )
    for key, workout_id, when in new:
        db.session.add(UserAchievement(user_id=user.id, key=key, earned_at=when,
                                       workout_id=workout_id, seen=seen))
    wu, du = replay.weight_unit, replay.distance_unit
    return [_describe(key, wu, du, workout_id, when) for key, workout_id, when in new]


def _describe(key, wu, du, workout_id, when):
    """One badge as the unlock sheet needs it: what it is, and what's next."""
    out = {'key': key, 'earned_at': when.isoformat(), 'workout_id': workout_id}
    if key in FEATS:
        out.update(kind='feat', title=_title(FEATS[key][0], du if key == 'feat_century' else wu))
    elif key in HIDDEN:
        out.update(kind='hidden', title=HIDDEN[key])
    else:
        track, rung = key.rsplit('_', 1)
        ladder = LADDER_BY_TRACK[track]
        unit = ladder.unit_for(wu, du)
        thresholds, titles = ladder.thresholds[unit], ladder.titles[unit]
        i = int(rung) - 1
        out.update(kind='ladder', track=track, group=ladder.group, rung=i + 1, of=len(thresholds),
                   title=titles[i], threshold=thresholds[i], unit=unit,
                   next=({'title': titles[i + 1], 'threshold': thresholds[i + 1]}
                         if i + 1 < len(thresholds) else None))
    return out


def _round_value(measure, value):
    if measure in ('hours', 'distance'):
        return round(value, 1)
    return round(value)


def achievements_payload(user, today):
    """GET /api/achievements. Read-only: badges are only awarded on a workout
    save or by the backfill. `today` is the user's date (user_today())."""
    replay = _Replay(user)
    wu, du = replay.weight_unit, replay.distance_unit
    rows = {r.key: r for r in UserAchievement.query.filter_by(user_id=user.id)}

    # The badge back names the workout that earned it, and View Workout opens
    # the cardio screen for an all-cardio one (the workout_type rule)
    workout_ids = {r.workout_id for r in rows.values() if r.workout_id}
    names = dict(
        db.session.query(Workout.id, Workout.name).filter(Workout.id.in_(workout_ids)).all()
    ) if workout_ids else {}
    types = defaultdict(set)
    if workout_ids:
        for wid, ex_type in (db.session.query(Exercise.workout_id, Exercise.exercise_type)
                             .filter(Exercise.workout_id.in_(workout_ids)).all()):
            types[wid].add((ex_type or 'strength').lower())

    def earned(key):
        row = rows.get(key)
        if not row:
            return {'earned': False, 'earned_at': None, 'workout_id': None,
                    'workout_name': None, 'workout_cardio': False, 'seen': True}
        return {'earned': True, 'earned_at': row.earned_at.isoformat(),
                'workout_id': row.workout_id, 'workout_name': names.get(row.workout_id),
                'workout_cardio': types.get(row.workout_id) == {'cardio'}, 'seen': row.seen}

    tracks = []
    for ladder in LADDERS:
        unit = ladder.unit_for(wu, du)
        value = replay.values[ladder.track]
        badges = [
            {'key': key, 'rung': i + 1, 'title': title, 'threshold': threshold, **earned(key)}
            for i, (key, title, threshold) in enumerate(
                zip(ladder.keys(), ladder.titles[unit], ladder.thresholds[unit]))
        ]
        upcoming = next((b for b in badges if not b['earned']), None)
        # A streak's value is the best ever ("Best 7 weeks"), but the next rung
        # is reached from the run going now: a broken streak starts over
        current = replay.current_streak(today) if ladder.track == 'streak' else None
        toward = value if current is None else current
        tracks.append({
            'track': ladder.track,
            'label': ladder.label,
            'group': ladder.group,
            'unit': unit,
            'value': _round_value(ladder.measure, value),
            'visible': ladder.shown_after in replay.kinds or any(b['earned'] for b in badges),
            'earned_count': sum(b['earned'] for b in badges),
            'total': len(badges),
            'badges': badges,
            'next': None if upcoming is None else {
                'key': upcoming['key'], 'title': upcoming['title'], 'threshold': upcoming['threshold'],
                'remaining': _round_value(ladder.measure, max(0.0, upcoming['threshold'] - toward)),
            },
            **({} if current is None else {'current': current}),
        })

    feats = []
    for key, (titles, shown_after) in FEATS.items():
        state = earned(key)
        feats.append({
            'key': key,
            'title': _title(titles, du if key == 'feat_century' else wu),
            'visible': shown_after in replay.kinds or state['earned'],
            **state,
        })

    hidden = [
        {'key': key, 'title': title, **earned(key)}
        for key, title in HIDDEN.items() if key in rows
    ]

    visible_badges = [b for t in tracks if t['visible'] for b in t['badges']] + [f for f in feats if f['visible']]
    return {
        'weight_unit': wu,
        'distance_unit': du,
        'earned_count': sum(b['earned'] for b in visible_badges),
        'total_count': len(visible_badges),
        'tracks': tracks,
        'feats': feats,
        'hidden': hidden,
        'hidden_remaining': len(HIDDEN) - len(hidden),
        'unseen': sorted((k for k, r in rows.items() if not r.seen and _known(k)),
                         key=lambda k: rows[k].earned_at),
        'pinned': _pinned_keys(rows.values()),
        'pins_saved': bool(user.badge_pins_saved),
    }


def _pinned_keys(rows):
    pinned = sorted((r for r in rows if r.pin_position is not None and _known(r.key)),
                    key=lambda r: r.pin_position)
    return [r.key for r in pinned]


def set_pins(user, keys):
    """Pin earned badges in the given order. Returns an error message, or None."""
    if len(set(keys)) != len(keys):
        return 'The same badge is pinned twice'
    rows = {r.key: r for r in UserAchievement.query.filter_by(user_id=user.id)}
    if any(k not in rows or not _known(k) for k in keys):
        return 'Only an earned badge can be pinned'
    for row in rows.values():
        row.pin_position = keys.index(row.key) if row.key in keys else None
    user.badge_pins_saved = True
    return None


def _known(key):
    if key in FEATS or key in HIDDEN:
        return True
    track, _, rung = key.rpartition('_')
    ladder = LADDER_BY_TRACK.get(track)
    return bool(ladder) and rung.isdigit() and 1 <= int(rung) <= len(ladder.keys())


def mark_seen(user_id, keys=None):
    q = UserAchievement.query.filter_by(user_id=user_id, seen=False)
    if keys is not None:
        q = q.filter(UserAchievement.key.in_(keys))
    return q.update({'seen': True}, synchronize_session=False)
