---
name: pr
description: Open a GitHub pull request to main for this session's commits, from a clean worktree off origin/main
disable-model-invocation: true
allowed-tools: Bash, Read
---

Open a pull request to `main` for the work this session committed in Aretē.

The main checkout is shared with other Claude sessions, which leave uncommitted work in it and commit to the same branch. So the PR is built in a separate worktree, never by switching branches in the main checkout. Uncommitted changes in the main tree are normal and don't block this.

1. `git fetch origin` then `git log --oneline origin/main..HEAD`. Pick out the commits that belong to this session's work. If the branch also has other sessions' commits that aren't ready, leave them out and say so.
2. If any of this session's own changes are still uncommitted, stop and run `/commit` first.
3. Create a worktree for a new branch off `origin/main` in the scratchpad directory: `git worktree add -b <branch> <scratch>/pr-wt origin/main`. If the branch already contains exactly the right commits, push it as-is and skip the worktree.
4. In the worktree, `git cherry-pick <sha>...` in order. Resolve conflicts by keeping `main`'s version of anything outside this work.
5. Run the backend tests there: copy `src/.env` in first, then `./venv/Scripts/python.exe -m pytest tests/ -q --tb=short` from the main checkout's venv, run against the worktree's `src/`. Run jest and tsc in the main checkout instead: never junction or symlink `node_modules` into the worktree (`git worktree remove` deletes through the link). Report failures, don't hide them.
6. `git push -u origin <branch>` and `gh pr create --base main` with:
   - a title under 70 characters
   - a body with **Summary** (bullet points of what changed and why) and **Test plan** (what was run, what to check on a device), ending with the PR attribution line from the current system reminder, if there is one
7. Delete the copied `.env`, then `git worktree remove <scratch>/pr-wt`.

Return the PR URL.
