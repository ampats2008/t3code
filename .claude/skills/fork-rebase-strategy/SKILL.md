---
name: fork-rebase-strategy
description: >
  Guides agents working on the 2AM-Code fork of T3Code on how to safely add new
  features and stay in sync with upstream (pingdotgg/t3code) main branch using a
  clean rebase workflow. Use this whenever building a new feature, syncing with
  upstream, or resolving conflicts on the fork.
allowed-tools: Bash, Read, Edit, Write, Glob, Grep
---

# 2AM-Code Fork: Rebase Strategy for New Features

This repo is a **real GitHub fork** of [pingdotgg/t3code](https://github.com/pingdotgg/t3code),
hosted at [ampats2008/t3code](https://github.com/ampats2008/t3code).
New features added here may **not** be merged upstream. All work must be
structured so that rebasing onto upstream `main` remains clean and low-conflict
over time.

> **The fork's primary branch is `feature/main/2am-code`** — this is the
> equivalent of `main` for the 2AM-Code fork.

## Remotes

| Remote | URL | Purpose |
|--------|-----|---------|
| `origin` | `https://github.com/ampats2008/t3code.git` | Your fork — push/pull freely, shared across devices |
| `upstream` | `https://github.com/pingdotgg/t3code.git` | Original repo — fetch only, for syncing |

Both remotes are already configured. To verify:

```powershell
git remote -v
```

---

## Core Rule: Rebase, Never Merge

**Always** sync with upstream via rebase — never `git merge upstream/main` into a
feature branch. Merge commits make future rebases exponentially harder.

```powershell
git fetch upstream
git rebase upstream/main
```

If the `upstream` remote is ever missing:

```powershell
git remote add upstream https://github.com/pingdotgg/t3code.git
```

---

## Branch Strategy

```
upstream/main       ──●──●──●──●──●        (pingdotgg updates)
                          \
feature/main/2am-code ─────●──●──●         (our additions only, on top)
                                 \
feat/2am-<name>    ───────────────●──●      (individual feature branches)

feat/upstream-pr   ──────────────────●──●  (PR branches targeting upstream, no 2AM commits)
```

- Keep the fork's feature commits as a **thin layer on top of upstream/main**.
- Never let upstream changes mix into the fork commits themselves.
- `feature/main/2am-code` is the **only long-lived branch** on `origin` — feature branches are merged in and deleted.

---

## Commit Message Convention

All 2AM-Code commits **must** follow this format — enforced by a pre-tool-use hook:

```
2AM: <type>(<slug>): <message>
```

| Part | Rules |
|------|-------|
| `2AM:` | Literal prefix — marks the commit as belonging to this fork |
| `<type>` | One of: `feat`, `fix`, `chore`, `refactor`, `docs`, `test`, `style` |
| `<slug>` | Short kebab-case identifier for the **feature/area** (e.g. `context-meter`, `diff-panel`) — use the **same slug for all commits belonging to the same feature** so they group together in the log |
| `<message>` | Imperative, lowercase, no trailing period |

### Examples

```
2AM: feat(context-meter): add token usage progress bar
2AM: feat(context-meter): wire up live token count from provider
2AM: fix(context-meter): clamp value to 0-100 range
2AM: chore(fork-tooling): add rebase strategy skill
2AM: refactor(diff-panel): extract file tree into separate component
```

Scanning all commits for a feature:
```powershell
git log --oneline --grep="2AM: .*(<slug>)"
# e.g.
git log --oneline --grep="2AM: .*(context-meter)"
```

### Commit Hygiene Rules

1. **Atomic commits** — each commit does exactly one logical thing.
2. **No "WIP" or catch-all commits** — squash those before rebasing.
3. **Use the same `<slug>` across all commits for a feature** — this is how you
   trace a feature's full history in the log.
4. **Touch upstream files as little as possible.** If a feature can live in a new
   file rather than modifying an existing one, prefer the new file.

### Fork-Safe Coding Pattern

When adding features that touch existing upstream files (e.g., large components
like `ChatView.tsx`, `DiffPanel.tsx`), follow this pattern to minimize merge
conflict surface:

1. **All logic in new files** — stores, hooks, helpers, and components that
   don't exist upstream. Namespace them clearly (e.g., `diffReview*`,
   `contextMeter*`).
2. **Custom hooks encapsulate everything** — create a hook like
   `useMyFeature()` that returns all the state, callbacks, and derived values
   the upstream file needs.
3. **Upstream files get only thin injection points** — a single import, one hook
   call, and minimal JSX insertions (single-line conditionals added to existing
   cascades).
4. **Prop spreading over inline logic** — prefer `{...myHook.getProps()}` over
   adding 20 lines of inline logic to an upstream component.
5. **New component directory per feature** — e.g., `components/diff-review/`
   keeps feature files grouped and clearly fork-only.

**Why this matters:** Each insertion point in an upstream file is a potential
merge conflict during `git rebase upstream/main`. By keeping insertions to
single-line conditionals in existing cascades, conflicts are trivial to resolve
— even if upstream restructures the file.

---

## Workflow: Adding a New Feature

### 1. Start from a fresh sync point

```powershell
git fetch upstream
git checkout feature/main/2am-code
git rebase upstream/main
git checkout -b feat/2am-<feature-name>
```

### 2. Build the feature in small, atomic commits

```powershell
git add <specific files>
git commit -m "2AM: feat(<feature-slug>): add <what it does>"
```

### 3. Before opening a PR (or periodically during work): clean your commits

```powershell
git rebase -i upstream/main   # squash fixups, reorder, rename
```

---

## Workflow: Syncing When Upstream Pushes Updates

```powershell
# 1. Fetch latest upstream
git fetch upstream

# 2. Optional: clean up your own commits first
git rebase -i HEAD~<N>

# 3. Rebase onto their new main
git rebase upstream/main

# 4. Resolve any conflicts (see below), then:
pnpm install   # in case package.json / lockfile changed
pnpm build     # verify nothing broke

# 5. Push your updated branch
git push origin <branch> --force-with-lease
```

> Use `--force-with-lease` instead of `--force`. It refuses to overwrite if
> someone else has pushed to your branch since your last fetch.

---

## Resolving Conflicts

**Common conflict hotspots and how to handle them:**

| File | Strategy |
|------|----------|
| `package.json` | Keep **both** sets of changes, then run `pnpm install` |
| `pnpm-lock.yaml` | Accept upstream's version, re-run `pnpm install` to regenerate |
| `tsconfig.json` / config files | Merge manually; preserve both upstream changes and ours |
| Files the feature touches | Resolve line-by-line; keep upstream's refactors + our feature logic |

After resolving each file:

```powershell
git add <resolved-file>
git rebase --continue
```

To bail out entirely and start over:

```powershell
git rebase --abort
```

---

## Workflow: Syncing Between Your Own Devices

Since `origin` is now a real GitHub fork, keeping devices in sync is straightforward:

```powershell
# Push from current machine
git push origin feature/main/2am-code

# Pull on another machine
git pull origin feature/main/2am-code
```

> After a rebase + force push, use `--force-with-lease` on push and
> `git pull --rebase origin feature/main/2am-code` on the other machine to avoid
> creating merge commits.

---

## Opening PRs to Upstream (pingdotgg/t3code)

Branch off `upstream/main` (not the fork's primary branch) so no 2AM-Code commits are included:

```powershell
git fetch upstream
git checkout -b feat/my-upstream-feature upstream/main
# ... do work with normal commit messages (no 2AM: prefix) ...
git push origin feat/my-upstream-feature
# Open PR: ampats2008/t3code → pingdotgg/t3code on GitHub
```

Once the PR merges, those commits will disappear cleanly on the next `rebase upstream/main`.

---

## Tagging Sync Points

After each successful rebase, tag the sync point for easy recovery:

```powershell
$date = Get-Date -Format "yyyyMMdd"
git tag "synced-upstream-$date"
```

---

## What NOT To Do

- ❌ `git merge upstream/main` into a feature branch
- ❌ Giant "everything" commits
- ❌ Amending commits that have already been pushed (use a new commit instead)
- ❌ `git push --force` (use `--force-with-lease`)
- ❌ Modifying upstream files unnecessarily — if a feature can be additive (new
  files), keep it additive

---

## Quick Reference

```powershell
# Remotes (already configured — for reference)
# origin   = https://github.com/ampats2008/t3code.git  (your fork)
# upstream = https://github.com/pingdotgg/t3code.git   (pingdotgg original)

# Sync with upstream
git fetch upstream && git rebase upstream/main

# Push to your fork (share between devices)
git push origin feature/main/2am-code --force-with-lease

# Pull on another device (after a rebase+force push)
git pull --rebase origin feature/main/2am-code

# Clean up your commits before rebasing
git rebase -i HEAD~<N>

# Abort a bad rebase
git rebase --abort

# Tag a sync point
git tag "synced-upstream-$(Get-Date -Format 'yyyyMMdd')"

# Open a PR to upstream — branch from upstream/main, not the fork
git checkout -b feat/my-feature upstream/main
git push origin feat/my-feature
```
