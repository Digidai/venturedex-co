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

### 2026-04-19 13:52 CST

- candidate_count: 10
- accepted: 0
- rejected: 10
- rejection_bar_met: yes
- outcome: rejected-only
- validation: pass
- build_db: pass
- build_app: pass
- screenshot: n/a
- commit_push: pass
- commit_sha: 78dd26b
- pushed_branch: main
- ci_deploy: not_checked
- failure_tags: [none]
- reward: 2
- dominant_failure_mode: none
- proposed_change: none
- decision: none
- affected_file: n/a
- affected_section: n/a
- evidence:
  - discovered 10 fresh candidates from recent TechCrunch funding coverage and roundup reporting: Positron, Skyryse, Bedrock Robotics, Fundamental, Goodfire, Simile, humans&, Outtake, Decagon, and OpenEvidence
  - recorded 8 F1 rejects where the public site stayed behind contact, demo, reserve, or early-access gates, and 2 F3 rejects where TechCrunch's current financing reference was already Series D
  - restored local build dependencies with `npm ci` during preflight, then passed `./scripts/validate.sh`, `./scripts/build-db.sh`, and `npm run build` before pushing `78dd26b` to `main`

### 2026-04-19 14:35 CST

- candidate_count: 10
- accepted: 0
- rejected: 9
- rejection_bar_met: yes
- outcome: rejected-only
- validation: pass
- build_db: pass
- build_app: pass
- screenshot: n/a
- commit_push: pass
- commit_sha: 5bc6580
- pushed_branch: main
- ci_deploy: not_checked
- failure_tags: [build_app_fail, screenshot_env]
- reward: 0
- dominant_failure_mode: screenshot_env
- proposed_change: none
- decision: none
- affected_file: n/a
- affected_section: n/a
- evidence:
  - reviewed 10 current funding candidates from recent TechCrunch coverage: Parasail, Hermeus, Nomadic, Glimpse, Doss, Sandbar, Armadin, Eridu, Zeno, and Nominal
  - recorded 9 explicit F1 rejects for Armadin, Glimpse, Nomadic, Doss, Sandbar, Hermeus, Eridu, Zeno, and Nominal because the public site stopped at demo, contact, preorder, reserve, or program pages instead of a trialable product flow
  - Parasail was the only viable self-serve survivor, but `.env` was missing and `CLOUDFLARE_API_TOKEN` was unset, so the run stopped at rejected-only before brand-asset and screenshot work
  - `npm run build` initially failed because `astro` was unavailable in the detached worktree; `npm ci` restored dependencies and all three local gates passed before pushing `5bc6580` to `main`

### 2026-04-20 13:53 Asia/Shanghai

- candidate_count: 14
- accepted: 0
- rejected: 3
- rejection_bar_met: yes
- outcome: rejected-only
- validation: pass
- build_db: pass
- build_app: pass
- screenshot: n/a
- commit_push: pass
- commit_sha: b6244a4
- pushed_branch: main
- ci_deploy: pass
- failure_tags: [build_app_fail, screenshot_env]
- reward: 0
- dominant_failure_mode: screenshot_env
- proposed_change: none
- decision: none
- affected_file: n/a
- affected_section: n/a
- evidence:
  - discovered 14 recent funding candidates from TechCrunch archive windows on March 23, March 26, March 30, and April 7, then deduplicated away nine names already present in `content/rejected.jsonl`
  - recorded three fresh rejects for Zipline, Shield AI, and Giggles because the current financing was outside the Seed-Series C window or the product fell into VentureDex's excluded crypto and gambling-adjacent categories
  - Qodo and ScaleOps were the two viable self-serve survivors, with live product entry points at `app.qodo.ai` and `try.scaleops.com`, but `.env` and `CLOUDFLARE_API_TOKEN` were absent so the run stopped before brand-asset and screenshot work
  - `npm run build` initially failed because `astro` was unavailable in this detached worktree; `npm ci` restored dependencies, all three local gates passed, commit `b6244a4` was pushed to `main`, and GitHub Actions deploy run `24650709214` completed successfully

### 2026-04-20 16:51 CST

- candidate_count: 12
- accepted: 0
- rejected: 3
- rejection_bar_met: yes
- outcome: rejected-only
- validation: pass
- build_db: pass
- build_app: pass
- screenshot: n/a
- commit_push: n/a
- commit_sha: n/a
- pushed_branch: n/a
- ci_deploy: not_checked
- failure_tags: [policy_conflict]
- reward: 2
- dominant_failure_mode: policy_conflict
- proposed_change: prefer candidates whose lead investor already resolves in `content/investors.json` before deep evaluation
- decision: applied
- affected_file: docs/automation/venturedex-daily-runbook.md
- affected_section: Adaptive Heuristics > Candidate Ranking
- evidence:
  - discovered 12 recent funding candidates from TechCrunch coverage between March 24 and April 16, then deduplicated away names already present in `content/rejected.jsonl`
  - recorded three fresh rejects for Deccan AI, Mirage, and Glydways because their current public product state or financing type failed VentureDex's F1/F3 gates
  - Qodo, Granola, ScaleOps, and VITL survived initial product review, but each current lead investor falls outside the existing `content/investors.json` directory that the daily automation is not allowed to edit
  - bootstrap succeeded, restored repo-local `.env`, and local gates passed, so the only blocker to a compliant addition was investor-directory scope rather than environment readiness

### 2026-04-20 16:59 CST

