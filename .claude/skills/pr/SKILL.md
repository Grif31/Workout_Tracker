---
name: pr
description: Create a GitHub pull request summarizing current branch changes
disable-model-invocation: true
allowed-tools: Bash, Read
---

Create a pull request for the current branch in this Workout Tracker project.

1. Run `git status` and `git log main..HEAD --oneline` to understand what's been done
2. Run `git diff main...HEAD` to review all changes
3. If there are uncommitted changes, stop and tell the user to commit first
4. Push the current branch to origin if not already pushed
5. Create a PR using `gh pr create` with:
   - A short, descriptive title (under 70 chars)
   - A body with: Summary (bullet points of what changed), Test plan (what to verify)
   - Target branch: main

Return the PR URL when done.
