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

This repo is a fork of [pingdotgg/t3code](https://github.com/pingdotgg/t3code).
New features added here may **not** be merged upstream. All work must be
structured so that rebasing onto upstream `main` remains clean and low-conflict
over time.

> **The fork's primary branch is `feature/main/2am-code`** — this is the
> equivalent of `main` for the 2AM-Code fork.

---

## Core Rule: Rebase, Never Merge

**Always** sync with upstream via rebase — never `git merge upstream/main` into a
feature branch. Merge commits make future rebases exponentially harder.

```powershell
git fetch upstream
git rebase upstream/main
```

If the `upstream` remote is not yet set:

```powershell
git remote add upstream https://github.com/pingdotgg/t3code
```

---

## Branch Strategy

```
upstream/main  ──●──●──●──●──●   (their updates)
                  \
2am/feature    ──●──●──●         (our additions only, on top)
```

- Keep the fork's feature commits as a **thin layer on top of upstream/main**.
- Never let upstream changes mix into the fork commits themselves.

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
# Set up upstream (once)
git remote add upstream https://github.com/pingdotgg/t3code

# Sync with upstream
git fetch upstream && git rebase upstream/main

# Clean up your commits before rebasing
git rebase -i HEAD~<N>

# Safe force push
git push origin <branch> --force-with-lease

# Abort a bad rebase
git rebase --abort

# Tag a sync point
git tag "synced-upstream-$(Get-Date -Format 'yyyyMMdd')"
```
