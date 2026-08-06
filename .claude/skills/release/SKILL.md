---
name: release
description: Bump the app version, add a CHANGELOG.md entry, and write a short "what's new" blurb for the next release of this Workout Tracker project.
disable-model-invocation: true
argument-hint: [patch|minor|major]
allowed-tools: Read, Edit, Bash
---

Prepare a new release of the app: bump the version number, document what
changed in CHANGELOG.md, and write a short user-facing blurb.

Bump level: $0 (patch | minor | major — default to patch if omitted; this
project has historically shipped new features under patch bumps too, so
don't infer minor/major just because a release includes a new feature)

### Step 1 — Find the current version and compute the next one
Read the `version` field from `src/workout-tracker-native/package.json`
(the same value is duplicated in `src/workout-tracker-native/app.config.js`
as `expo.version` — keep the two in sync). Increment according to the
bump level.

Do **not** touch `ios.buildNumber` or `android.versionCode` in
`app.config.js` — those are bumped separately, only at actual EAS
build/submission time, not on every release entry.

### Step 2 — Gather what changed since the last release
Run `git log --oneline <last-version-tag-or-commit>..HEAD` (if no tag
exists, use the commit range since the last `## X.Y.Z` entry in
CHANGELOG.md — check its date/context against `git log` to find the
matching commit). Read the full commit messages for that range
(`git log <range> --format='%B'`), not just the one-line summaries.

Filter to **user-facing** changes only. Skip: internal refactors, file
moves/reorganization, test additions, dependency bumps, agent/tooling
config, backend route file splits — anything with no visible effect on
what a user sees or experiences. Do include: new features, redesigns,
bug fixes, and genuine performance improvements a user would notice
(e.g. "the app feels faster" is fair game; "added selectinload to fix
an N+1 query" is not — translate it to the user-visible effect instead).

### Step 3 — Update version numbers
Edit `version` in both `src/workout-tracker-native/package.json` and
`expo.version` in `src/workout-tracker-native/app.config.js` to the new
version string. Keep them identical.

### Step 4 — Write the CHANGELOG.md entry
Insert a new section at the top of `CHANGELOG.md`, directly under the
`# Changelog` heading and above the previous top entry, following the
existing format exactly:

```
## X.Y.Z (YYYY-MM-DD)

### <Category>: <Label>
- <user-facing bullet, plain language, no file/code references>
- ...

### Bug Fixes
- ...
```

Category conventions already used in this file: `New: <Feature>`,
`Improved: <Area>`, `Redesigned: <Area>`, and always a trailing
`Bug Fixes` section if there are any. Use today's local date in
`YYYY-MM-DD` format. Match the tone of existing entries — short,
concrete, written for the end user (e.g. "Fixed X" not "Refactored Y
to prevent X").

### Step 5 — Write a short release blurb
Write a 2–4 sentence "What's New" blurb suitable for pasting into App
Store Connect / Play Console release notes — punchier and shorter than
the CHANGELOG entry, no bullet points, no technical terms. Present it
to the user directly in chat (don't create a file for it unless asked).

### Step 6 — Report, don't commit
Show the user the version bump and the new CHANGELOG entry. Per this
project's git conventions, do not stage or commit these changes
automatically — wait for the user to ask.
