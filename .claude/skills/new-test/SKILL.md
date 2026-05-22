---
name: new-test
description: Write and run tests for a backend route file, frontend component/screen, both together, or the entire codebase at once. Sets up Jest if not yet configured for frontend.
disable-model-invocation: true
argument-hint: [backend|frontend|fullstack|all] [target]
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
---

Write tests for a target file in this Workout Tracker project, run the full test suite to confirm no regressions, then run the new tests to confirm they pass.

Layer: $0   (backend | frontend | fullstack | all)
Target: $1  (for backend: route file name without extension e.g. `bodyweight_routes` — for frontend: component/screen name e.g. `WorkoutLog` — for fullstack: a feature name e.g. `bodyweight` — for all: omit, no target needed)

---

## Backend ($0 == "backend")

### Step 1 — Understand the target route
Read `src/routes/$1.py`. List every route (`@bp.route`) and its HTTP method, required auth, request body fields, and expected response shape.

### Step 2 — Read the test harness
Read `src/tests/conftest.py` to understand the available fixtures: `client`, `registered_user`, `auth_token`, `auth_token2`, `clean_db`.

### Step 3 — Read a reference test
Read `src/tests/test_workout_routes.py` as a style reference (payload constants, helper functions, class-per-endpoint structure).

### Step 4 — Run existing tests (baseline)
```
cd src && python -m pytest tests/ -q --tb=short
```
Report the baseline pass/fail count. If any tests are already failing, note them but continue.

### Step 5 — Write the new test file
Create `src/tests/test_$1.py` covering:

