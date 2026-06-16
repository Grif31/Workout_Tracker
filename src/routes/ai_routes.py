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
)
from schemas import AiGenerateSchema
from utils.validation import validate_body
from limiter import limiter

ai_bp = Blueprint('ai_bp', __name__)

_ai_generate_schema = AiGenerateSchema()


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

    # Top strength PRs — max_weight only; never expose estimated_1rm
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

    # Working sets per muscle group over last 14 days (mirrors muscle_volume endpoint logic)
    cutoff = datetime.now() - timedelta(days=14)
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

    return {
        'weight_unit':        (user.weight_unit or 'lbs') if user else 'lbs',
        'bodyweight':         user.bodyweight if user else None,
        'gender':             user.gender if user else None,
        'top_prs':            pr_rows,
        'muscle_sets_14d':    muscle_sets,
        'last_workout_date':  last_workout_date,
    }


def _build_prompt(data: dict, generate_type: str, user_context: dict | None = None) -> str:
    goal               = data['goal']
    experience         = data['experience']
    days_per_week      = data['days_per_week']
    equipment          = data.get('equipment', 'full_gym')
    session_length_min = data.get('session_length_min', 60)
    avoid              = data.get('avoid', 'none')

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
    avoid_directive = AVOID_MAP.get(avoid, AVOID_MAP['none'])

    # ── Real user data section ────────────────────────────────
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

    return (
        f"You are an elite personal trainer. Build a precise, client-appropriate program.\n\n"
        f"CLIENT PROFILE:\n"
        f"• Goal: {GOAL_LABELS.get(goal, goal)}\n"
        f"• Experience: {EXP_LABELS.get(experience, experience)}\n"
        f"• Days per week: {days_per_week}\n"
        f"• Equipment: {EQUIP_LABELS.get(equipment, equipment)}\n"
        f"• Session length: {session_length_min} minutes ({ex_count} per session)\n"
        f"• Limitations: {avoid_directive}\n\n"
        f"{training_status_section}"
        f"PROGRAMMING RULES — follow exactly:\n"
        f"1. Structure: {structure_rule}\n"
        f"2. Sets × Reps: {SET_REP.get(goal, SET_REP['general'])}\n"
        f"3. Equipment constraint: ONLY use exercises achievable with the client's equipment.\n"
        f"   Valid exercise examples: {EQUIP_EXAMPLES.get(equipment, '')}\n"
        f"4. Injuries: {avoid_directive}\n"
        f"5. Use standard exercise names (e.g. 'Bench Press', 'Pull-Up', 'Hip Thrust', 'Dumbbell Row').\n\n"
        f"Respond with ONLY valid JSON — no markdown, no explanation:\n"
        f"{json_format}"
    )


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
        return jsonify({'message': 'AI service not configured — add ANTHROPIC_API_KEY to .env'}), 503

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
        return jsonify({'message': 'anthropic package not installed — run pip install anthropic'}), 503
    except json.JSONDecodeError as e:
        return jsonify({'message': f'AI returned malformed JSON: {e}'}), 500
    except Exception:
        current_app.logger.exception('AI generation failed')
        return jsonify({'message': 'Generation failed'}), 500


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
                name=f"{routine.name} – {day['label']}",
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

    return jsonify({'message': 'Invalid type — must be "routine" or "template"'}), 400
