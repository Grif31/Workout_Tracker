import os
import re
import json
from datetime import datetime, timedelta
from flask import Blueprint, request, jsonify, current_app, g
from flask_jwt_extended import jwt_required, get_jwt_identity
from sqlalchemy.orm import aliased
from models import (
    db, WorkoutTemplate, ExerciseTemplate, Routine, RoutineDay,
    User, Exercise, Set, Workout, PersonalRecord, ExerciseMuscleMapping,
    BodyweightLog, StrengthScoreSnapshot,
)
from schemas import AiGenerateSchema, AiInsightsSchema
from utils.validation import validate_body
from utils.lift_progress import compute_most_improved_lift
from utils.cardio_progress import compute_most_improved_cardio, _MILESTONE_LABELS
from limiter import limiter

ai_bp = Blueprint('ai_bp', __name__)

_ai_generate_schema = AiGenerateSchema()
_ai_insights_schema = AiInsightsSchema()

MUSCLE_MRV = {
    'Chest': 20, 'Back': 25, 'Shoulders': 26, 'Biceps': 26, 'Triceps': 20,
    'Forearms': 20, 'Quads': 20, 'Hamstrings': 16, 'Glutes': 16, 'Calves': 30, 'Core': 25,
}
MUSCLE_MEV = {
    'Chest': 8, 'Back': 10, 'Shoulders': 8, 'Biceps': 8, 'Triceps': 6,
    'Forearms': 4, 'Quads': 8, 'Hamstrings': 6, 'Glutes': 4, 'Calves': 8, 'Core': 6,
}
GREEK_THRESHOLDS = [
    (90, 'Aretē'), (75, 'Titan'), (60, 'Olympian'),
    (45, 'Demigod'), (30, 'Hero'), (15, 'Athlete'), (0, 'Neophyte'),
]

# Shared between _build_prompt (generation) and _build_insights_prompt
# (insights) — both need to render a client's goal/experience/injury profile.
GOAL_LABELS = {
    'hypertrophy': 'Muscle Building (Hypertrophy)',
    'strength':    'Strength & Power',
    'endurance':   'Endurance & Conditioning',
    'general':     'General Fitness',
}
EXP_LABELS = {
    'beginner':     'Beginner (< 1 year consistent training)',
    'intermediate': 'Intermediate (1–3 years)',
    'advanced':     'Advanced (3+ years)',
}
AVOID_MAP = {
    'lower_back': (
        'CLIENT HAS LOWER BACK ISSUES — MUST AVOID: Conventional Deadlift, Good Morning, Bent-Over Barbell Row. '
        'Safe alternatives: Romanian Deadlift, Hip Thrust, Trap Bar Deadlift, Seated Cable Row, Leg Curl.'
    ),
    'knees': (
        'CLIENT HAS KNEE ISSUES — MUST AVOID: Barbell Back Squat, Leg Press, any deep knee flexion under load. '
        'Safe alternatives: Hip Thrust, Romanian Deadlift, Leg Curl, Step-Up, Nordic Curl.'
    ),
    'shoulders': (
        'CLIENT HAS SHOULDER ISSUES — MUST AVOID: Overhead Press (all variants), Upright Row, Behind-the-Neck movements. '
        'Safe alternatives: Incline Bench Press, Dip, Cable Crossover, Landmine Press, Neutral-Grip exercises.'
    ),
    'none': 'No injuries — full exercise library available.',
}


def _greek_rank_from_score(score: float) -> str:
    for threshold, name in GREEK_THRESHOLDS:
        if score >= threshold:
            return name
    return 'Neophyte'


def _routine_rotation_context(user_id: int, routine_id: int) -> dict | None:
    """Where the user sits in their active routine's day rotation.

    RoutineDay has no weekday field — day_order is just an ordered rotation
    (e.g. Push/Pull/Legs), not pinned to a calendar day — so "next up" means
    the next day_order after the most recently matched one, not a specific
    weekday. Matched by Workout.name against RoutineDay.label, since starting
    a workout from a routine day sets name = day.label verbatim (CoachScreen,
    DashboardScreen). Returns None with no active routine or no history to
    match against yet (new routine, never logged from it).
    """
    days = (
        RoutineDay.query
        .filter_by(routine_id=routine_id)
        .order_by(RoutineDay.day_order)
        .all()
    )
    label_to_order = {d.label: d.day_order for d in days if d.label}
    if not label_to_order:
        return None

    recent_match = (
        db.session.query(Workout.name, Workout.date)
        .filter(Workout.user_id == user_id, Workout.name.in_(list(label_to_order.keys())))
        .order_by(Workout.date.desc())
        .first()
    )
    if not recent_match:
        return None

    last_label, _last_date = recent_match
    day_count = len(days)
    next_order = (label_to_order[last_label] + 1) % day_count
    next_day = next((d for d in days if d.day_order == next_order), None)

    return {
        'day_labels': [d.label for d in days],
        'day_count':  day_count,
        'last_day':   last_label,
        'next_day':   next_day.label if next_day else None,
        'next_order': next_order + 1,  # 1-indexed for prompt copy
    }


