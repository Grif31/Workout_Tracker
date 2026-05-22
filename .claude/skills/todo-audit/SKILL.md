---
name: todo-audit
description: Audit TODO.md against the actual codebase, correct outdated checkboxes, report pending work, and suggest 5 next improvements
disable-model-invocation: true
argument-hint: [quick]
allowed-tools: Read, Write, Edit, Glob, Grep
---

Audit `TODO.md` against the actual codebase, correct any outdated checkboxes, report what's still pending, and suggest 5 concrete next improvements.

If the argument is `quick` ($0 == "quick"), skip the codebase verification — just read TODO.md, list every unchecked `[ ]` item grouped by section, then jump straight to suggestions. Do NOT update the file in quick mode.

---

## Full Audit Mode (default)

### Step 1 — Read the TODO list
Read `TODO.md` from the project root. Parse every section, every item, and its checkbox state (`[ ]` incomplete, `[x]` complete).

### Step 2 — Verify each item against the codebase
For every item — checked OR unchecked — search for implementation evidence using Grep and Glob.

| Feature type | Search location | What to look for |
|---|---|---|
| Backend route | `src/routes/`, `src/app.py` | `@bp.route`, `@bp.get`, `@bp.post`, relevant function names |
| Frontend screen | `src/workout-tracker-native/screens/` | Screen file exists, component renders key UI element |
| Frontend component | `src/workout-tracker-native/components/` | Component file, relevant prop or JSX |
| Context / settings | `src/workout-tracker-native/context/` | State variables, AsyncStorage keys |
| Database model | `src/models.py` | Column name, model class |

Rules:
- Toggle `[ ]` → `[x]` **only** when clear implementation evidence exists in the code
- Toggle `[x]` → `[ ]` **only** when the feature is demonstrably absent from the code
- If uncertain, leave the checkbox as-is and note it in the report
- **Never change item text** — only the `[ ]` / `[x]` state

### Step 2b — Scan for codebase optimizations
While reading files during Step 2, note any of the following code-quality issues you encounter:

| Category | What to look for |
|---|---|
| Performance | Unnecessary re-renders (`useEffect` with missing/wrong deps), N+1 queries in routes, missing `useMemo`/`useCallback` on expensive computations, large lists without `keyExtractor` or `getItemLayout` |
| Code duplication | Repeated fetch logic, duplicated style objects, identical validation blocks across files |
| Error handling gaps | API calls without try/catch, unhandled promise rejections, missing loading/error states in screens |
| Type safety | `any` types, missing prop types, untyped API responses |
| Security | Secrets or tokens logged to console, user input passed unsanitised to queries |
| Dead code | Unused imports, commented-out blocks, unreachable branches |

Collect these as you go — you will report them in Step 4.

### Step 3 — Update TODO.md
Write the corrected `TODO.md` back to disk with only checkbox state changes applied.

### Step 4 — Print the audit report

```
## Audit Results

### ✅ Verified Complete
(Major sections/features confirmed done — one line each)

### 🔄 Status Changed
(Items whose checkbox was toggled + one-line reason. If none: "No changes — all checkboxes already accurate.")

### ⏳ Still Pending
(Every remaining `[ ]` item, grouped by section header from TODO.md)

### 🔧 Codebase Optimizations
(Issues found during Step 2b — see format below)

### 💡 Suggested Feature Improvements
(5 concrete suggestions — see format below)
```

### Step 5 — Optimization report format
List every issue found in Step 2b, grouped by category. For each:
- State the problem in one sentence
- Reference the exact file and line number where it occurs
- Suggest the fix in one sentence

```
**Performance**
- `WorkoutLog.tsx:142` — `styleSheet` object recreated on every render; move outside component.

**Error handling gaps**
- `workout_routes.py:88` — missing try/catch around DB commit; an integrity error will return a 500 with a raw traceback.
```

If none found in a category, omit that category.

### Step 6 — Feature suggestions format
Pick 5 feature improvements prioritised by user impact × implementation effort. Before including any suggestion, run a targeted Grep to confirm the feature does not already exist. Each must:
- Name the exact feature in one sentence
- State the user benefit in one sentence
- List the specific file(s) it would touch

Format each as:
```
1. **Feature name**
   Why: user benefit
   Files: `path/to/file.tsx`
```

Only suggest things NOT already tracked in TODO.md as pending and NOT already present in the codebase.
