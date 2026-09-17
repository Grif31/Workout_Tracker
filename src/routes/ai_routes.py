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
    BodyweightLog, PREvent,
)
from schemas import AiGenerateSchema, AiInsightsSchema
from utils.validation import validate_body
from utils.lift_progress import compute_most_improved_lift
from utils.cardio_progress import compute_most_improved_cardio, _MILESTONE_LABELS
from routes.personal_record_routes import compute_days_since_last_pr, _pr_label
from limiter import limiter

# System prompt for every Coach request, so AI-written text follows the brand
# voice (BRAND.md, "Coach voice"). Users read the names, descriptions, day
# labels, and insight text verbatim.
COACH_VOICE = (
    "You are the Coach in Aretē, a strength and cardio training app. Aretē is the Greek "
    "word for excellence, and the app's slogan is \"Pursue Excellence\".\n\n"
    "Everything a user will read (workout and routine names, descriptions, day labels, "
    "insight titles and bodies) follows the Aretē voice:\n"
    "- Sound like a knowledgeable coach, not a hype account. Lead with what the data "
    "shows or what to do next.\n"
    "- Be specific instead of enthusiastic. \"Your bench press is up 10 lbs in 4 weeks.\" "
    "is better than \"Amazing progress!\"\n"
    "- Speak to the user as \"you\" and cite their own numbers: weights, reps, set counts, days.\n"
    "- When something improved, name the exact metric (estimated 1RM, max weight, reps at a weight, "
    "distance, or time) and give the before and after values. Never just say a lift got \"stronger\".\n"
    "- Never shame a missed week or a bodyweight change. State the fact and the next step.\n"
    "- No slang (\"crush it\", \"gains\", \"beast mode\"), no emoji, no exclamation marks, "
    "and no em dashes. Use periods, commas, or colons.\n"
    "- Use these terms: workout (not session), PR, Greek Rank, Strength Score, routine, "
    "bodyweight, warm-up. Write weights with a space before the unit, like 225 lbs.\n"
    "- Names and labels are short, descriptive, and Title Case, like \"Upper Body Strength\" "
    "or \"Push Day\". No puns.\n"
    "- Use US spelling.\n"
    "- Don't diagnose pain or injuries. Suggest rest and seeing a professional instead."
)


def _brand_copy(text, heading=False):
    """Replaces em dashes and exclamation marks in Coach text shown to users.
    The system prompt asks for this too; this guarantees it."""
    if not isinstance(text, str):
        return text
    text = re.sub(r'\s*—\s*', ', ', text)
    text = re.sub(r'!+', '.', text)
    return text.rstrip('.') if heading else text


COACH_PR_WINDOW_DAYS = 28
STALL_DAYS = 21
STALLED_CATEGORY_LABELS = {'weight': 'max weight', 'reps': 'rep', 'time': 'time', 'distance': 'distance'}

INSIGHT_EXAMPLES = (
    "Examples of the tone and specificity wanted. They show the format only: never reuse their "
    "exercises or numbers, only the user's data above.\n"
    'Good: {"type":"achievement","title":"Bench Press Max Weight Up 10 lbs","body":"Your Bench Press max '
    'weight rose from 225 to 235 lbs in the last 2 weeks. Keep the same rep scheme one more week before '
    'adding load.","priority":"medium","evidence":{"exercise":"Bench Press","metric":"Max Weight",'
    '"before":225,"after":235,"window_days":14}}\n'
    'Good: {"type":"suggestion","title":"Overhead Press Has Stalled","body":"No new Overhead Press max weight '
    'PR in 45 days. Switch to 4 sets of 5 at a heavier load for the next 3 weeks.","priority":"high",'
    '"evidence":{"exercise":"Overhead Press","metric":"Max Weight","before":null,"after":null,"window_days":45}}\n'
    'Good: {"type":"frequency","title":"Back Volume Down This Week","body":"You logged 6 back sets this week, '
    'down from 12 last week. Add 2 sets of rows to your next pull day.","priority":"medium",'
    '"evidence":{"exercise":null,"metric":null,"before":null,"after":null,"window_days":7}}\n'
    'Bad: {"type":"achievement","title":"Great Progress","body":"You are getting stronger, keep it up.",'
    '"priority":"low","evidence":{"exercise":null,"metric":null,"before":null,"after":null,"window_days":null}} '
    '(no metric, no numbers, no next step)'
)

# The API enforces this shape, so the model can't return prose, markdown, or a
# missing field. "evidence" is what lets the backend check an insight against
# the data it was given before the user ever sees it.
INSIGHT_SCHEMA = {
    'type': 'object',
    'properties': {
        'insights': {
            'type': 'array',
            'items': {
                'type': 'object',
                'properties': {
                    'type': {'type': 'string',
                             'enum': ['deload', 'rest', 'frequency', 'routine', 'achievement', 'suggestion']},
                    'title': {'type': 'string'},
                    'body': {'type': 'string'},
                    'priority': {'type': 'string', 'enum': ['high', 'medium', 'low']},
                    'evidence': {
                        'type': 'object',
                        'properties': {
                            'exercise': {'type': ['string', 'null']},
                            'metric': {'type': ['string', 'null']},
                            'before': {'type': ['number', 'null']},
                            'after': {'type': ['number', 'null']},
                            'window_days': {'type': ['integer', 'null']},
                        },
                        'required': ['exercise', 'metric', 'before', 'after', 'window_days'],
                        'additionalProperties': False,
                    },
                },
                'required': ['type', 'title', 'body', 'priority', 'evidence'],
                'additionalProperties': False,
            },
        },
    },
    'required': ['insights'],
    'additionalProperties': False,
}

