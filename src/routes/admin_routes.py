import os
import secrets
from functools import wraps
from flask import Blueprint, Response, jsonify, request
from models import db, ExerciseTemplate

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
    .status { font-size: 11px; margin-left: auto; }
    .status.ok  { color: #30D158; }
    .status.err { color: #FF453A; }
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
          <div class="btn-row">
            <button class="btn-save" onclick="save(${ex.id})">Save</button>
            <button class="btn-clear" onclick="doClear(${ex.id})">Clear</button>
            <span class="status" id="status-${ex.id}"></span>
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