def _match_exercises(exercise_items: list) -> list[dict]:
    """Match AI exercise names to DB records.
    Accepts strings or {"exercise": str, "sets": int, "reps": str, "rpe": int|None}.
    Returns [{id, name, muscle_group, prescribed_sets, prescribed_reps, prescribed_rpe}].
    """
    all_templates = ExerciseTemplate.query.all()
    name_map = {t.name.lower(): t for t in all_templates}
    result = []
    seen_ids: set[int] = set()
    for item in exercise_items:
        if isinstance(item, str):
            ex_name, p_sets, p_reps, p_rpe = item, None, None, None
        else:
            ex_name  = item.get('exercise', '')
            p_sets   = item.get('sets')
            p_reps   = item.get('reps')
            p_rpe    = item.get('rpe')
        low = ex_name.lower()
        tmpl = name_map.get(low)
        if not tmpl:
            for key, t in name_map.items():
                if low in key or key in low:
                    tmpl = t
                    break
        if tmpl and tmpl.id not in seen_ids:
            seen_ids.add(tmpl.id)
            result.append({
                'id': tmpl.id,
                'name': tmpl.name,
                'muscle_group': tmpl.muscle_group or '',
                'exercise_type': (tmpl.exercise_type or 'strength').lower(),
                'prescribed_sets': p_sets,
                'prescribed_reps': p_reps,
                'prescribed_rpe':  p_rpe,
            })
    return result


def _parse_ai_json(raw: str) -> dict:
    text = raw.strip()
    # Strip markdown code fences
    if '```' in text:
        parts = text.split('```')
        for part in parts:
            stripped = part.strip().lstrip('json').strip()
            if stripped.startswith('{') or stripped.startswith('['):
                text = stripped
                break
    # Extract outermost JSON object if prose precedes it
    if not text.startswith('{') and not text.startswith('['):
        m = re.search(r'[{\[]', text)
        if m:
            text = text[m.start():]
    # Remove trailing commas before } or ] — common LLM output mistake
    text = re.sub(r',\s*([}\]])', r'\1', text)
    return json.loads(text)


def _build_user_context(user_id: int) -> dict:
    user = db.session.get(User, int(user_id))
    now = datetime.now()

    # Top strength PRs — max_weight
    emm_alias = aliased(ExerciseMuscleMapping)
    pr_rows = (
        db.session.query(
            ExerciseTemplate.name,
            db.func.max(PersonalRecord.value).label('pr_value'),
            emm_alias.muscle_group,
        )
        .join(ExerciseTemplate, PersonalRecord.exercise_template_id == ExerciseTemplate.id)
        .outerjoin(emm_alias, db.and_(
            emm_alias.exercise_template_id == ExerciseTemplate.id,
            emm_alias.is_primary == True,
        ))
        .filter(
            PersonalRecord.user_id == user_id,
            PersonalRecord.pr_type == 'max_weight',
        )
        .group_by(ExerciseTemplate.name, emm_alias.muscle_group)
        .order_by(db.text('pr_value DESC'))
        .limit(10)
        .all()
    )

    # Working sets per muscle group over last 14 days
    cutoff = now - timedelta(days=14)
    not_warmup = db.or_(Set.set_type.is_(None), Set.set_type != 'W')
    not_cardio  = db.func.lower(Exercise.exercise_type) != 'cardio'

    template_set_rows = (
        db.session.query(
            Exercise.exercise_template_id,
            db.func.count(Set.id).label('set_count'),
        )
        .join(Set, Set.exercise_id == Exercise.id)
        .join(Workout, Exercise.workout_id == Workout.id)
        .filter(
            Workout.user_id == user_id,
            Exercise.exercise_template_id.isnot(None),
            not_cardio,
            not_warmup,
            Set.reps.isnot(None),
            Workout.date >= cutoff,
        )
        .group_by(Exercise.exercise_template_id)
        .all()
    )

    template_set_map = {r.exercise_template_id: r.set_count for r in template_set_rows}
    muscle_sets: dict[str, int] = {}
    if template_set_map:
        mappings = (
            db.session.query(
                ExerciseMuscleMapping.exercise_template_id,
                ExerciseMuscleMapping.muscle_group,
            )
            .filter(ExerciseMuscleMapping.exercise_template_id.in_(list(template_set_map.keys())))
            .all()
        )
        for tmpl_id, muscle in mappings:
            muscle_sets[muscle] = muscle_sets.get(muscle, 0) + template_set_map[tmpl_id]

    last_workout_date = (
        db.session.query(db.func.max(Workout.date))
        .filter(Workout.user_id == user_id)
        .scalar()
    )

    # Greek rank
    snapshot = (
        StrengthScoreSnapshot.query
        .filter_by(user_id=user_id)
        .order_by(StrengthScoreSnapshot.created_at.desc())
        .first()
    )
    greek_score = snapshot.score if snapshot else None
    greek_rank = _greek_rank_from_score(greek_score) if greek_score is not None else None

    # Active routine name + where the user sits in its day rotation
    active_routine_name = None
    routine_rotation = None
    if user and user.active_routine_id:
        r = Routine.query.filter_by(id=user.active_routine_id).first()
        if r:
            active_routine_name = r.name
            routine_rotation = _routine_rotation_context(user_id, user.active_routine_id)

    # Most-improved lift/cardio over the last 14 days vs. the 14 before that
    # — same helpers Weekly Summary uses, so a lift that just hit a genuine
    # new PR isn't a deload candidate just because it's also logging high volume.
    most_improved_lift = compute_most_improved_lift(user_id, cutoff, now, cutoff - timedelta(days=14))
    most_improved_cardio = compute_most_improved_cardio(user_id, cutoff, now, cutoff - timedelta(days=14))

    return {
        'weight_unit':        (user.weight_unit or 'lbs') if user else 'lbs',
        'bodyweight':         user.bodyweight if user else None,
        'gender':             user.gender if user else None,
        'top_prs':            pr_rows,
        'muscle_sets_14d':    muscle_sets,
        'last_workout_date':  last_workout_date,
        'greek_rank':         greek_rank,
        'active_routine_name': active_routine_name,
        'routine_rotation':   routine_rotation,
        'today_weekday':      now.strftime('%A'),
        'most_improved_lift': most_improved_lift,
        'most_improved_cardio': most_improved_cardio,
    }


