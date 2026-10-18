import os
import re
import secrets
import urllib.parse
from datetime import datetime, timedelta
from functools import wraps
from flask import Blueprint, Response, current_app, jsonify, render_template, request, url_for
from limiter import limiter
from models import (db, AdminAuditLog, AdminState, AiCallLog, ExerciseDBEntry, ExerciseDBThumbnail,
                    ExerciseTemplate, InsightFeedback, User, Workout)
from utils import admin_charts, admin_dashboard, admin_stats, exercisedb
from utils.admin_audit import audit

# Thumbnails on the search panel are small; the saved file stays at 360, what
# the app has always shown.
_THUMB_RESOLUTION = '180'
_SAVE_RESOLUTION = '360'
_PAGES_PER_FETCH_STEP = 5   # ~50 rows in a few seconds, well under gunicorn's 30s on its one worker
_SEARCH_PAGE = 12           # each thumbnail not yet cached costs a call, so a small page
_EXERCISEDB_ID = re.compile(r'^[A-Za-z0-9]{1,16}$')

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


def _api_key():
    return os.environ.get('RAPIDAPI_KEY', '')


_COACH_LAST_OPENED = 'coach_last_opened'


@admin_bp.get('/')
@_require_admin
def admin_home():
    """The dashboard: anything that needs attention, then this week at a glance.
    Every figure comes from the same helpers as the page it links to, so the
    two can't disagree."""
    now = datetime.now()
    today = now.date()
    day_start = lambda d: datetime.combine(d, datetime.min.time())

    # Workouts and the users logging them, two weeks for this-vs-last-week
    since14 = day_start(today - timedelta(days=13))
    workout_rows = db.session.query(Workout.date, Workout.user_id).filter(Workout.date >= since14).all()
    per_day = admin_dashboard.daily_counts([d.date() for d, _ in workout_rows], today)
    active_per_day = admin_dashboard.daily_distinct([(d.date(), u) for d, u in workout_rows], today)
    week_start = day_start(today - timedelta(days=6))
    active_now = len({u for d, u in workout_rows if d >= week_start})
    active_before = len({u for d, u in workout_rows if d < week_start})

    # Coach: 30 days against the 30 before
    votes60 = InsightFeedback.query.filter(InsightFeedback.created_at >= now - timedelta(days=60)).all()
    recent = [v for v in votes60 if v.created_at >= now - timedelta(days=30)]
    earlier = [v for v in votes60 if v.created_at < now - timedelta(days=30)]
    rate_now = admin_dashboard.rate(sum(v.helpful for v in recent), len(recent))
    rate_before = admin_dashboard.rate(sum(v.helpful for v in earlier), len(earlier))
    last_opened = db.session.get(AdminState, _COACH_LAST_OPENED)
    wrong_q = InsightFeedback.query.filter_by(helpful=False, reason='wrong')
    if last_opened:
        wrong_q = wrong_q.filter(InsightFeedback.created_at > last_opened.updated_at)
    newest_wrong = (InsightFeedback.query.filter_by(helpful=False, reason='wrong')
                    .order_by(InsightFeedback.created_at.desc()).first())

    # AI
    month_start = admin_stats.month_start(now)
    since30 = day_start(today - timedelta(days=29))
    ai_rows = AiCallLog.query.filter(AiCallLog.created_at >= min(since30, month_start)).all()
    last24 = [r for r in ai_rows if r.created_at >= now - timedelta(hours=24)]
    insights = next((e for e in admin_stats.ai_by_endpoint([r for r in ai_rows if r.created_at >= since30])
                     if e['endpoint'] == 'insights'), None)

    alerts = [a for a in (
        admin_dashboard.ai_failure_alert(len(last24), sum(1 for r in last24 if not r.ok)),
        admin_dashboard.looks_wrong_alert(wrong_q.count()),
        admin_dashboard.quota_alert(exercisedb.quota['remaining']),
    ) if a]

    missing_images = ExerciseTemplate.query.filter(
        ExerciseTemplate.user_id.is_(None),
        (ExerciseTemplate.image_url.is_(None)) | (ExerciseTemplate.image_url == '')).count()
    return render_template(
        'admin/dashboard.html', active='dashboard', alerts=alerts,
        workouts={'week': sum(per_day[7:]), 'change': admin_dashboard.change(sum(per_day[7:]), sum(per_day[:7])),
                  'today': per_day[-1], 'spark': admin_charts.sparkline(per_day[7:])},
        active_users={'week': active_now, 'change': admin_dashboard.change(active_now, active_before),
                      'spark': admin_charts.sparkline(active_per_day[7:])},
        premium={'count': User.query.filter_by(is_premium=True).count(), 'users': User.query.count()},
        coach={'rate': rate_now, 'change': (admin_dashboard.change(rate_now, rate_before)
                                            if rate_now is not None and rate_before is not None else None),
               'votes_week': sum(1 for v in recent if v.created_at >= now - timedelta(days=7)),
               'newest_wrong': newest_wrong},
        ai={'month': admin_stats.ai_totals([r for r in ai_rows if r.created_at >= month_start]),
            'month_label': month_start.strftime('%B'),
            'day': admin_stats.ai_totals(last24), 'insights': insights},
        content={'missing_images': missing_images,
                 'catalog': ExerciseDBEntry.query.count(),
                 'quota': exercisedb.quota['remaining']},
        audit_rows=AdminAuditLog.query.order_by(AdminAuditLog.created_at.desc(), AdminAuditLog.id.desc()).limit(5).all(),
    )