- candidate_count: 0
- accepted: 0
- rejected: 0
- rejection_bar_met: yes
- outcome: stopped
- validation: pass
- build_db: pass
- build_app: pass
- screenshot: n/a
- commit_push: n/a
- commit_sha: n/a
- pushed_branch: n/a
- ci_deploy: n/a
- failure_tags: [policy_conflict]
- reward: 0
- dominant_failure_mode: policy_conflict
- proposed_change: correct the daily runbook so investor-directory updates are allowed content changes, and remove the heuristic that deprioritized startups with new lead investors
- decision: applied
- affected_file: docs/automation/venturedex-daily-runbook.md
- affected_section: File Scope; Staging and Release Scope; Daily Execution; Adaptive Heuristics > Candidate Ranking
- evidence:
  - `scripts/validate.py` blocks any published startup whose lead investor is missing from `content/investors.json`
  - `scripts/manage.sh` already treats investor directory creation as part of the normal startup-add flow and updates `content/investors.json` plus investor brand assets together
  - the previous daily runbook allowlist omitted `content/investors.json`, so the automation policy was narrower than the repo's actual publish workflow
  - the previous heuristic incorrectly treated missing investor directory entries as a ranking signal instead of a content task to complete during publication

### 2026-04-20 17:28 CST

- candidate_count: 0
- accepted: 0
- rejected: 0
- rejection_bar_met: yes
- outcome: stopped
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
- proposed_change: add explicit investor cross-validation rules so new investor entries are created only when source article naming, official website branding, and directory resolution agree
- decision: applied
- affected_file: docs/automation/venturedex-daily-runbook.md; docs/automation/venturedex-feedback-loop.md
- affected_section: Content Safety; Daily Execution; Five Review Passes; Adaptive Heuristics > Candidate Ranking; Failure Tag Vocabulary
- evidence:
  - `scripts/validate.py` requires lead investors to resolve through `content/investors.json` and rejects missing or mismatched investor brand assets
  - `scripts/manage.sh` already reuses or creates investor entries during startup publication, but the runbook did not yet spell out how to cross-check a reused versus newly minted investor slug
  - `content/brand-assets.json` shows that investor assets sometimes come from direct icons and sometimes from official inline assets, so the policy needs an explicit "stop on ambiguity, proceed on verified official branding" rule

### 2026-04-20 17:58 CST

- candidate_count: 10
- accepted: 1
- rejected: 4
- rejection_bar_met: yes
- outcome: accepted
- validation: pass
- build_db: pass
- build_app: pass
- screenshot: pass
- commit_push: pass
- commit_sha: 873adc5
- pushed_branch: main
- ci_deploy: fail
- failure_tags: [ci_fail]
- reward: 0
- dominant_failure_mode: ci_fail
- proposed_change: none
- decision: none
- affected_file: n/a
- affected_section: n/a
- evidence:
  - discovered 10 recent funding candidates from TechCrunch coverage and survivor review: Qodo, ScaleOps, Factory, InsightFinder, Gizmo, Gitar, Antioch, Pillar, Slate Auto, and Parasail
  - accepted Qodo after verifying its $70M Series B led by Qumra Capital from TechCrunch, cross-validating the investor against `content/investors.json` plus `https://qumracapital.com`, and capturing official Qodo and Qumra logo assets
  - recorded four fresh rejects for Pillar, Slate Auto, Factory, and InsightFinder, meeting the 3:1 rejection bar for one accepted startup
  - local gates passed: `./scripts/validate.sh`, `./scripts/build-db.sh`, and `npm run build`; screenshot generation succeeded locally after one transient 422 before succeeding on retry
  - pushed content commit `873adc5` to `main`; GitHub Actions deploy run `24660169059` imported D1 data and deployed Worker version `3477d8ce-9512-4a14-82cc-f8f3075fe982`, but the workflow failed at smoke check because `rg` was unavailable on the runner

### 2026-04-20 18:36 CST

- candidate_count: 0
- accepted: 0
- rejected: 0
- rejection_bar_met: yes
- outcome: stopped
- validation: pass
- build_db: pass
- build_app: pass
- screenshot: n/a
- commit_push: n/a
- commit_sha: n/a
- pushed_branch: n/a
- ci_deploy: n/a
- failure_tags: [governance_trace_missing, capacity_budget_mismatch]
- reward: 0
- dominant_failure_mode: governance_trace_missing
- proposed_change: formalize human-directed governance changes, support multi-addition daily runs up to the global cap, and align discovery plus commit rules with the higher intake target
- decision: applied
- affected_file: docs/automation/README.md; docs/automation/venturedex-feedback-loop.md; docs/automation/venturedex-daily-runbook.md
- affected_section: Edit Policy; Commit Policy; Mutation Discipline; Immutable Guards note; Failure Tag Vocabulary; Reward Model; Human-Directed Governance Changes; Review for Human-Directed Governance Changes; Content Safety; Daily Execution; Commit Rules; Adaptive Heuristics > Operational Heuristics
- evidence:
  - reviewed commit `91b7c80` and found that the docs change widened daily intake but did not leave a matching learning-log trail or explain how human-requested governance edits differ from scheduled automation self-edits
  - `docs/automation/README.md` and `docs/automation/venturedex-feedback-loop.md` previously described automation-only mutation boundaries, but did not document the supported path for explicit human-requested Codex governance changes
  - the previous candidate-discovery target of 15-30 was too tight for a five-addition ceiling paired with the standing `rejections >= 3x accepted` rule, so the runbook now raises discovery to 20-40 and treats the cap as a ceiling rather than a quota
  - the previous commit rules described only the one-startup case, so the runbook now includes a multi-startup content commit format and a distinct subject for human-requested automation-policy changes