def _build_prompt(data: dict, generate_type: str, user_context: dict | None = None) -> str:
    goal               = data['goal']
    experience         = data['experience']
    days_per_week      = data['days_per_week']
    equipment          = data.get('equipment', 'full_gym')
    session_length_min = data.get('session_length_min', 60)
    avoid              = data.get('avoid', 'none')
    muscles            = data.get('muscles', [])
    notes              = (data.get('notes') or '').strip()

    EQUIP_LABELS = {
        'full_gym':    'Full commercial gym — barbells, cables, machines, dumbbells all available',
        'home_barbell':'Home gym — barbell, bench, power rack, dumbbells. NO cables, NO machines',
        'dumbbells':   'Dumbbells + bodyweight only. NO barbells, NO cables, NO machines',
        'bodyweight':  'Bodyweight only. NO equipment whatsoever',
    }
    EQUIP_EXAMPLES = {
        'full_gym':    'Bench Press, Squat, Deadlift, Lat Pulldown, Cable Row, Leg Press, Dumbbell Curl, Tricep Pushdown',
        'home_barbell':'Bench Press, Barbell Squat, Deadlift, Barbell Row, Pull-Up, Overhead Press, Dip, Romanian Deadlift',
        'dumbbells':   'Dumbbell Press, Dumbbell Row, Goblet Squat, Romanian Deadlift, Push-Up, Pull-Up, Dumbbell Curl, Tricep Kickback',
        'bodyweight':  'Push-Up, Pull-Up, Dip, Bodyweight Squat, Lunge, Pike Push-Up, Inverted Row, Plank, Hip Thrust (bodyweight)',
    }
    SET_REP = {
        'hypertrophy': '3–4 sets × 8–12 reps for compounds; 3 sets × 12–15 for isolation',
        'strength':    '4–5 sets × 3–6 reps for main lifts; 3 sets × 6–8 for accessories',
        'endurance':   '2–3 sets × 15–20 reps; short 45–60 s rest',
        'general':     '3–4 sets × 10–14 reps; balanced compound + isolation',
    }

    if session_length_min <= 30:
        ex_count = '3–4 exercises'
    elif session_length_min <= 45:
        ex_count = '4–5 exercises'
    elif session_length_min <= 60:
        ex_count = '5–6 exercises'
    else:
        ex_count = '6–8 exercises'

    if experience == 'beginner' or days_per_week <= 2:
        split = 'Full Body (train all major muscle groups each session)'
    elif days_per_week == 3:
        split = 'Full Body A/B/C' if experience == 'beginner' else 'Push / Pull / Legs'
    elif days_per_week == 4:
        split = 'Upper/Lower (Upper A, Lower A, Upper B, Lower B)'
    elif days_per_week == 5:
        split = 'Push / Pull / Legs / Upper / Lower'
    else:
        split = 'Push / Pull / Legs × 2 (PPL repeated each half-week)'

    avoid_directive = AVOID_MAP.get(avoid, AVOID_MAP['none'])
    notes_line = f"• Client notes: {notes}\n" if notes else ''

    # Muscle targeting directive (when muscles are specified)
    muscle_directive = ''
    if muscles:
        muscle_list = ', '.join(muscles)
        muscle_directive = (
            f"MUSCLE FOCUS: This session must primarily target: {muscle_list}. "
            f"Select exercises that directly work these specific muscle groups. "
            f"Avoid adding exercises for unrelated muscles.\n\n"
        )

    # Real user data section
    training_status_section = ''
    if user_context:
        unit = user_context.get('weight_unit', 'lbs')
        lines = ['CURRENT TRAINING STATUS (use this to personalise the program):']

        bw = user_context.get('bodyweight')
        gender = user_context.get('gender')
        if bw:
            bw_line = f'• Bodyweight: {bw:.1f} {unit}'
            if gender:
                bw_line += f', Gender: {gender}'
            lines.append(bw_line)
        elif gender:
            lines.append(f'• Gender: {gender}')

        if user_context.get('greek_rank'):
            lines.append(f'• Current Greek rank: {user_context["greek_rank"]}')

        lines.append(f'• Today: {user_context["today_weekday"]}')

        if user_context.get('active_routine_name'):
            lines.append(f'• Active routine: {user_context["active_routine_name"]}')
            rotation = user_context.get('routine_rotation')
            if rotation:
                lines.append(
                    f'  Split: {", ".join(rotation["day_labels"])}. Last trained: {rotation["last_day"]}. '
                    f'Next up in rotation: {rotation["next_day"]} (day {rotation["next_order"]} of {rotation["day_count"]}).'
                )

        most_improved = user_context.get('most_improved_lift')
        if most_improved:
            lines.append(
                f'• Recently improved: {most_improved["exercise_name"]} '
                f'{most_improved["prev_best"]} → {most_improved["this_best"]} {unit} '
                f'(+{most_improved["gain"]}) — do not deload this lift.'
            )
        most_improved_cardio = user_context.get('most_improved_cardio')
        if most_improved_cardio:
            cardio_unit = 'min' if most_improved_cardio['pr_type'] == 'best_time' else 'km'
            lines.append(
                f'• Recently improved cardio: {most_improved_cardio["exercise_name"]} '
                f'{most_improved_cardio["milestone_label"]} '
                f'{most_improved_cardio["prev_best"]} → {most_improved_cardio["this_best"]} {cardio_unit} '
                f'(gain {most_improved_cardio["gain"]} {cardio_unit}) — do not deload this exercise.'
            )

        top_prs = user_context.get('top_prs', [])
        if top_prs:
            lines.append(f'• Top strength PRs (in {unit}):')
            for row in top_prs:
                muscle_label = f' [{row.muscle_group}]' if row.muscle_group else ''
                lines.append(f'  – {row.name}{muscle_label}: {row.pr_value:.1f} {unit}')
        else:
            lines.append('• No PRs on record yet — treat as early-stage trainee regardless of stated experience.')

        muscle_sets = user_context.get('muscle_sets_14d', {})
        if muscle_sets:
            lines.append('• Working sets per muscle group (last 14 days):')
            for muscle, count in sorted(muscle_sets.items(), key=lambda x: -x[1]):
                lines.append(f'  – {muscle}: {count} sets')
            lines.append('  → Prioritise undertrained muscles. Reduce volume for any muscle already at 15+ sets.')
        else:
            lines.append('• No training data for the last 14 days — returning or new trainee, start conservatively.')

        last_date = user_context.get('last_workout_date')
        if last_date:
            days_ago = (datetime.now() - last_date).days
            if days_ago == 0:
                lines.append('• Last workout: today.')
            elif days_ago == 1:
                lines.append('• Last workout: yesterday.')
            else:
                lines.append(f'• Last workout: {days_ago} days ago.')
            if days_ago >= 14:
                lines.append('  → Use reduced volume and moderate intensity for the first week back.')
        else:
            lines.append('• No workout history — complete beginner or brand new account.')

        training_status_section = '\n'.join(lines) + '\n\n'

    ex_obj = '{"exercise":"<name>","sets":<N>,"reps":"<range e.g. 6-8 or 12>","rpe":<6-9 or null>}'
    if generate_type == 'routine':
        json_format = (
            '{"name":"<routine name>","description":"<2 sentences: split structure and primary goal>",'
            f'"days":[{{"label":"<Day name e.g. Push Day / Upper A>","exercises":[{ex_obj},{ex_obj}]}}]}}'
        )
        structure_rule = (
            f'Create EXACTLY {days_per_week} day objects. '
            f'Use the {split} split. '
            f'Each day: {ex_count}. '
            'Each exercise must be an object with "exercise", "sets", "reps", "rpe" keys.'
        )
    else:
        json_format = f'{{"name":"<workout name>","exercises":[{ex_obj},{ex_obj},{ex_obj}]}}'
        structure_rule = (
            f'Single session with {ex_count}. '
            'Each exercise must be an object with "exercise", "sets", "reps", "rpe" keys.'
        )

    rules = [
        f"Structure: {structure_rule}",
        f"Sets × Reps: {SET_REP.get(goal, SET_REP['general'])}",
        f"Equipment constraint: ONLY use exercises achievable with the client's equipment.\n"
        f"   Valid exercise examples: {EQUIP_EXAMPLES.get(equipment, '')}",
        f"Injuries: {avoid_directive}",
    ]
    if notes:
        rules.append(f"Client notes: honor these preferences/requests: {notes}")
    rules.append(
        "Use standard exercise names (e.g. 'Bench Press', 'Pull-Up', 'Hip Thrust', 'Dumbbell Row')."
    )
    rules.append(
        'Timed holds (Plank, Side Plank, Wall Sit, Hollow Hold, L-Sit, Dead Hang): write "reps" as a'
        ' hold duration in seconds with an \'s\' suffix, e.g. "40s" or "30-60s".'
    )
    rules_block = '\n'.join(f'{i}. {rule}' for i, rule in enumerate(rules, start=1))

    return (
        f"You are an elite personal trainer. Build a precise, client-appropriate program.\n\n"
        f"{muscle_directive}"
        f"CLIENT PROFILE:\n"
        f"• Goal: {GOAL_LABELS.get(goal, goal)}\n"
        f"• Experience: {EXP_LABELS.get(experience, experience)}\n"
        f"• Days per week: {days_per_week}\n"
        f"• Equipment: {EQUIP_LABELS.get(equipment, equipment)}\n"
        f"• Session length: {session_length_min} minutes ({ex_count} per session)\n"
        f"• Limitations: {avoid_directive}\n"
        f"{notes_line}\n"
        f"{training_status_section}"
        f"PROGRAMMING RULES — follow exactly:\n"
        f"{rules_block}\n\n"
        f"Respond with ONLY valid JSON — no markdown, no explanation:\n"
        f"{json_format}"
    )


