---
name: check-routes
description: Verify all Flask blueprint route files exist and are registered in app.py
disable-model-invocation: true
allowed-tools: Read, Glob
---

Audit the Flask routes in this Workout Tracker project.

1. Read `src/app.py` and collect every blueprint that is imported and registered
2. List all files in `src/routes/` using Glob
3. For each route file found, check:
   - Is it imported in `app.py`?
   - Is its blueprint registered with `app.register_blueprint`?
4. For each registered blueprint, check:
   - Does the route file actually exist?
5. Report:
   - Any route files that exist but are NOT registered in app.py
   - Any blueprints registered in app.py whose route file is missing
   - A clean list of all correctly registered routes