PRIORITY_ORDER = {'high': 0, 'medium': 1, 'low': 2}
MAX_INSIGHTS = 5


def _fact_matches(fact, evidence, tolerance=0.5):
    for key in ('before', 'after'):
        claimed = evidence.get(key)
        if claimed is None:
            continue
        actual = fact.get(key)
        if actual is None or abs(float(claimed) - float(actual)) > tolerance:
            return False
    return True


def _verify_insights(insights, ctx):
    """Drops insights citing an exercise or numbers the Coach was never given,
    then keeps one per insight type, highest priority first."""
    facts = ctx.get('recent_pr_facts', [])
    known = {f['exercise'].lower() for f in facts}
    known |= {r['exercise_name'].lower() for r in ctx.get('stalled_lifts', [])}
    known |= {row.name.lower() for row in ctx.get('top_prs', [])}
    known |= {row.name.lower() for row in ctx.get('cardio_prs', [])}
    # Volume insights legitimately name a muscle group here rather than an
    # exercise ("Back: 6 sets this week"), so those count as known subjects too.
    for key in ('muscle_sets_week', 'muscle_sets_last_week', 'muscle_rpe_week'):
        known |= {muscle.lower() for muscle in (ctx.get(key) or {})}
    for key in ('most_improved_lift', 'most_improved_cardio'):
        entry = ctx.get(key)
        if entry:
            known.add(entry['exercise_name'].lower())

    kept, seen_types = [], set()
    for insight in insights:
        if not insight.get('title') or not insight.get('body'):
            continue
        evidence = insight.get('evidence') or {}
        exercise = (evidence.get('exercise') or '').strip()
        if exercise:
            if exercise.lower() not in known:
                continue
            exercise_facts = [f for f in facts if f['exercise'].lower() == exercise.lower()]
            claims_numbers = evidence.get('before') is not None or evidence.get('after') is not None
            if exercise_facts and claims_numbers and not any(_fact_matches(f, evidence) for f in exercise_facts):
                continue
        insight_type = insight.get('type')
        if insight_type:
            if insight_type in seen_types:
                continue
            seen_types.add(insight_type)
        kept.append(insight)

    kept.sort(key=lambda i: PRIORITY_ORDER.get(i.get('priority'), 3))
    return kept[:MAX_INSIGHTS]


def _fmt_pr_value(pr_type, value, unit):
    if pr_type == 'max_reps':
        return f"{value:g} reps"
    if pr_type == 'max_duration':
        return f"{round(value * 60)} s"
    if pr_type == 'best_time':
        return f"{value:.1f} min"
    if pr_type == 'best_distance':
        return f"{value:.2f} km"
    return f"{round(value, 1):g} {unit}"