def _build_insights_context(user_id: int, experience: str | None = None, goal: str | None = None, avoid: str | None = None) -> dict:
    user = db.session.get(User, user_id)
    now = datetime.now()
    week_start = now - timedelta(days=7)
    last_week_start = now - timedelta(days=14)
    not_warmup = db.or_(Set.set_type.is_(None), Set.set_type != 'W')
    not_cardio = db.func.lower(Exercise.exercise_type) != 'cardio'

    # Secondary movers get half credit — a set still stimulates them, just
    # less directly than the primary target, so it shouldn't count as a full
    # set toward that muscle's weekly volume.
    set_credit = db.case((ExerciseMuscleMapping.is_primary == True, 1.0), else_=0.5)

    def _muscle_sets_range(start, end):
        rows = (
            db.session.query(ExerciseMuscleMapping.muscle_group, db.func.sum(set_credit).label('cnt'))
            .join(Exercise, ExerciseMuscleMapping.exercise_template_id == Exercise.exercise_template_id)
            .join(Set, Set.exercise_id == Exercise.id)
            .join(Workout, Exercise.workout_id == Workout.id)
            .filter(
                Workout.user_id == user_id,
                Workout.date >= start,
                Workout.date < end,
                not_warmup, not_cardio,
                Set.reps.isnot(None),
            )
            .group_by(ExerciseMuscleMapping.muscle_group)
            .all()
        )
        return {r.muscle_group: r.cnt for r in rows}

    muscle_sets_week = _muscle_sets_range(week_start, now + timedelta(days=1))
    muscle_sets_last = _muscle_sets_range(last_week_start, week_start)

    # Avg RPE per muscle group this week — distinct signal from the volume-based
    # MRV/MEV flags below: a muscle can look fine on set count alone while still
    # running consistently near-max effort. Only muscles with enough recent
    # RPE-logged sets (implies the user has RPE logging on) get a reading; the
    # backend has no visibility into the on-device workout_show_rpe_${uid} toggle.
    rpe_rows = (
        db.session.query(
            ExerciseMuscleMapping.muscle_group,
            db.func.avg(Set.rpe).label('avg_rpe'),
            db.func.count(Set.id).label('rpe_count'),
        )
        .join(Exercise, ExerciseMuscleMapping.exercise_template_id == Exercise.exercise_template_id)
        .join(Set, Set.exercise_id == Exercise.id)
        .join(Workout, Exercise.workout_id == Workout.id)
        .filter(
            Workout.user_id == user_id,
            Workout.date >= week_start,
            Workout.date < now + timedelta(days=1),
            ExerciseMuscleMapping.is_primary == True,
            not_warmup, not_cardio,
            Set.reps.isnot(None),
            Set.rpe.isnot(None),
        )
        .group_by(ExerciseMuscleMapping.muscle_group)
        .having(db.func.count(Set.id) >= 3)
        .all()
    )
    muscle_rpe_week = {r.muscle_group: round(r.avg_rpe, 1) for r in rpe_rows}

    # Cardio sessions this week — the muscle-set table above only counts
    # strength sets (not_cardio filter), so a cardio-heavy week would
    # otherwise show every muscle as "not trained recently" with nothing
    # indicating training actually happened.
    cardio_workouts_week = (
        db.session.query(db.func.count(Workout.id.distinct()))
        .join(Exercise, Exercise.workout_id == Workout.id)
        .filter(
            Workout.user_id == user_id,
            Workout.date >= week_start,
            Workout.date < now + timedelta(days=1),
            db.func.lower(Exercise.exercise_type) == 'cardio',
        )
        .scalar() or 0
    )

    # Workouts per week — last 4 weeks
    four_weeks_ago = now - timedelta(days=28)
    workout_count = (
        db.session.query(db.func.count(Workout.id))
        .filter(Workout.user_id == user_id, Workout.date >= four_weeks_ago)
        .scalar() or 0
    )
    avg_workouts_per_week = workout_count / 4.0

    # Top 5 estimated_1rm PRs
    top_prs = (
        db.session.query(ExerciseTemplate.name, PersonalRecord.value, PersonalRecord.achieved_at)
        .join(ExerciseTemplate, PersonalRecord.exercise_template_id == ExerciseTemplate.id)
        .filter(PersonalRecord.user_id == user_id, PersonalRecord.pr_type == 'estimated_1rm')
        .order_by(PersonalRecord.value.desc())
        .limit(5)
        .all()
    )

    # Recent cardio bests — top_prs above (estimated_1rm only) never surfaces
    # cardio at all, so cardio-focused users otherwise get no PR material
    # besides a single most-improved-this-week line.
    cardio_prs = (
        db.session.query(
            ExerciseTemplate.name, PersonalRecord.pr_type,
            PersonalRecord.weight_context, PersonalRecord.value, PersonalRecord.achieved_at,
        )
        .join(ExerciseTemplate, PersonalRecord.exercise_template_id == ExerciseTemplate.id)
        .filter(
            PersonalRecord.user_id == user_id,
            PersonalRecord.pr_type.in_(('best_time', 'best_distance')),
        )
        .order_by(PersonalRecord.achieved_at.desc())
        .limit(5)
        .all()
    )

    # Active routine name + where the user sits in its day rotation
    active_routine = None
    routine_rotation = None
    if user and user.active_routine_id:
        r = Routine.query.filter_by(id=user.active_routine_id).first()
        if r:
            active_routine = r.name
            routine_rotation = _routine_rotation_context(user_id, user.active_routine_id)

    # Most-improved lift/cardio — reuses the same helpers Weekly Summary uses
    # (not just its own PR-noticing pass over top_prs, which only carries
    # estimated_1rm PRs and no cardio PR types at all).
    most_improved_lift = compute_most_improved_lift(user_id, week_start, now + timedelta(days=1), last_week_start)
    most_improved_cardio = compute_most_improved_cardio(user_id, week_start, now + timedelta(days=1), last_week_start)

    # Bodyweight trend
    bw_logs = (
        BodyweightLog.query
        .filter_by(user_id=user_id)
        .order_by(BodyweightLog.date.desc())
        .limit(3)
        .all()
    )

    # Greek rank from latest snapshot
    snapshot = (
        StrengthScoreSnapshot.query
        .filter_by(user_id=user_id)
        .order_by(StrengthScoreSnapshot.created_at.desc())
        .first()
    )
    greek_score = snapshot.score if snapshot else None
    greek_rank = _greek_rank_from_score(greek_score) if greek_score is not None else 'Neophyte'

    last_workout = (
        db.session.query(db.func.max(Workout.date))
        .filter(Workout.user_id == user_id)
        .scalar()
    )

    return {
        'now': now,
        'name': (user.name or user.username) if user else 'Athlete',
        'weight_unit': (user.weight_unit or 'lbs') if user else 'lbs',
        'greek_rank': greek_rank,
        'greek_score': greek_score,
        'experience': experience,
        'goal': goal,
        'avoid': avoid,
        'muscle_sets_week': muscle_sets_week,
        'muscle_sets_last_week': muscle_sets_last,
        'muscle_rpe_week': muscle_rpe_week,
        'cardio_workouts_week': cardio_workouts_week,
        'avg_workouts_per_week': round(avg_workouts_per_week, 1),
        'top_prs': top_prs,
        'cardio_prs': cardio_prs,
        'active_routine': active_routine,
        'routine_rotation': routine_rotation,
        'today_weekday': now.strftime('%A'),
        'most_improved_lift': most_improved_lift,
        'most_improved_cardio': most_improved_cardio,
        'bw_logs': bw_logs,
        'last_workout': last_workout,
    }