@admin_bp.get('/audit')
@_require_admin
def admin_audit():
    limit = 200
    rows = AdminAuditLog.query.order_by(AdminAuditLog.created_at.desc(), AdminAuditLog.id.desc()).limit(limit).all()
    return render_template('admin/audit.html', active='audit', rows=rows, limit=limit)


_COACH_RANGES = {'30': 30, '90': 90, 'all': None}


def _usernames(user_ids):
    ids = {i for i in user_ids if i is not None}
    if not ids:
        return {}
    return {u.id: u.username for u in User.query.filter(User.id.in_(ids))}


@admin_bp.get('/coach')
@_require_admin
def admin_coach():
    """How the Coach's insights land, from users' thumbs. Votes key on the
    insight's title and body, since insights themselves aren't stored."""
    range_key = request.args.get('range', '90')
    if range_key not in _COACH_RANGES:
        range_key = '90'
    now = datetime.now()
    query = InsightFeedback.query
    if _COACH_RANGES[range_key]:
        query = query.filter(InsightFeedback.created_at >= now - timedelta(days=_COACH_RANGES[range_key]))
    rows = query.all()
    weekly_rows = InsightFeedback.query.filter(
        InsightFeedback.created_at >= datetime.combine(now.date() - timedelta(weeks=12), datetime.min.time())).all()
    wrong = (InsightFeedback.query.filter_by(helpful=False, reason='wrong')
             .order_by(InsightFeedback.created_at.desc(), InsightFeedback.id.desc()).limit(100).all())
    helpful = sum(1 for r in rows if r.helpful)
    weekly = admin_stats.weekly_helpful_rate(weekly_rows, now.date())
    reasons = admin_stats.reason_totals(rows)
    # The dashboard counts "Looks wrong" votes newer than this visit
    state = db.session.get(AdminState, _COACH_LAST_OPENED) or AdminState(key=_COACH_LAST_OPENED)
    state.value = now.isoformat(timespec='seconds')
    state.updated_at = now
    db.session.add(state)
    db.session.commit()
    return render_template(
        'admin/coach.html', active='coach', range_key=range_key,
        total={'votes': len(rows), 'helpful': helpful,
               'rate': round(100 * helpful / len(rows)) if rows else None},
        by_type=admin_stats.votes_by_type(rows),
        reasons=reasons,
        top_reason_label=(admin_stats.REASON_LABELS[max(reasons, key=lambda k: reasons[k])]
                          if any(reasons.values()) else None),
        weekly=weekly,
        weekly_chart=admin_stats.coach_weekly_chart(weekly),
        wrong_total=InsightFeedback.query.filter_by(helpful=False, reason='wrong').count(),
        voted_down=admin_stats.most_voted_down(rows),
        wrong=wrong, usernames=_usernames(r.user_id for r in wrong),
        reason_labels=admin_stats.REASON_LABELS,
        reason_keys=[k for k in admin_stats.REASON_LABELS if k],
    )


