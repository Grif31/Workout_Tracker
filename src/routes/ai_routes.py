import os
import json
from flask import Blueprint, request, jsonify, current_app, g
from flask_jwt_extended import jwt_required, get_jwt_identity
from models import db, WorkoutTemplate, ExerciseTemplate, Routine, RoutineDay
from schemas import AiGenerateSchema
from utils.validation import validate_body
from limiter import limiter

ai_bp = Blueprint('ai_bp', __name__)

_ai_generate_schema = AiGenerateSchema()


def _match_exercises(names: list[str]) -> list[dict]:
    """Match AI-generated exercise names to DB records. Returns [{id, name, muscle_group}]."""
    all_templates = ExerciseTemplate.query.all()
    name_map = {t.name.lower(): t for t in all_templates}
    result = []
    seen_ids: set[int] = set()
    for name in names:
        low = name.lower()
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
            })
    return result


def _parse_ai_json(raw: str) -> dict:
    text = raw.strip()
    if '```' in text:
        parts = text.split('```')
        for part in parts:
            stripped = part.strip().lstrip('json').strip()
            if stripped.startswith('{'):
                text = stripped
                break
    return json.loads(text)


@ai_bp.post('/api/ai/generate')
@jwt_required()
@limiter.limit('10 per day', key_func=lambda: f"ai_gen:{get_jwt_identity()}")
@validate_body(_ai_generate_schema)
def generate_workout():
    """Generate a workout plan and return a preview — does NOT save to DB."""
    data = g.validated
    days_per_week = data['days_per_week']
    goal         = data['goal']
    experience   = data['experience']
    generate_type = data['generate_type']

    api_key = os.environ.get('ANTHROPIC_API_KEY')
    if not api_key:
        return jsonify({'message': 'AI service not configured — add ANTHROPIC_API_KEY to .env'}), 503

    try:
        import anthropic
        client = anthropic.Anthropic(api_key=api_key)

        if generate_type == 'routine':
            prompt = (
                f"You are a professional strength and conditioning coach.\n"
                f"Create a {days_per_week}-day per week workout routine.\n"
                f"Goal: {goal}\nExperience: {experience}\nDays/week: {days_per_week}\n\n"
                "Respond with ONLY valid JSON (no markdown, no explanation):\n"
                '{"name":"Routine name","description":"1-2 sentence description",'
                '"days":[{"label":"Day name","exercises":["Ex1","Ex2","Ex3","Ex4","Ex5"]}]}\n\n'
                "Use 4-6 exercises per day. Use standard exercise names like "
                "\"Bench Press\", \"Squat\", \"Deadlift\", \"Pull-Up\", \"Overhead Press\"."
            )
        else:
            prompt = (
                "You are a professional strength and conditioning coach.\n"
                f"Create a single workout session. Goal: {goal}. Experience: {experience}.\n\n"
                "Respond with ONLY valid JSON (no markdown, no explanation):\n"
                '{"name":"Workout name","exercises":["Ex1","Ex2","Ex3","Ex4","Ex5","Ex6"]}\n\n'
                "Use 5-7 exercises. Use standard exercise names."
            )

        msg = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=1024,
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
            template = WorkoutTemplate(
                user_id=user_id,
                name=f"{routine.name} – {day['label']}",
                exercises=exercises,
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
        template = WorkoutTemplate(
            user_id=user_id,
            name=data.get('name', 'My Workout'),
            exercises=exercises,
        )
        db.session.add(template)
        db.session.commit()
        return jsonify({'type': 'template', 'id': template.id, 'name': template.name}), 201

    return jsonify({'message': "type must be 'routine' or 'template'"}), 400

    return jsonify({'message': 'Invalid type — must be "routine" or "template"'}), 400