def _build_insights_prompt(ctx: dict) -> str:
    unit = ctx.get('weight_unit', 'lbs')
    name = ctx.get('name', 'Athlete')
    now = ctx.get('now') or datetime.now()
    lines = [
        f"You are an elite personal exercise scientist coaching {name}.",
        "Analyze the training data below and return 3–5 specific, actionable insights.",
        "",
    ]

    if ctx.get('greek_rank'):
        score_str = f" (score {ctx['greek_score']:.0f}/100)" if ctx.get('greek_score') is not None else ""
        lines.append(f"Greek rank: {ctx['greek_rank']}{score_str}")

    if ctx.get('experience'):
        lines.append(f"Client experience: {EXP_LABELS.get(ctx['experience'], ctx['experience'])}")
    if ctx.get('goal'):
        lines.append(f"Client goal: {GOAL_LABELS.get(ctx['goal'], ctx['goal'])}")
    avoid = ctx.get('avoid')
    if avoid and avoid != 'none':
        lines.append(f"Injury constraint: {AVOID_MAP.get(avoid, AVOID_MAP['none'])}")

    avg = ctx.get('avg_workouts_per_week', 0)
    lines.append(f"Average workouts/week (last 4 weeks): {avg}")

    last_w = ctx.get('last_workout')
    if last_w:
        days_ago = (now - last_w).days
        lines.append(f"Days since last workout: {days_ago}")

    lines.append(f"Today: {ctx.get('today_weekday', '')}")

    if ctx.get('cardio_workouts_week'):
        lines.append(
            f"Cardio sessions this week: {ctx['cardio_workouts_week']} "
            "(cardio doesn't count toward the muscle set totals below — a cardio-heavy week can still show "
            "0 sets for every strength muscle without being a genuinely inactive week)"
        )

    if ctx.get('active_routine'):
        lines.append(f"Active routine: {ctx['active_routine']}")
        rotation = ctx.get('routine_rotation')
        if rotation:
            lines.append(
                f"  Split: {', '.join(rotation['day_labels'])}. Last trained: {rotation['last_day']}. "
                f"Next up in rotation: {rotation['next_day']} (day {rotation['next_order']} of {rotation['day_count']})."
            )
            lines.append(
                "  → Don't flag a muscle as under-trained or 'not trained recently' just because its "
                "day hasn't come up yet in this rotation — only flag it if its day has already passed."
            )

    muscle_week = ctx.get('muscle_sets_week', {})
    muscle_last = ctx.get('muscle_sets_last_week', {})
    muscle_rpe = ctx.get('muscle_rpe_week', {})
    all_muscles = sorted(set(list(muscle_week.keys()) + list(muscle_last.keys())))
    if all_muscles:
        lines.append("\nWorking sets per muscle (this week vs last week):")
        for m in all_muscles:
            this_w = muscle_week.get(m, 0)
            last_w_sets = muscle_last.get(m, 0)
            mrv = MUSCLE_MRV.get(m, 20)
            mev = MUSCLE_MEV.get(m, 8)
            flags = []
            if this_w >= mrv:
                flags.append('OVER MRV — deload candidate')
            elif this_w < mev and (this_w > 0 or last_w_sets > 0):
                flags.append('below MEV')
            elif this_w == 0 and last_w_sets == 0:
                flags.append('not trained recently')
            avg_rpe = muscle_rpe.get(m)
            if avg_rpe is not None and avg_rpe >= 9:
                flags.append(f'HIGH FATIGUE — avg RPE {avg_rpe}')
            flag_str = f" [{', '.join(flags)}]" if flags else ''
            lines.append(f"  {m}: {this_w} sets this week, {last_w_sets} last week{flag_str}")

    most_improved = ctx.get('most_improved_lift')
    if most_improved:
        lines.append(
            f"\nMost improved lift this week: {most_improved['exercise_name']} "
            f"{most_improved['prev_best']} → {most_improved['this_best']} {unit} (+{most_improved['gain']})"
        )
    most_improved_cardio = ctx.get('most_improved_cardio')
    if most_improved_cardio:
        cardio_unit = 'min' if most_improved_cardio['pr_type'] == 'best_time' else 'km'
        lines.append(
            f"Most improved cardio this week: {most_improved_cardio['exercise_name']} "
            f"{most_improved_cardio['milestone_label']} "
            f"{most_improved_cardio['prev_best']} → {most_improved_cardio['this_best']} {cardio_unit} "
            f"(gain {most_improved_cardio['gain']} {cardio_unit})"
        )

    top_prs = ctx.get('top_prs', [])
    if top_prs:
        lines.append(f"\nTop estimated 1-rep maxes ({unit}):")
        for row in top_prs:
            age = f" ({(now - row.achieved_at).days}d ago)" if row.achieved_at else ""
            lines.append(f"  {row.name}: {row.value:.0f}{age}")

    cardio_prs = ctx.get('cardio_prs', [])
    if cardio_prs:
        lines.append("\nCardio bests:")
        for row in cardio_prs:
            label = _MILESTONE_LABELS.get((row.pr_type, row.weight_context), '')
            age = f" ({(now - row.achieved_at).days}d ago)" if row.achieved_at else ""
            if row.pr_type == 'best_time':
                lines.append(f"  {row.name} {label}: {row.value:.1f} min{age}")
            else:
                lines.append(f"  {row.name} {label}: {row.value:.2f} km{age}")

    bw_logs = ctx.get('bw_logs', [])
    if len(bw_logs) >= 2:
        oldest = bw_logs[-1].weight
        newest = bw_logs[0].weight
        delta = newest - oldest
        sign = '+' if delta >= 0 else ''
        lines.append(f"\nBodyweight trend (last {len(bw_logs)} logs): {oldest:.1f} → {newest:.1f} {unit} ({sign}{delta:.1f})")

    lines += [
        "",
        "Insight types: deload, rest, frequency, routine, achievement, suggestion",
        "Be specific — cite actual numbers from the data above. Each insight must be actionable.",
        "",
        'Respond ONLY with valid JSON (no markdown):\n{"insights":[{"type":"<type>","title":"<6 words max>","body":"<1-2 sentences with specific data>","priority":"high|medium|low"}]}',
    ]
    return '\n'.join(lines)