@admin_bp.get('/ai')
@_require_admin
def admin_ai():
    """Anthropic calls from ai_call_log: logged from the 2026-10-18 deploy on,
    so nothing before it shows."""
    now = datetime.now()
    since = datetime.combine(now.date() - timedelta(days=29), datetime.min.time())
    month_start = admin_stats.month_start(now)
    rows = AiCallLog.query.filter(AiCallLog.created_at >= min(since, month_start)).all()
    window = [r for r in rows if r.created_at >= since]
    month = [r for r in rows if r.created_at >= month_start]
    failures = (AiCallLog.query.filter_by(ok=False)
                .order_by(AiCallLog.created_at.desc(), AiCallLog.id.desc()).limit(50).all())
    first = db.session.query(db.func.min(AiCallLog.created_at)).scalar()
    by_day = admin_stats.ai_by_day(window, now.date())
    calls_chart, cost_chart = admin_stats.ai_daily_charts(by_day)
    return render_template(
        'admin/ai.html', active='ai',
        window_totals=admin_stats.ai_totals(window),
        month_totals=admin_stats.ai_totals(month),
        month_label=month_start.strftime('%B'),
        by_endpoint=admin_stats.ai_by_endpoint(window),
        by_day=by_day,
        calls_chart=calls_chart, cost_chart=cost_chart,
        endpoints=admin_stats.AI_ENDPOINTS,
        top_users=admin_stats.ai_top_users(month, _usernames(r.user_id for r in month)),
        failures=failures, usernames=_usernames(r.user_id for r in failures),
        first_logged=first,
    )


@admin_bp.get('/exercises')
@_require_admin
def admin_exercises():
    return render_template('admin/exercises.html', active='exercises',
                           equipment_map=exercisedb.OUR_TO_EXERCISEDB_EQUIP)


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
        'image_source_id': ex.image_source_id,
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
    new_url = data.get('image_url') or None
    if new_url == ex.image_url:
        return jsonify({'message': 'ok'})
    before = ex.image_url
    ex.image_url = new_url
    # A pasted URL didn't come from ExerciseDB, so the exercise no longer uses that GIF
    ex.image_source_id = None
    audit('exercise.image.set', 'exercise', ex.id, {'image_url': before}, {'image_url': ex.image_url})
    db.session.commit()
    return jsonify({'message': 'ok'})


# ── ExerciseDB catalog and GIF search ─────────────────────────

def _catalog_status():
    q = exercisedb.quota
    newest = db.session.query(db.func.max(ExerciseDBEntry.fetched_at)).scalar()
    facets = {}
    for field in ('equipment', 'body_part', 'target'):
        col = getattr(ExerciseDBEntry, field)
        facets[field] = [v for (v,) in db.session.query(col).distinct().order_by(col)]
    count = ExerciseDBEntry.query.count()
    # A run that reached the last page logs the row count; anything else means
    # the copy stopped partway and the next fetch should carry on, not restart.
    last_run = (AdminAuditLog.query.filter_by(action='exercisedb.catalog.fetch')
                .order_by(AdminAuditLog.id.desc()).first())
    complete = bool(count and last_run and (last_run.after or {}).get('rows') == count)
    return {
        'count': count,
        'complete': complete,
        'fetched_at': newest.isoformat(timespec='minutes') if newest else None,
        'facets': facets,
        'quota': {'remaining': q['remaining'], 'limit': q['limit'],
                  'at': q['at'].isoformat(timespec='minutes') if q['at'] else None},
        'api_key_set': bool(_api_key()),
    }


