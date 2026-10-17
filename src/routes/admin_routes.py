import os
import secrets
import urllib.parse
from functools import wraps
import requests as http_requests
from flask import Blueprint, Response, current_app, jsonify, redirect, render_template, request, url_for
from limiter import limiter
from models import db, AdminAuditLog, ExerciseTemplate
from utils.admin_audit import audit

_RAPIDAPI_HOST = 'exercisedb.p.rapidapi.com'
_RAPIDAPI_IMAGE_HEADERS = {'User-Agent': 'Mozilla/5.0 (compatible; AreteAdmin/1.0)'}
# Cloudflare's bot-fight-mode 403s (error 1010) requests with no User-Agent,
# so every RapidAPI call here sends one alongside the API key headers.


def _rapidapi_headers(api_key: str) -> dict:
    return {'X-RapidAPI-Key': api_key, 'X-RapidAPI-Host': _RAPIDAPI_HOST, **_RAPIDAPI_IMAGE_HEADERS}


def _rapidapi_error_message(exc: Exception) -> str:
    """RapidAPI puts the actually-useful text (e.g. "monthly quota exceeded")
    in the response body's JSON, not in the exception string — surface that
    instead of a raw "429 Client Error: ..." message that just looks like a
    generic failure."""
    response = getattr(exc, 'response', None)
    if response is not None:
        try:
            return response.json().get('message', str(exc))
        except Exception:
            pass
    return str(exc)

_OUR_TO_EXERCISEDB_EQUIP = {
    'Barbell':       'barbell',
    'Dumbbell':      'dumbbell',
    'Cable':         'cable',
    'Machine':       'leverage machine',
    'Bodyweight':    'body weight',
    'Smith Machine': 'smith machine',
    'EZ Bar':        'ez barbell',
    'Kettlebell':    'kettlebell',
    'Weighted':      'weighted',
}

admin_bp = Blueprint('admin', __name__, url_prefix='/admin')

# Only failed logins count, so a page that loads twenty thumbnails doesn't eat
# into it. 20 rather than 5 because a browser's first request always 401s
# before it shows the password prompt. Without ProxyFix the key is Railway's
# proxy address, so this is one counter for everyone: a guessing run locks the
# owner out for the window too, which is the safe way round.
limiter.shared_limit(
    '20 per 15 minutes', scope='admin-login',
    deduct_when=lambda response: response.status_code == 401,
)(admin_bp)


