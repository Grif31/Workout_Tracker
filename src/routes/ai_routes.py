import os
import json
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from models import db, WorkoutTemplate, ExerciseTemplate, Routine, RoutineDay

ai_bp = Blueprint('ai_bp', __name__)


def _match_exercise_ids(names: list[str]) -> list[int]:
    all_templates = ExerciseTemplate.query.all()
    name_map = {t.name.lower(): t.id for t in all_templates}
    ids = []
    for name in names:
        low = name.lower()
        mid = name_map.get(low)
        if not mid:
            for key, tid in name_map.items():
                if low in key or key in low:
                    mid = tid
                    break
        if mid and mid not in ids:
            ids.append(mid)
    return ids


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
def generate_workout():
    data = request.get_json()
    user_id = get_jwt_identity()

    days_per_week = int(data.get('days_per_week', 3))
    goal = data.get('goal', 'general')
    experience = data.get('experience', 'beginner')
    generate_type = data.get('generate_type', 'routine')

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
            routine = Routine(
                user_id=user_id,
                name=result['name'],
                description=result.get('description'),
            )
            db.session.add(routine)
            db.session.flush()

            for order, day in enumerate(result.get('days', [])):
                ex_ids = _match_exercise_ids(day.get('exercises', []))
                exercises = ExerciseTemplate.query.filter(
                    ExerciseTemplate.id.in_(ex_ids)
                ).all() if ex_ids else []
                template = WorkoutTemplate(
                    user_id=user_id,
                    name=f"{result['name']} – {day['label']}",
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

        else:
            ex_ids = _match_exercise_ids(result.get('exercises', []))
            exercises = ExerciseTemplate.query.filter(
                ExerciseTemplate.id.in_(ex_ids)
            ).all() if ex_ids else []
            template = WorkoutTemplate(user_id=user_id, name=result['name'], exercises=exercises)
            db.session.add(template)
            db.session.commit()
            return jsonify({'type': 'template', 'id': template.id, 'name': template.name}), 201

    except ImportError:
        return jsonify({'message': 'anthropic package not installed — run pip install anthropic'}), 503
    except json.JSONDecodeError as e:
        return jsonify({'message': f'AI returned malformed JSON: {e}'}), 500
    except Exception as e:
        return jsonify({'message': f'Generation failed: {e}'}), 500
