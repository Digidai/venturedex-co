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
