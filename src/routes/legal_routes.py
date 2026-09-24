import os

from flask import Blueprint, render_template, send_from_directory

legal_bp = Blueprint('legal', __name__)

# Brand assets are served from src/brand/, not src/static/: production mounts a
# persistent volume over /app/static for user uploads (avatars, progress photos),
# which shadows the whole directory, so nothing committed under static/ is reachable.
BRAND_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'brand')


@legal_bp.route('/brand/<path:filename>')
def brand_asset(filename):
    return send_from_directory(BRAND_DIR, filename, max_age=31536000)


# The page bodies live in src/templates/ rather than as string literals here, so
# homepage and legal copy edits review as HTML diffs. privacy.html and terms.html
# pull in their shared CSS with {% include '_legal_style.css' %}.


@legal_bp.route('/')
def homepage():
    return render_template('homepage.html')


@legal_bp.route('/privacy')
def privacy():
    return render_template('privacy.html')


@legal_bp.route('/terms')
def terms():
    return render_template('terms.html')
