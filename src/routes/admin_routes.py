import json
import os
import secrets
import urllib.parse
from functools import wraps
import requests as http_requests
from flask import Blueprint, Response, current_app, jsonify, request
from models import db, ExerciseTemplate

_RAPIDAPI_HOST = 'exercisedb.p.rapidapi.com'
_RAPIDAPI_IMAGE_HEADERS = {'User-Agent': 'Mozilla/5.0 (compatible; AreteAdmin/1.0)'}
# Cloudflare's bot-fight-mode 403s (error 1010) requests with no User-Agent,
# so every RapidAPI call here sends one alongside the API key headers.


def _rapidapi_headers(api_key: str) -> dict:
    return {'X-RapidAPI-Key': api_key, 'X-RapidAPI-Host': _RAPIDAPI_HOST, **_RAPIDAPI_IMAGE_HEADERS}

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


def _require_admin(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        auth = request.authorization
        password = os.environ.get('ADMIN_PASSWORD', '')
        if not password or not auth or not secrets.compare_digest(auth.password or '', password):
            return Response('Unauthorized', 401, {'WWW-Authenticate': 'Basic realm="Arete Admin"'})
        return f(*args, **kwargs)
    return decorated


ADMIN_PAGE = """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Exercise Images — Aretē Admin</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #0D0D0D;
      color: #F2F2F7;
      min-height: 100vh;
    }
    .topbar {
      position: sticky;
      top: 0;
      z-index: 10;
      background: #1C1C1E;
      border-bottom: 1px solid #2C2C2E;
      padding: 14px 20px;
      display: flex;
      gap: 12px;
      align-items: center;
      flex-wrap: wrap;
    }
    h1 { font-size: 17px; font-weight: 700; flex-shrink: 0; }
    .stats { font-size: 13px; color: #8E8E93; flex-shrink: 0; }
    .search {
      flex: 1;
      min-width: 180px;
      background: #2C2C2E;
      border: 1px solid #3A3A3C;
      border-radius: 8px;
      padding: 8px 12px;
      color: #F2F2F7;
      font-size: 14px;
      outline: none;
    }
    .search::placeholder { color: #636366; }
    .search:focus { border-color: #30D158; }
    .filters { display: flex; gap: 6px; flex-shrink: 0; }
    .fbtn {
      padding: 7px 13px;
      border-radius: 8px;
      border: 1px solid #3A3A3C;
      background: transparent;
      color: #8E8E93;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.12s;
    }
    .fbtn.active { background: #30D158; border-color: #30D158; color: #000; }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(270px, 1fr));
      gap: 14px;
      padding: 20px;
    }
    .card {
      background: #1C1C1E;
      border: 1px solid #2C2C2E;
      border-radius: 12px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      transition: border-color 0.15s;
    }
    .card.saved { border-color: #30D158; }
    .img-wrap {
      height: 170px;
      background: #2C2C2E;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    }
    .img-wrap img { width: 100%; height: 100%; object-fit: cover; }
    .no-img { color: #636366; font-size: 13px; }
    .img-err { color: #FF453A; font-size: 13px; }
    .info { padding: 10px 13px 6px; }
    .name { font-size: 14px; font-weight: 700; line-height: 1.3; }
    .meta { font-size: 11px; color: #8E8E93; margin-top: 3px; }
    .badge-custom {
      display: inline-block;
      font-size: 10px; font-weight: 700;
      color: #30D158;
      background: rgba(48,209,88,0.12);
      padding: 2px 6px; border-radius: 4px;
      margin-top: 4px;
    }
    .url-input {
      margin: 8px 12px 0;
      background: #2C2C2E;
      border: 1px solid #3A3A3C;
      border-radius: 8px;
      padding: 7px 10px;
      color: #F2F2F7;
      font-size: 12px;
      outline: none;
      width: calc(100% - 24px);
    }
    .url-input::placeholder { color: #636366; }
    .url-input:focus { border-color: #30D158; }
    .btn-row {
      display: flex;
      gap: 7px;
      padding: 8px 12px 12px;
      align-items: center;
      flex-wrap: wrap;
    }
    .btn-save {
      background: #30D158; color: #000;
      border: none; border-radius: 7px;
      padding: 7px 15px; font-size: 12px; font-weight: 700;
      cursor: pointer;
    }
    .btn-save:hover { opacity: 0.85; }
    .btn-clear {
      background: transparent; color: #8E8E93;
      border: 1px solid #3A3A3C; border-radius: 7px;
      padding: 7px 12px; font-size: 12px; font-weight: 600;
      cursor: pointer;
    }
    .btn-clear:hover { border-color: #FF453A; color: #FF453A; }
    .btn-suggest {
      background: transparent; color: #0A84FF;
      border: 1px solid #0A84FF; border-radius: 7px;
      padding: 7px 12px; font-size: 12px; font-weight: 600;
      cursor: pointer; margin-left: auto;
    }
    .btn-suggest:hover { background: rgba(10,132,255,0.1); }
    .btn-suggest:disabled { opacity: 0.5; cursor: default; }
    .gif-search {
      background: #1C1C1E; border: 1px solid #3A3A3C; border-radius: 7px;
      color: #F2F2F7; font-size: 12px; padding: 7px 10px;
      width: 130px;
    }
    .gif-search:focus { outline: none; border-color: #0A84FF; }
    .status { font-size: 11px; }
    .status.ok  { color: #30D158; }
    .status.err { color: #FF453A; }
    .suggest-row {
      display: flex;
      gap: 8px;
      padding: 0 12px 10px;
      flex-wrap: wrap;
    }
    .sug-thumb {
      flex-shrink: 0;
      width: 90px;
      cursor: pointer;
      border: 2px solid transparent;
      border-radius: 6px;
      overflow: hidden;
      background: #2C2C2E;
    }
    .sug-thumb:hover { border-color: #30D158; }
    .sug-thumb img { width: 90px; height: 70px; object-fit: cover; display: block; }
    .sug-label {
      font-size: 9px; color: #8E8E93; padding: 3px 4px;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .no-suggest { font-size: 11px; color: #636366; padding: 4px 0; }
    .empty { text-align: center; padding: 80px 24px; color: #636366; grid-column: 1/-1; }
  </style>
</head>
<body>
  <div class="topbar">
    <h1>Exercise Images</h1>
    <span class="stats" id="stats">Loading…</span>
    <input class="search" type="text" placeholder="Search by name or equipment…" oninput="onSearch(this.value)">
    <div class="filters">
      <button class="fbtn active" onclick="setFilter('all',this)">All</button>
      <button class="fbtn" onclick="setFilter('no_image',this)">No Image</button>
      <button class="fbtn" onclick="setFilter('has_image',this)">Has Image</button>
    </div>
  </div>
  <div class="grid" id="grid"></div>

  <script>
    let exercises = [];
    let filter = 'all';
    let search = '';

    function esc(s) {
      return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    async function init() {
      const res = await fetch('/admin/exercises/data');
      exercises = await res.json();
      render();
    }

    function setFilter(f, btn) {
      filter = f;
      document.querySelectorAll('.fbtn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      render();
    }

    function onSearch(val) { search = val.toLowerCase(); render(); }

    function visible(ex) {
      const match = ex.name.toLowerCase().includes(search) || ex.equipment.toLowerCase().includes(search);
      if (filter === 'no_image')  return match && !ex.image_url;
      if (filter === 'has_image') return match && !!ex.image_url;
      return match;
    }

    function render() {
      const list = exercises.filter(visible);
      const noImg = exercises.filter(e => !e.image_url).length;
      document.getElementById('stats').textContent =
        exercises.length + ' exercises · ' + noImg + ' without image · showing ' + list.length;

      document.getElementById('grid').innerHTML = list.length
        ? list.map(cardHtml).join('')
        : '<div class="empty">No exercises match.</div>';
    }

    function cardHtml(ex) {
      const url = esc(ex.image_url || '');
      const imgHtml = ex.image_url
        ? `<img src="${url}" onerror="imgErr(${ex.id})">`
        : `<div class="no-img">No image</div>`;
      const meta = [ex.equipment, ex.muscle_group].filter(Boolean).join(' · ');
      return `
        <div class="card" id="card-${ex.id}">
          <div class="img-wrap" id="wrap-${ex.id}">${imgHtml}</div>
          <div class="info">
            <div class="name">${esc(ex.name)}</div>
            <div class="meta">${esc(meta) || '—'}</div>
            ${ex.is_custom ? '<span class="badge-custom">Custom</span>' : ''}
          </div>
          <input class="url-input" type="url" id="input-${ex.id}"
                 placeholder="Paste image URL to preview…"
                 value="${url}"
                 oninput="previewUrl(${ex.id}, this.value)">
          <div class="suggest-row" id="suggest-${ex.id}"></div>
          <div class="btn-row">
            <button class="btn-save" onclick="save(${ex.id})">Save</button>
            <button class="btn-clear" onclick="doClear(${ex.id})">Clear</button>
            <span class="status" id="status-${ex.id}"></span>
            <input class="gif-search" type="text" id="gifq-${ex.id}" placeholder="Search ExerciseDB…"
                   onkeydown="if(event.key==='Enter'){event.preventDefault(); suggest(${ex.id}, this.value);}">
            <button class="btn-suggest" id="suggest-btn-${ex.id}"
                    onclick="suggest(${ex.id}, document.getElementById('gifq-${ex.id}').value)">Suggest</button>
          </div>
        </div>`;
    }

    function previewUrl(id, url) {
      const wrap = document.getElementById('wrap-' + id);
      if (!wrap) return;
      if (!url.trim()) {
        wrap.innerHTML = '<div class="no-img">No image</div>';
        return;
      }
      const safe = url.replace(/"/g, '');
      wrap.innerHTML = `<img src="${safe}" onerror="imgErr(${id})">`;
    }

    function imgErr(id) {
      const wrap = document.getElementById('wrap-' + id);
      if (wrap) wrap.innerHTML = '<div class="img-err">⚠ Could not load image</div>';
    }

    function doClear(id) {
      const input = document.getElementById('input-' + id);
      if (input) input.value = '';
      previewUrl(id, '');
    }

    async function save(id) {
      const input = document.getElementById('input-' + id);
      const status = document.getElementById('status-' + id);
      const url = (input?.value || '').trim();
      try {
        const res = await fetch('/admin/exercises/' + id + '/image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image_url: url || null }),
        });
        if (res.ok) {
          const ex = exercises.find(e => e.id === id);
          if (ex) ex.image_url = url;
          const card = document.getElementById('card-' + id);
          if (card) { card.classList.add('saved'); setTimeout(() => card.classList.remove('saved'), 1500); }
          status.textContent = '✓ Saved';
          status.className = 'status ok';
          setTimeout(() => { status.textContent = ''; }, 2500);
        } else {
          status.textContent = '✗ Error';
          status.className = 'status err';
        }
      } catch {
        status.textContent = '✗ Network error';
        status.className = 'status err';
      }
    }

    async function suggest(id, query) {
      const btn = document.getElementById('suggest-btn-' + id);
      const row = document.getElementById('suggest-' + id);
      btn.textContent = 'Loading…';
      btn.disabled = true;
      row.innerHTML = '';
      try {
        const q = (query || '').trim();
        const qs = q ? '?q=' + encodeURIComponent(q) : '';
        const res = await fetch('/admin/exercises/' + id + '/suggest' + qs);
        const data = await res.json();
        if (!res.ok || !data.length) {
          row.innerHTML = '<span class="no-suggest">No suggestions found.</span>';
          return;
        }
        row.innerHTML = data.map(s => {
          const safeGif = esc(s.gifUrl);
          const safeEquip = esc(s.equipment);
          const safeLabel = esc(s.name);
          const safeDbId = esc(s.exercisedbId);
          return `<div class="sug-thumb" title="${safeLabel}" onclick="selectSuggest(${id}, '${safeDbId}')">
            <img src="${safeGif}" loading="lazy">
            <div class="sug-label">${safeEquip}</div>
          </div>`;
        }).join('');
      } catch {
        row.innerHTML = '<span class="no-suggest">Error loading suggestions.</span>';
      } finally {
        btn.textContent = 'Suggest';
        btn.disabled = false;
      }
    }

    async function selectSuggest(id, exercisedbId) {
      const row = document.getElementById('suggest-' + id);
      const status = document.getElementById('status-' + id);
      if (row) row.innerHTML = '<span class="no-suggest">Saving…</span>';
      try {
        const res = await fetch('/admin/exercises/' + id + '/apply-suggestion', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ exercisedb_id: exercisedbId }),
        });
        const data = await res.json();
        if (!res.ok) {
          if (row) row.innerHTML = '<span class="no-suggest">' + esc(data.message || 'Error saving image.') + '</span>';
          return;
        }
        const input = document.getElementById('input-' + id);
        if (input) input.value = data.image_url;
        previewUrl(id, data.image_url);
        const ex = exercises.find(e => e.id === id);
        if (ex) ex.image_url = data.image_url;
        const card = document.getElementById('card-' + id);
        if (card) { card.classList.add('saved'); setTimeout(() => card.classList.remove('saved'), 1500); }
        if (status) {
          status.textContent = '✓ Saved';
          status.className = 'status ok';
          setTimeout(() => { status.textContent = ''; }, 2500);
        }
        if (row) row.innerHTML = '';
      } catch {
        if (row) row.innerHTML = '<span class="no-suggest">Network error.</span>';
      }
    }

    init();
  </script>
</body>
</html>"""


@admin_bp.get('/exercises')
@_require_admin
def admin_exercises():
    return Response(ADMIN_PAGE, mimetype='text/html')


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
def update_exercise_image(exercise_id):
    ex = db.session.get(ExerciseTemplate, exercise_id)
    if not ex:
        return jsonify({'message': 'Not found'}), 404
    data = request.get_json(silent=True) or {}
    ex.image_url = data.get('image_url') or None
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
    name_encoded = urllib.parse.quote(query)
    url = f'https://exercisedb.p.rapidapi.com/exercises/name/{name_encoded}?limit=30'
    try:
        resp = http_requests.get(url, headers=_rapidapi_headers(api_key), timeout=15)
        resp.raise_for_status()
        data = resp.json()
    except Exception as exc:
        return jsonify({'message': str(exc)}), 502

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
        return jsonify({'message': f'Could not fetch image: {exc}'}), 502

    images_dir = os.path.join(current_app.static_folder, 'exercise_images')
    os.makedirs(images_dir, exist_ok=True)
    filename = f'{exercise_id}.gif'
    with open(os.path.join(images_dir, filename), 'wb') as f:
        f.write(resp.content)

    ex.image_url = f'/static/exercise_images/{filename}'
    db.session.commit()
    return jsonify({'image_url': ex.image_url})
