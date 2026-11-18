---
name: commit
description: Commit this session's own changes in the shared checkout, staging only its files and hunks
disable-model-invocation: true
allowed-tools: Bash, Read
---

Create a git commit for the changes this session made in Aretē.

Other Claude sessions edit this same checkout on the same branch at the same time. Their uncommitted work sits in the tree next to yours, so never `git add -A`, `git add .`, `git commit -a`, `git stash` or `git checkout -- <file>`.

1. `git status` and `git log --oneline -5`. Note any commit another session made since you started, so you don't redo or revert it.
2. Work out which changed files are yours from this conversation. Untracked files and folders you didn't create (e.g. `src/testvids/`, stray scripts) are someone else's: leave them out.
3. Stage with explicit paths only: `git add -- <path> <path>`.
4. For a file another session also edited, stage just your hunks. `git add -p` is unavailable (no interactive input), so build the blob instead: write HEAD's version plus only your changes to a scratch file, then `git update-index --cacheinfo 100644,$(git hash-object -w <scratch file>),<path>`. Check the result with `git diff --cached -- <path>`.
5. `git diff --cached --stat` and read `git diff --cached`: every line staged should be yours.
6. Write the message: a subject under ~72 chars saying what changed, then a body for the why if it isn't obvious. End with the attribution trailer from the current system reminder, if there is one.
7. Commit with a heredoc message, then `git status` to confirm the commit landed and the other sessions' changes are still in the tree, unstaged.

Never commit `.env` files. Do not push. Do not amend existing commits.