For **every route** in the file:
- Happy path (correct input → expected status + response shape)
- Auth guard (no token → 401, other user's resource → 403 or 404)
- Validation errors (missing required fields → 400)
- Edge cases specific to the route (empty list, not found, duplicate, etc.)

Follow these conventions exactly:
- Module-level docstring listing all routes under test
- `PAYLOAD` constants at the top for reusable request bodies
- Helper functions (e.g. `create_x(client, token)`) to reduce repetition
- One `class Test<Verb><Resource>` per logical endpoint group
- Assert both status code and key response fields in every test
- Use `auth_headers(token)` helper for Authorization headers
- Use `registered_user` / `auth_token` fixtures from conftest — do NOT re-register users inside tests

### Step 6 — Run the new tests
```
cd src && python -m pytest tests/test_$1.py -v
```
If any tests fail, read the error, fix the test (not the application code), and re-run until all pass.

### Step 7 — Report
```
## Test Results

### Baseline
<pass/fail count before adding new tests>

### New tests: test_$1.py
<list of test names and PASSED/FAILED status>

### Coverage added
<bullet list of routes now covered>
```

---

## Frontend ($0 == "frontend")

### Step 1 — Check Jest setup
Read `src/workout-tracker-native/package.json`. Check if `jest` and `jest-expo` are in devDependencies and if a `"test"` script exists.

**If Jest is NOT configured:**

1. Install dependencies:
   ```
   cd src/workout-tracker-native && npm install --save-dev jest jest-expo @testing-library/react-native @testing-library/jest-native
   ```
2. Add to `package.json`:
   - `"test": "jest"` in scripts
   - Jest config block:
     ```json
     "jest": {
       "preset": "jest-expo",
       "setupFilesAfterFramework": ["@testing-library/jest-native/extend-expect"],
       "transformIgnorePatterns": [
         "node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg)"
       ]
     }
     ```
3. Create `src/workout-tracker-native/__tests__/` directory.

### Step 2 — Locate the target file
Search for `$1` in `src/workout-tracker-native/components/` and `src/workout-tracker-native/screens/`. Read the file to understand its props, state, and rendered UI.

### Step 3 — Read context dependencies
If the component uses `AuthContext`, `ThemeContext`, or `WorkoutSessionContext`, read those context files so you can mock them correctly.

### Step 4 — Run existing frontend tests (baseline)
```
cd src/workout-tracker-native && npx jest --passWithNoTests -q
```
Report result. If Jest was just installed and no tests exist yet, baseline is 0 tests.

### Step 5 — Write the new test file
Create `src/workout-tracker-native/__tests__/$1.test.tsx` covering:

- **Renders without crashing** — basic smoke test
- **Displays key UI elements** — assert text, labels, or placeholders visible in normal state
- **User interactions** — fire events (button press, input change) and assert outcome
- **Loading / empty states** — if the component has a loading spinner or empty-list message
- **Error states** — if the component shows error UI

Follow these conventions:
- Mock navigation with `jest.fn()` for `navigation` and `route` props
- Wrap renders in context providers (AuthContext, ThemeContext) with sensible test values
- Use `@testing-library/react-native` queries: `getByText`, `getByTestId`, `getByPlaceholderText`
- Mock `fetch` globally to return controlled API responses
- Keep each test focused on one behaviour

### Step 6 — Run the new tests
```
cd src/workout-tracker-native && npx jest __tests__/$1.test.tsx --verbose
```
Fix any failures before reporting.

### Step 7 — Report
```
## Test Results

### Baseline
<pass count before new tests>

### New tests: __tests__/$1.test.tsx
<list of test names and PASSED/FAILED>

### Coverage added
<bullet list of behaviours now tested>
```

---

## Fullstack ($0 == "fullstack")

Fullstack mode covers both the Flask API and the React Native UI for a single feature end-to-end. Run all backend steps first, then all frontend steps, then print a combined report.

### Step 1 — Resolve file names from the feature name
Use Grep and Glob to locate:
- **Backend:** find `src/routes/*$1*.py` — use that filename as the backend target
- **Frontend:** find the component or screen most closely tied to the feature in `src/workout-tracker-native/components/` and `src/workout-tracker-native/screens/` — search for `$1` case-insensitively

If multiple files match, pick the most central one and note the choice in the report.

### Step 2 — Run baseline for both layers
Run both baselines in sequence:
```
cd src && python -m pytest tests/ -q --tb=short
cd src/workout-tracker-native && npx jest --passWithNoTests -q
```
Record each pass/fail count separately.

### Step 3 — Backend tests
Follow Backend Steps 1–6 exactly, using the resolved backend filename.

### Step 4 — Frontend tests
Follow Frontend Steps 1–6 exactly, using the resolved frontend filename.  
(Check Jest setup as normal — install if missing.)

### Step 5 — Contract check
After writing both test files, review them together and verify:
- The request payload shape used in the backend test matches what the frontend component sends to the API
- The response fields asserted in the backend test are the same fields the frontend component reads from the API response
- If any mismatch is found, note it clearly in the report as a **Contract Warning** — do not silently fix it

### Step 6 — Combined report
```
## Fullstack Test Results — $1

### Baselines
Backend:  <pass/fail before>
Frontend: <pass/fail before>

### Backend — test_<resolved_name>.py
<test names and PASSED/FAILED>

### Frontend — __tests__/<resolved_name>.test.tsx
<test names and PASSED/FAILED>

### Coverage added
Backend:  <routes covered>
Frontend: <behaviours covered>

### Contract Check
<PASSED — payloads and response fields match>
 OR
<WARNING — list mismatches found>
```

---

## All ($0 == "all")

Scan the entire codebase, identify every file that lacks test coverage, write tests for each one, and run the complete suite. This is a long-running operation — work through files one at a time and report progress after each batch.

### Step 1 — Inventory untested backend routes
Glob `src/routes/*.py` to list all route files. For each, check whether a matching `src/tests/test_<name>.py` already exists.
Build two lists:
- **Already covered** — route files with an existing test file
- **Needs tests** — route files with no test file

Skip `__init__.py` and any file with no `@bp.route` decorators.

### Step 2 — Inventory untested frontend files
Glob `src/workout-tracker-native/screens/**/*.tsx` and `src/workout-tracker-native/components/*.tsx`.
For each file, check whether a matching `src/workout-tracker-native/__tests__/<Name>.test.tsx` exists.
Build two lists:
- **Already covered** — files with an existing test
- **Needs tests** — files with no test

Skip navigation files, `types.ts`, context files, and any file that only exports a type or constant (no JSX).

### Step 3 — Print the coverage gap before writing anything
```
## Coverage Gap

### Backend — untested route files
<list>

### Frontend — untested screens/components
<list>

### Already covered (skipping)
Backend:  <list>
Frontend: <list>
```

### Step 4 — Run baseline for both layers
```
cd src && python -m pytest tests/ -q --tb=short
cd src/workout-tracker-native && npx jest --passWithNoTests -q
```
Record baseline counts. Check Jest setup first (Frontend Step 1) and install if missing.

### Step 5 — Write backend tests (batch)
For each untested route file (from Step 1), apply Backend Steps 1 and 5 in sequence:
- Read the route file
- Write `src/tests/test_<name>.py` following all backend conventions

After writing **all** backend test files, run the full backend suite once:
```
cd src && python -m pytest tests/ -v --tb=short
```
For any file with failures, read the error, fix the test, and re-run that file only until it passes.

### Step 6 — Write frontend tests (batch)
For each untested screen/component (from Step 2), apply Frontend Steps 2, 3, and 5 in sequence:
- Locate and read the file
- Read any context dependencies
- Write `src/workout-tracker-native/__tests__/<Name>.test.tsx` following all frontend conventions

After writing **all** frontend test files, run the full frontend suite once:
```
cd src/workout-tracker-native && npx jest --verbose
```
Fix any failures file-by-file before reporting.

### Step 7 — Final report
```
## Full Codebase Test Results

### Baseline
Backend:  <X passed, Y failed>
Frontend: <X passed>

### Backend — new test files written
<filename> — <N tests> — PASSED / <N failed>
...

### Frontend — new test files written
<filename> — <N tests> — PASSED / <N failed>
...

### Final suite totals
Backend:  <total passed / total failed>
Frontend: <total passed / total failed>

### Skipped (already had tests)
<list of files skipped>
```