def _summarize_recent_prs(rows, unit, now, limit=12):
    """One before → after fact per exercise, PR type, and weight or distance,
    newest first, so the Coach reads the trend instead of every intermediate PR.
    rows: (PREvent, exercise_name) pairs ordered oldest first.

    Returns dicts carrying both the prompt line ('text') and the underlying
    numbers, so insights can be checked against the facts they cite."""
    facts = {}
    for event, exercise_name in rows:
        key = (exercise_name, event.pr_type, event.weight_context)
        if key in facts:
            facts[key]['after'] = event.value
            facts[key]['last_at'] = event.achieved_at
        else:
            facts[key] = {
                'event': event, 'name': exercise_name, 'before': event.previous_value,
                'after': event.value, 'last_at': event.achieved_at,
            }

    out = []
    for fact in sorted(facts.values(), key=lambda f: f['last_at'], reverse=True)[:limit]:
        event = fact['event']
        label = _pr_label(event)
        if event.pr_type == 'max_reps':
            label += f" at {_fmt_pr_value('max_weight', event.weight_context, unit)}" if event.weight_context > 0 else " at bodyweight"
        days = (now - fact['last_at']).days
        when = 'today' if days == 0 else f"{days} day{'s' if days != 1 else ''} ago"
        after = _fmt_pr_value(event.pr_type, fact['after'], unit)
        if fact['before'] is None:
            text = f"{fact['name']}, {label}: {after} (first recorded, {when})"
        else:
            before = _fmt_pr_value(event.pr_type, fact['before'], unit)
            text = f"{fact['name']}, {label}: {before} → {after} ({when})"
        out.append({
            'exercise': fact['name'],
            'metric': label,
            'pr_type': event.pr_type,
            'before': fact['before'],
            'after': fact['after'],
            'days_ago': days,
            'text': text,
        })
    return out

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
    Returns [{id, name, muscle_group, equipment, prescribed_sets, prescribed_reps, prescribed_rpe}].
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
                'equipment': tmpl.equipment or '',
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

    # Greek rank, from the same helper the app's rank screens use. This used to
    # read the latest score snapshot, which holds a Strength or Endurance
    # percentile rather than the Greek score, through its own threshold table.
    from routes.strength_score_routes import _greek_rank_data
    greek_rank = _greek_rank_data(user)['rank']

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

    # Greek rank from the shared helper (see _build_user_context)
    from routes.strength_score_routes import _greek_rank_data
    _greek = _greek_rank_data(user)
    greek_rank = _greek['rank']
    greek_score = _greek['score']

    last_workout = (
        db.session.query(db.func.max(Workout.date))
        .filter(Workout.user_id == user_id)
        .scalar()
    )

    unit = (user.weight_unit or 'lbs') if user else 'lbs'
    pr_event_rows = (
        db.session.query(PREvent, ExerciseTemplate.name)
        .join(ExerciseTemplate, PREvent.exercise_template_id == ExerciseTemplate.id)
        .filter(PREvent.user_id == user_id, PREvent.achieved_at >= now - timedelta(days=COACH_PR_WINDOW_DAYS))
        .order_by(PREvent.achieved_at.asc(), PREvent.id.asc())
        .all()
    )
    stalled_lifts = [
        r for r in compute_days_since_last_pr(user_id, now) if r['days_since_last_pr'] >= STALL_DAYS
    ][:5]

    return {
        'now': now,
        'name': (user.name or user.username) if user else 'Athlete',
        'weight_unit': unit,
        'recent_pr_facts': _summarize_recent_prs(pr_event_rows, unit, now),
        'stalled_lifts': stalled_lifts,
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
            f"\nMost improved lift this week (estimated 1RM: a new all-time best, compared with last week's best "
            f"estimated 1RM): {most_improved['exercise_name']} "
            f"{most_improved['prev_best']} → {most_improved['this_best']} {unit} (+{most_improved['gain']} {unit})"
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

    recent_pr_facts = ctx.get('recent_pr_facts', [])
    if recent_pr_facts:
        lines.append(f"\nPRs in the last {COACH_PR_WINDOW_DAYS} days (before → after, newest first):")
        lines += [f"  {fact['text']}" for fact in recent_pr_facts]

    stalled_lifts = ctx.get('stalled_lifts', [])
    if stalled_lifts:
        lines.append(f"\nMost-trained lifts with no new PR in {STALL_DAYS}+ days (longest gap first):")
        for r in stalled_lifts:
            label = STALLED_CATEGORY_LABELS.get(r['stalest_category'], r['stalest_category'])
            lines.append(f"  {r['exercise_name']}: no {label} PR in {r['days_since_last_pr']} days")
        lines.append(
            "  → Treat these as plateaus that need a specific fix (rep scheme, exercise variation, or a deload). "
            "Don't call any other lift stalled."
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
        "Be specific: cite actual numbers from the data above. Each insight must be actionable.",
        "When an insight says a lift or cardio result improved, name exactly what increased (estimated 1RM, "
        "max weight, reps at a weight, distance, or time) and give the before and after values with units, "
        "e.g. \"Your Bench Press estimated 1RM rose from 200 to 210 lbs.\" Only claim improvements shown in the data above.",
        "",
        INSIGHT_EXAMPLES,
        "",
        'Return 3-5 insights. Title: 6 words max. Body: 1-2 sentences with specific data.',
        'Fill "evidence" whenever an insight cites one lift\'s numbers: "exercise" exactly as written above, '
        '"metric" (Max Weight, Estimated 1RM, 5K Best Time, and so on), "before" and "after" as plain numbers, '
        'and "window_days". Leave those fields null for insights that are not about a single lift\'s numbers. '
        'Insights citing an exercise or numbers that do not appear above are discarded.',
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
            system=COACH_VOICE,
            messages=[{"role": "user", "content": prompt}],
        )

        result = _parse_ai_json(msg.content[0].text)

        if generate_type == 'routine':
            days_preview = []
            for day in result.get('days', []):
                exercises = _match_exercises(day.get('exercises', []))
                days_preview.append({'label': _brand_copy(day['label'], heading=True), 'exercises': exercises})
            return jsonify({
                'type': 'routine',
                'name': _brand_copy(result['name'], heading=True),
                'description': _brand_copy(result.get('description', '')),
                'days': days_preview,
            }), 200
        else:
            exercises = _match_exercises(result.get('exercises', []))
            return jsonify({
                'type': 'template',
                'name': _brand_copy(result['name'], heading=True),
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
            system=COACH_VOICE,
            output_config={'format': {'type': 'json_schema', 'schema': INSIGHT_SCHEMA}},
            messages=[{'role': 'user', 'content': prompt}],
        )
        result = _parse_ai_json(msg.content[0].text)
        insights = [
            {**i, 'title': _brand_copy(i.get('title'), heading=True), 'body': _brand_copy(i.get('body'))}
            for i in result.get('insights', [])
        ]
        return jsonify({'insights': _verify_insights(insights, ctx), 'generated_at': datetime.now().isoformat()}), 200

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