@ai_bp.post('/api/ai/generate')
@jwt_required()
@limiter.limit('10 per day', key_func=lambda: f"ai_gen:{get_jwt_identity()}")
@validate_body(_ai_generate_schema)
def generate_workout():
    """Generate a workout plan and return a preview — does NOT save to DB."""
    data = g.validated
    generate_type = data['generate_type']
    user_id = int(get_jwt_identity())

    api_key = os.environ.get('ANTHROPIC_API_KEY')
    if not api_key:
        return jsonify({'message': 'AI service not configured. Add ANTHROPIC_API_KEY to .env'}), 503

    try:
        import anthropic
        client = anthropic.Anthropic(api_key=api_key)

        user_context = _build_user_context(user_id)
        prompt = _build_prompt(data, generate_type, user_context)

        msg = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=4096,
            messages=[{"role": "user", "content": prompt}],
        )

        result = _parse_ai_json(msg.content[0].text)

        if generate_type == 'routine':
            days_preview = []
            for day in result.get('days', []):
                exercises = _match_exercises(day.get('exercises', []))
                days_preview.append({'label': day['label'], 'exercises': exercises})
            return jsonify({
                'type': 'routine',
                'name': result['name'],
                'description': result.get('description', ''),
                'days': days_preview,
            }), 200
        else:
            exercises = _match_exercises(result.get('exercises', []))
            return jsonify({
                'type': 'template',
                'name': result['name'],
                'exercises': exercises,
            }), 200

    except ImportError:
        return jsonify({'message': 'anthropic package not installed. Run pip install anthropic'}), 503
    except json.JSONDecodeError as e:
        return jsonify({'message': f'AI returned malformed JSON: {e}'}), 500
    except Exception:
        current_app.logger.exception('AI generation failed')
        return jsonify({'message': 'Generation failed'}), 500


