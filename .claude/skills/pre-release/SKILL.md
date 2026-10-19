---
name: pre-release
description: Run the pre-release audit sweep (security, coverage, performance, cleanup, structure, UI, API contract), merge the findings into one ranked list, and stop before /release
disable-model-invocation: true
argument-hint: [since-ref]
---

Run the pre-release audits for Aretē and hand back one ranked list. Do NOT bump versions, edit CHANGELOG.md, fix findings or start an EAS build: this sweep ends at a go / no-go.

Scope: `$0` if given, otherwise everything since the last release. Find that from the most recent `## X.Y.Z` entry in CHANGELOG.md and its matching commit (`git log`), and list the commits and touched files in range first: the auditors use it to focus.

### Step 1: read-only auditors, in parallel

Launch these agents in the background, all in one message, each with the commit range and touched files as context:

- `security-auditor`
- `test-coverage-auditor`
- `performance-auditor`
- `code-cleanup-auditor`
- `repo-structure-auditor`
- `api-contract-checker`
- `contrast-auditor` and `theme-style-auditor`, only if the range touches `screens/`, `components/`, `theme/` or `context/ThemeContext.tsx`

### Step 2: merge into one list

When they've all reported, dedupe overlapping findings and sort them into:

- **Blocks release**: exploitable security holes, API contract mismatches that break a request, untested auth/payment/data-write paths, invisible UI, crashes.
- **Fix soon**: real but not shipping-critical.
- **Backlog**: cleanup, style drift, nice-to-haves.

Each finding gets `file:line`, a one-line description, and which auditor raised it. Check each Blocks-release item against the code yourself before listing it there: auditors over-report.

### Step 3: offer the follow-ups, don't run them

Ask the user which to do next:

1. Fix the Blocks-release items in this session.
2. Run `test-writer` (with `isolation: "worktree"`) on the riskiest gaps from `test-coverage-auditor`.
3. If nothing blocks: `/release [patch|minor|major]`, then `ops-maintainer` for the EAS production build. Date the CHANGELOG by the build's `gitCommitHash`/`createdAt` from `eas build:list`, since builds can ship from uncommitted trees.
