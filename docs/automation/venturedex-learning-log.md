# VentureDex Learning Log

Append one entry per daily automation run. Do not rewrite old entries.

## Entry Template

### YYYY-MM-DD HH:MM TZ

- candidate_count: 0
- accepted: 0
- rejected: 0
- rejection_bar_met: yes|no
- outcome: no-op|accepted|rejected-only|stopped
- validation: pass|fail
- build_db: pass|fail
- build_app: pass|fail
- screenshot: n/a|pass|fail
- commit_push: n/a|pass|fail
- commit_sha: n/a
- pushed_branch: n/a
- ci_deploy: not_checked|pass|fail|n/a
- failure_tags: [none]
- reward: 0
- dominant_failure_mode: none
- proposed_change: none
- decision: none
- affected_file: n/a
- affected_section: n/a
- evidence:
  - item 1
  - item 2

## Baseline

### 2026-04-16 09:30 Asia/Shanghai

- candidate_count: 0
- accepted: 0
- rejected: 0
- rejection_bar_met: yes
- outcome: no-op
- validation: pass
- build_db: pass
- build_app: pass
- screenshot: n/a
- commit_push: n/a
- commit_sha: n/a
- pushed_branch: n/a
- ci_deploy: n/a
- failure_tags: [none]
- reward: 0
- dominant_failure_mode: none
- proposed_change: establish markdown-driven automation control plane and reward-guided loop
- decision: applied
- affected_file: docs/automation/*
- affected_section: initial baseline
- evidence:
  - automation prompt moved out of the automation config into repo docs
  - immutable guards and adaptive heuristics are now separated
  - learning history has a stable append-only location

### 2026-04-17 21:52 Asia/Shanghai

- candidate_count: 10
- accepted: 0
- rejected: 7
- rejection_bar_met: yes
- outcome: rejected-only
- validation: pass
- build_db: pass
- build_app: pass
- screenshot: n/a
- commit_push: pass
- commit_sha: 0410586
- pushed_branch: main
- ci_deploy: not_checked
- failure_tags: [build_app_fail, screenshot_env]
- reward: 0
- dominant_failure_mode: screenshot_env
- proposed_change: add a preflight screenshot-credential check before spending time on publishable finalists
- decision: deferred
- affected_file: docs/automation/venturedex-daily-runbook.md
- affected_section: Adaptive Heuristics > Operational Heuristics
- evidence:
  - discovered 10 recent funding candidates and recorded 7 explicit rejects for Sycamore, Xoople, Rebellions, SiFive, Slash, Cloaked, and Arc
  - Parasail, Factory, and Lucid Bots were the only shortlist survivors, but CLOUDFLARE_API_TOKEN was missing so a compliant screenshot-backed addition could not be completed
  - npm run build initially failed because astro was unavailable in the worktree; npm ci restored dependencies and the build passed on retry

### 2026-04-19 00:37 CST

- candidate_count: 10
- accepted: 0
- rejected: 8
- rejection_bar_met: yes
- outcome: rejected-only
- validation: pass
- build_db: pass
- build_app: pass
- screenshot: n/a
- commit_push: pass
- commit_sha: 42313e6
- pushed_branch: main
- ci_deploy: not_checked
- failure_tags: [build_app_fail]
- reward: 0
- dominant_failure_mode: build_app_fail
- proposed_change: add a build-dependency preflight heuristic for detached automation worktrees before deep discovery work
- decision: applied
- affected_file: docs/automation/venturedex-daily-runbook.md
- affected_section: Adaptive Heuristics > Operational Heuristics
- evidence:
  - discovered 10 current candidates, skipped Sarvam AI and OpenRouter because the visible reporting still described unclosed financing discussions, and recorded 8 explicit rejects for Swish, Gimlet Labs, Wonderful, Adept, Starcloud, Waymo, Glean, and Anthropic
  - the strongest self-serve failure was Gimlet Labs, whose landing-page sign-up currently points to an app route that resolves to a 404 instead of a usable onboarding flow
  - npm run build failed at first because astro was unavailable in the detached automation worktree; restoring node_modules with npm ci cleared the gate, matching the same build_app_fail pattern seen on 2026-04-17

### 2026-04-19 00:52 CST

- candidate_count: 10
- accepted: 0
- rejected: 7
- rejection_bar_met: yes
- outcome: rejected-only
- validation: pass
- build_db: pass
- build_app: pass
- screenshot: n/a
- commit_push: pass
- commit_sha: 047a7ac
- pushed_branch: main
- ci_deploy: not_checked
- failure_tags: [build_app_fail, screenshot_env]
- reward: 0
- dominant_failure_mode: screenshot_env
- proposed_change: add a screenshot-credential preflight heuristic before promoting finalists into asset and screenshot work
- decision: applied
- affected_file: docs/automation/venturedex-daily-runbook.md
- affected_section: Adaptive Heuristics > Operational Heuristics
- evidence:
  - discovered 10 current candidates: Granola, Parasail, Loop, Arinna, Lucid Bots, Littlebird, Conntour, Zyphra, Sierra, and Safe Superintelligence
  - recorded 7 explicit rejects for Loop, Arinna, Lucid Bots, Littlebird, Conntour, Sierra, and Safe Superintelligence; Granola and Parasail were the only viable self-serve survivors, while Zyphra remained non-publishable because the visible financing report still described its round as in talks
  - npm run build failed at first because astro was unavailable in the detached worktree; restoring dependencies with `npm ci` cleared the local build gate on retry
  - screenshot credentials are still absent because `.env` is missing and `CLOUDFLARE_API_TOKEN` is unset, so compliant screenshot-backed acceptance work could not proceed for surviving finalists