@ai_bp.post('/api/ai/insights')
@jwt_required()
@limiter.limit('5 per day', key_func=lambda: f"ai_insights:{get_jwt_identity()}")
@validate_body(_ai_insights_schema)
def get_ai_insights():
    """Generate AI coaching insights from the user's full training history.
    experience/goal/avoid are optional — CoachProfile lives client-side only
    (AsyncStorage), so the frontend passes them through on each request
    rather than the backend having a synced copy to read.
    """
    user_id = int(get_jwt_identity())
    data = g.validated
    api_key = os.environ.get('ANTHROPIC_API_KEY')
    if not api_key:
        return jsonify({'message': 'AI service not configured'}), 503

    try:
        import anthropic
        client = anthropic.Anthropic(api_key=api_key)
        ctx = _build_insights_context(user_id, experience=data.get('experience'), goal=data.get('goal'), avoid=data.get('avoid'))
        prompt = _build_insights_prompt(ctx)
        msg = client.messages.create(
            model='claude-haiku-4-5-20251001',
            max_tokens=2048,
            messages=[{'role': 'user', 'content': prompt}],
        )
        result = _parse_ai_json(msg.content[0].text)
        insights = result.get('insights', [])
        return jsonify({'insights': insights, 'generated_at': datetime.now().isoformat()}), 200

    except ImportError:
        return jsonify({'message': 'anthropic package not installed'}), 503
    except json.JSONDecodeError as e:
        return jsonify({'message': f'AI returned malformed JSON: {e}'}), 500
    except Exception:
        current_app.logger.exception('AI insights generation failed')
        return jsonify({'message': 'Failed to generate insights'}), 500