@admin_bp.get('/exercises/catalog')
@_require_admin
def exercisedb_catalog_status():
    return jsonify(_catalog_status())


@admin_bp.post('/exercises/catalog/fetch')
@_require_admin
@_admin_write
def exercisedb_catalog_fetch():
    """One step of copying ExerciseDB's catalog: a few pages from `offset`,
    upserted. The page calls again with `next_offset` until `done`, so a run
    that stops partway (quota, a network error) keeps what it got and can
    carry on from there."""
    api_key = _api_key()
    if not api_key:
        return jsonify({'message': 'RAPIDAPI_KEY not configured on server'}), 503
    offset = (request.get_json(silent=True) or {}).get('offset', 0)
    if not isinstance(offset, int) or isinstance(offset, bool) or offset < 0:
        return jsonify({'message': 'offset must be a non-negative integer'}), 400

    now = datetime.now()
    fetched, done, error = 0, False, None
    for _ in range(_PAGES_PER_FETCH_STEP):
        try:
            page = exercisedb.fetch_page(api_key, offset)
        except Exception as exc:
            error = exercisedb.error_message(exc)
            break
        for item in page:
            entry_id = str(item['id'])
            entry = db.session.get(ExerciseDBEntry, entry_id) or ExerciseDBEntry(id=entry_id)
            entry.name = item.get('name') or ''
            entry.equipment = item.get('equipment') or ''
            entry.body_part = item.get('bodyPart') or ''
            entry.target = item.get('target') or ''
            entry.secondary_muscles = item.get('secondaryMuscles') or []
            entry.description = item.get('description')
            entry.fetched_at = now
            db.session.add(entry)
        fetched += len(page)
        offset += len(page)
        if len(page) < exercisedb.PAGE_SIZE:
            done = True
            break
    db.session.flush()
    if done:
        audit('exercisedb.catalog.fetch', 'exercisedb_catalog', None, None,
              {'rows': ExerciseDBEntry.query.count()})
    db.session.commit()
    body = {'fetched': fetched, 'next_offset': offset, 'done': done, **_catalog_status()}
    if error:
        return jsonify({**body, 'message': error}), 502
    return jsonify(body)


def _entry_dict(e):
    return {'id': e.id, 'name': e.name, 'equipment': e.equipment, 'body_part': e.body_part,
            'target': e.target, 'secondary_muscles': e.secondary_muscles or [],
            'description': e.description or ''}


@admin_bp.get('/exercises/catalog/search')
@_require_admin
def exercisedb_catalog_search():
    """Searches our copy of the catalog, so it costs no RapidAPI call.
    ?exercise_id= ranks by that exercise's muscle group and leaves it out of
    the "used by" labels."""
    args = request.args
    try:
        offset = max(int(args.get('offset', 0)), 0)
    except ValueError:
        return jsonify({'message': 'offset must be an integer'}), 400
    ours = None
    if args.get('exercise_id', '').isdigit():
        ours = db.session.get(ExerciseTemplate, int(args['exercise_id']))

    entries = [_entry_dict(e) for e in ExerciseDBEntry.query.all()]
    matches, close, tokens = exercisedb.search(
        entries, args.get('q', ''),
        equipment=args.get('equipment') or None,
        body_part=args.get('body_part') or None,
        target=args.get('target') or None,
        our_muscle_group=ours.muscle_group if ours else None,
    )

    used_by = {}
    for ex in ExerciseTemplate.query.filter(ExerciseTemplate.image_source_id.isnot(None)).all():
        if ours and ex.id == ours.id:
            continue
        label = f'{ex.name} ({ex.equipment})' if ex.equipment else ex.name
        used_by.setdefault(ex.image_source_id, []).append(label)

    def shape(e):
        return {**e, 'name_parts': exercisedb.highlight(e['name'], tokens),
                'used_by': used_by.get(e['id'], []),
                'thumb_url': url_for('admin.exercise_image_proxy', exercisedb_id=e['id'])}

    page = matches[offset:offset + _SEARCH_PAGE]
    end = offset + len(page)
    return jsonify({
        'total': len(matches),
        'results': [shape(e) for e in page],
        'next_offset': end if end < len(matches) else None,
        'close': [shape(e) for e in close[:_SEARCH_PAGE]] if offset == 0 else [],
        'catalog_count': len(entries),
        'current_source_id': ours.image_source_id if ours else None,
    })


