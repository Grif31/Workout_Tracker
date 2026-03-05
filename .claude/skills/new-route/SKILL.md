---
name: new-route
description: Scaffold a new Flask API blueprint route file and register it in app.py
disable-model-invocation: true
argument-hint: [route-name]
allowed-tools: Read, Write, Edit, Glob
---

Scaffold a new Flask route for "$ARGUMENTS" in this Workout Tracker project.

1. Read `src/app.py` and `src/models.py` to understand the existing patterns
2. Read an existing route file (e.g. `src/routes/workout_routes.py`) as a reference
3. Create `src/routes/$ARGUMENTS_routes.py` with:
   - A Blueprint named `$ARGUMENTS_bp`
   - Standard imports: Blueprint, request, jsonify, db, jwt_required, get_jwt_identity
   - CRUD endpoints: GET all, GET one, POST, PUT, DELETE — all under `/api/$ARGUMENTS`
   - JWT protection on all routes except GET
   - Proper error handling and HTTP status codes
4. Register the new blueprint in `src/app.py` (import + app.register_blueprint)

Follow the exact same patterns used in the existing route files.