@ai_bp.post('/api/ai/save')
@jwt_required()
def save_generated_workout():
    """Persist a previewed (and potentially edited) AI workout to the database."""
    user_id = get_jwt_identity()
    data = request.get_json(silent=True) or {}
    gen_type = data.get('type')

    if gen_type == 'routine':
        routine = Routine(
            user_id=user_id,
            name=data.get('name', 'My Routine'),
            description=data.get('description') or None,
        )
        db.session.add(routine)
        db.session.flush()

        for order, day in enumerate(data.get('days', [])):
            ex_ids = day.get('exercise_ids', [])
            exercises = (
                ExerciseTemplate.query.filter(ExerciseTemplate.id.in_(ex_ids)).all()
                if ex_ids else []
            )
            day_prog = day.get('programming')
            template = WorkoutTemplate(
                user_id=user_id,
                name=day['label'],
                exercises=exercises,
                programming_json=json.dumps(day_prog) if day_prog else None,
            )
            db.session.add(template)
            db.session.flush()
            db.session.add(RoutineDay(
                routine_id=routine.id,
                workout_template_id=template.id,
                day_order=order,
                label=day['label'],
            ))

        db.session.commit()
        return jsonify({'type': 'routine', 'id': routine.id, 'name': routine.name}), 201

    elif gen_type == 'template':
        ex_ids = data.get('exercise_ids', [])
        exercises = (
            ExerciseTemplate.query.filter(ExerciseTemplate.id.in_(ex_ids)).all()
            if ex_ids else []
        )
        tmpl_prog = data.get('programming')
        template = WorkoutTemplate(
            user_id=user_id,
            name=data.get('name', 'My Workout'),
            exercises=exercises,
            programming_json=json.dumps(tmpl_prog) if tmpl_prog else None,
        )
        db.session.add(template)
        db.session.commit()
        return jsonify({'type': 'template', 'id': template.id, 'name': template.name}), 201

    return jsonify({'message': "type must be 'routine' or 'template'"}), 400