@admin_bp.get('/exercises/image-proxy/<exercisedb_id>')
@_require_admin
def exercise_image_proxy(exercisedb_id):
    """A search thumbnail, through the server so the RapidAPI key stays here.
    Stored after the first fetch: each one costs a call of the month's 690,
    and the browser's cache alone forgets them."""
    if not _EXERCISEDB_ID.match(exercisedb_id):
        return Response(status=404)
    cached = db.session.get(ExerciseDBThumbnail, exercisedb_id)
    if not cached:
        api_key = _api_key()
        if not api_key:
            return Response(status=503)
        try:
            content, content_type = exercisedb.fetch_image(api_key, exercisedb_id, _THUMB_RESOLUTION)
        except Exception:
            return Response(status=502)
        cached = ExerciseDBThumbnail(exercisedb_id=exercisedb_id, content=content, content_type=content_type)
        db.session.add(cached)
        db.session.commit()
    return Response(cached.content, mimetype=cached.content_type,
                    headers={'Cache-Control': 'private, max-age=604800'})


@admin_bp.post('/exercises/<int:exercise_id>/apply-suggestion')
@_require_admin
@_admin_write
def apply_exercise_suggestion(exercise_id):
    """Downloads the chosen ExerciseDB GIF server-side and re-hosts it under
    our own /static path: the mobile app's <Image> can't attach the RapidAPI
    key header, so the final image_url has to be a file we store, same as
    avatars."""
    ex = db.session.get(ExerciseTemplate, exercise_id)
    if not ex:
        return jsonify({'message': 'Not found'}), 404

    data = request.get_json(silent=True) or {}
    exercisedb_id = data.get('exercisedb_id')
    if not exercisedb_id:
        return jsonify({'message': 'exercisedb_id required'}), 400
    if not isinstance(exercisedb_id, str) or not _EXERCISEDB_ID.match(exercisedb_id):
        return jsonify({'message': 'exercisedb_id is not an ExerciseDB id'}), 400

    api_key = _api_key()
    if not api_key:
        return jsonify({'message': 'RAPIDAPI_KEY not configured on server'}), 503

    try:
        content, _ = exercisedb.fetch_image(api_key, exercisedb_id, _SAVE_RESOLUTION)
    except Exception as exc:
        return jsonify({'message': f'Could not fetch image: {exercisedb.error_message(exc)}'}), 502

    images_dir = os.path.join(current_app.static_folder, 'exercise_images')
    os.makedirs(images_dir, exist_ok=True)
    filename = f'{exercise_id}.gif'
    with open(os.path.join(images_dir, filename), 'wb') as f:
        f.write(content)

    before = {'image_url': ex.image_url, 'image_source_id': ex.image_source_id}
    ex.image_url = f'/static/exercise_images/{filename}'
    ex.image_source_id = exercisedb_id
    audit('exercise.image.apply_suggestion', 'exercise', ex.id,
          before, {'image_url': ex.image_url, 'image_source_id': exercisedb_id})
    db.session.commit()
    return jsonify({'image_url': ex.image_url, 'image_source_id': exercisedb_id})