def _require_admin(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        auth = request.authorization
        password = os.environ.get('ADMIN_PASSWORD', '')
        if not password or not auth or not secrets.compare_digest(auth.password or '', password):
            return Response('Unauthorized', 401, {'WWW-Authenticate': 'Basic realm="Arete Admin"'})
        return f(*args, **kwargs)
    return decorated


def _admin_write(f):
    """The browser replays cached Basic credentials to any page that posts
    here, so a write must come from our own origin. Same-origin fetches always
    send Origin on a POST, and a cross-site form can't send a JSON body.
    Compares host only: without ProxyFix, request.scheme is http behind
    Railway's TLS proxy while the browser's Origin says https."""
    @wraps(f)
    def decorated(*args, **kwargs):
        origin_host = urllib.parse.urlparse(request.headers.get('Origin', '')).netloc
        if not request.is_json or origin_host != request.host:
            return jsonify({'message': 'Admin writes must be JSON from the admin page'}), 403
        return f(*args, **kwargs)
    return decorated


@admin_bp.get('/')
@_require_admin
def admin_home():
    return redirect(url_for('admin.admin_exercises'))


@admin_bp.get('/audit')
@_require_admin
def admin_audit():
    limit = 200
    rows = AdminAuditLog.query.order_by(AdminAuditLog.created_at.desc(), AdminAuditLog.id.desc()).limit(limit).all()
    return render_template('admin/audit.html', active='audit', rows=rows, limit=limit)



@admin_bp.get('/exercises')
@_require_admin
def admin_exercises():
    return render_template('admin/exercises.html', active='exercises')


@admin_bp.get('/exercises/data')
@_require_admin
def admin_exercises_data():
    exercises = ExerciseTemplate.query.order_by(ExerciseTemplate.name).all()
    return jsonify([{
        'id': ex.id,
        'name': ex.name,
        'equipment': ex.equipment or '',
        'muscle_group': ex.muscle_group or '',
        'exercise_type': ex.exercise_type or 'strength',
        'image_url': ex.image_url or '',
        'is_custom': ex.user_id is not None,
    } for ex in exercises])


@admin_bp.post('/exercises/<int:exercise_id>/image')
@_require_admin
@_admin_write
def update_exercise_image(exercise_id):
    ex = db.session.get(ExerciseTemplate, exercise_id)
    if not ex:
        return jsonify({'message': 'Not found'}), 404
    data = request.get_json(silent=True) or {}
    before = ex.image_url
    ex.image_url = data.get('image_url') or None
    audit('exercise.image.set', 'exercise', ex.id, {'image_url': before}, {'image_url': ex.image_url})
    db.session.commit()
    return jsonify({'message': 'ok'})


@admin_bp.get('/exercises/<int:exercise_id>/suggest')
@_require_admin
def suggest_exercise_image(exercise_id):
    """Search ExerciseDB for GIFs matching this exercise's name + equipment.

    Defaults to searching by this exercise's own name, but accepts an
    optional ?q= override so the admin page can search ExerciseDB directly
    when the auto-match misses a GIF that exists under a different name.
    """
    ex = db.session.get(ExerciseTemplate, exercise_id)
    if not ex:
        return jsonify({'message': 'Not found'}), 404

    api_key = os.environ.get('RAPIDAPI_KEY', '')
    if not api_key:
        return jsonify({'message': 'RAPIDAPI_KEY not configured on server'}), 503

    query = (request.args.get('q') or ex.name).strip().lower()
    if not query:
        return jsonify({'message': 'Search query required'}), 400
    # safe='' so a '/' in the query can't walk the upstream path.
    name_encoded = urllib.parse.quote(query, safe='')
    url = f'https://exercisedb.p.rapidapi.com/exercises/name/{name_encoded}?limit=30'
    try:
        resp = http_requests.get(url, headers=_rapidapi_headers(api_key), timeout=15)
        resp.raise_for_status()
        data = resp.json()
    except Exception as exc:
        return jsonify({'message': _rapidapi_error_message(exc)}), 502

    target_equip = _OUR_TO_EXERCISEDB_EQUIP.get(ex.equipment or '', '').lower()

    # Sort: equipment-matching results first
    data.sort(key=lambda item: 0 if item['equipment'] == target_equip else 1)

    # This dataset's ids (e.g. "0025") only resolve through RapidAPI's own
    # /image endpoint, which requires the API key as a header — they are NOT
    # valid on the public v2.exercisedb.io CDN (that's a different, newer
    # dataset with its own id scheme; hitting it with these ids 422s). So the
    # thumbnail src has to go through our own proxy route, which holds the key
    # server-side, rather than pointing straight at ExerciseDB.
    results = [
        {
            'name': item['name'],
            'equipment': item['equipment'],
            'exercisedbId': item['id'],
            'gifUrl': f'/admin/exercises/image-proxy/{item["id"]}',
        }
        for item in data[:20]
    ]
    return jsonify(results)


@admin_bp.get('/exercises/image-proxy/<exercisedb_id>')
@_require_admin
def exercise_image_proxy(exercisedb_id):
    """Streams a suggestion thumbnail through the server so the admin page can
    render it without exposing the RapidAPI key to the browser."""
    api_key = os.environ.get('RAPIDAPI_KEY', '')
    if not api_key:
        return Response(status=503)
    try:
        resp = http_requests.get(
            f'https://{_RAPIDAPI_HOST}/image',
            params={'exerciseId': exercisedb_id, 'resolution': '360'},
            headers=_rapidapi_headers(api_key),
            timeout=15,
        )
        resp.raise_for_status()
    except Exception:
        return Response(status=502)
    return Response(resp.content, mimetype=resp.headers.get('Content-Type', 'image/gif'))


@admin_bp.post('/exercises/<int:exercise_id>/apply-suggestion')
@_require_admin
@_admin_write
def apply_exercise_suggestion(exercise_id):
    """Downloads the chosen ExerciseDB GIF server-side and re-hosts it under
    our own /static path — the mobile app's <Image> can't attach the
    RapidAPI key header, so the final image_url can never point directly at
    ExerciseDB; it has to be a file we actually store, same as avatars."""
    ex = db.session.get(ExerciseTemplate, exercise_id)
    if not ex:
        return jsonify({'message': 'Not found'}), 404

    data = request.get_json(silent=True) or {}
    exercisedb_id = data.get('exercisedb_id')
    if not exercisedb_id:
        return jsonify({'message': 'exercisedb_id required'}), 400

    api_key = os.environ.get('RAPIDAPI_KEY', '')
    if not api_key:
        return jsonify({'message': 'RAPIDAPI_KEY not configured on server'}), 503

    try:
        resp = http_requests.get(
            f'https://{_RAPIDAPI_HOST}/image',
            params={'exerciseId': exercisedb_id, 'resolution': '360'},
            headers=_rapidapi_headers(api_key),
            timeout=15,
        )
        resp.raise_for_status()
    except Exception as exc:
        return jsonify({'message': f'Could not fetch image: {_rapidapi_error_message(exc)}'}), 502

    images_dir = os.path.join(current_app.static_folder, 'exercise_images')
    os.makedirs(images_dir, exist_ok=True)
    filename = f'{exercise_id}.gif'
    with open(os.path.join(images_dir, filename), 'wb') as f:
        f.write(resp.content)

    before = ex.image_url
    ex.image_url = f'/static/exercise_images/{filename}'
    audit('exercise.image.apply_suggestion', 'exercise', ex.id,
          {'image_url': before}, {'image_url': ex.image_url, 'exercisedb_id': exercisedb_id})
    db.session.commit()
    return jsonify({'image_url': ex.image_url})
