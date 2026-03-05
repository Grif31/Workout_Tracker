---
name: commit
description: Stage relevant files and create a descriptive git commit based on current changes
disable-model-invocation: true
allowed-tools: Bash, Read
---

Create a git commit for the current changes in this Workout Tracker project.

1. Run `git status` to see what has changed
2. Run `git diff` to understand what was modified
3. Stage all modified and untracked files relevant to the changes (exclude venv, node_modules, __pycache__, .expo, *.db)
4. Write a clear, concise commit message that describes *what* was changed and *why*
5. Commit the staged files
6. Run `git status` to confirm the commit succeeded

Do not push. Do not amend existing commits.
