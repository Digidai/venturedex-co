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
- ci_deploy: pass
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
- ci_deploy: pass
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
- ci_deploy: not_visible
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
- failure_tags: [other]
- reward: 1
- dominant_failure_mode: automation memory path environment variable was unset in the shell
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

### 2026-04-20 18:43 CST

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
- proposed_change: add a formal deep-research and iteration loop for automation errors, and keep the local automation prompt aligned with the repo control plane
- decision: applied
- affected_file: docs/automation/README.md; docs/automation/venturedex-feedback-loop.md; docs/automation/venturedex-daily-runbook.md
- affected_section: Automation Config Alignment; Allowed automatic actions; Error Research and Iteration Loop; Validation and Publish Gates > Error Investigation Loop; Daily Execution; Adaptive Heuristics > Operational Heuristics
- evidence:
  - the local automation prompt in `$CODEX_HOME/automations/venturedex-daily-curator/automation.toml` previously said to stop or defer cleanly, but did not explicitly require deep root-cause research and iterative reruns when errors occurred
  - the runbook contained scattered retry guidance for build dependencies and screenshots, but lacked a single cross-cutting error loop for validation failures, policy conflicts, and unexpected runtime issues
  - the feedback loop already tracked failures and repeated root causes, so the missing piece was an explicit investigation-and-rerun protocol the automation could follow before concluding that a run was blocked
  - the repo docs now define an auditable error-investigation sequence and the local automation config has been updated to mirror that behavior

### 2026-04-20 18:52 CST

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
- proposed_change: make `bb-browser` the default browser workflow for product trials, page verification, and browser-side failure investigation
- decision: applied
- affected_file: docs/automation/README.md; docs/automation/venturedex-feedback-loop.md; docs/automation/venturedex-daily-runbook.md
- affected_section: Automation Config Alignment; Error Research and Iteration Loop; Error Investigation Loop; Daily Execution
- evidence:
  - the local `bb-browser` skill explicitly says this environment should use Comet and not Chrome, so the automation should not encode direct Chrome usage as a default path
  - the runbook already requires live product trials and browser-side verification for some candidates, so browser-tool choice needs to be part of the documented control plane rather than an execution-time guess
  - the local automation config now names `bb-browser` as the default browser workflow, and the repo docs mirror that expectation for both normal product trials and failure triage

### 2026-04-20 19:02 CST

- candidate_count: 20
- accepted: 2
- rejected: 7
- rejection_bar_met: yes
- outcome: accepted
- validation: pass
- build_db: pass
- build_app: pass
- screenshot: pass
- commit_push: pass
- commit_sha: 79d4cec
- pushed_branch: main
- ci_deploy: in_progress
- failure_tags: [push_rejected, other]
- reward: 3
- dominant_failure_mode: remote main advanced during the run and required a rebase before push
- proposed_change: none
- decision: none
- affected_file: n/a
- affected_section: n/a
- evidence:
  - discovered 20 current funding candidates across TechCrunch fundraising coverage and The Information briefings, then deduplicated away names already present in `content/startups/` and `content/rejected.jsonl`
  - accepted Granola and Gizmo after both cleared F1-F4, passed taste review, verified their funding facts against TechCrunch, and resolved lead investors `Index Ventures` and `Shine Capital` against official investor sites plus official brand assets
  - recorded seven fresh rejects for OpenAI, Whoop, Rain, Story Protocol, Harness, Cerebras, and Reflection AI, so the run finished above the 3:1 rejection bar for two accepted startups
  - all local gates passed: `./scripts/validate.sh`, `./scripts/build-db.sh`, and `npm run build`; Gizmo screenshot returned one transient HTTP 429 before succeeding on the allowed retry
  - content commit rebased cleanly over new `origin/main` commit `639ff96` and then pushed as `79d4cec`; GitHub Actions deploy run `24662936201` is currently in progress

### 2026-04-21 13:59 CST

- candidate_count: 24
- accepted: 0
- rejected: 9
- rejection_bar_met: yes
- outcome: rejected-only
- validation: pass
- build_db: pass
- build_app: pass
- screenshot: n/a
- commit_push: pass
- commit_sha: 9fff418
- pushed_branch: main
- ci_deploy: pass
- failure_tags: [none]
- reward: 2
- dominant_failure_mode: none
- proposed_change: none
- decision: none
- affected_file: n/a
- affected_section: n/a
- evidence:
  - bootstrap succeeded for `venturedex-daily-curator`, restored the repo-local `.env`, verified the Cloudflare token as active, and restored `node_modules`; R2 access remained unavailable but screenshot work was not needed
  - discovered 24 recent financing/source candidates from TechCrunch startup and venture coverage plus primary or business-news sources, then deduplicated previously accepted or rejected names before deep review
  - recorded nine fresh rejects for ScaleOps, Poke, VITL, Moonbounce, Cognichip, Ayr Energy, Daydream, Artemis, and Eigen because product access, excluded category, or mandatory round-stage sourcing failed the runbook gates
  - `bb-browser` was used for product/page verification of ScaleOps, Poke, VITL, and Moonbounce; Moonbounce's playground was accessible, but its funding sources did not provide a Seed/Series A/B/C stage
  - local gates passed: `./scripts/validate.sh`, `./scripts/build-db.sh`, and `npm run build`; content commit `9fff418` was pushed to `main`, and GitHub Actions deploy run `24706628350` completed successfully
  - post-run memory write initially failed because `CODEX_HOME` was not exported in the shell and expanded to `/automations/...`; reran with the explicit Codex home path `/Users/dai/.codex/automations/venturedex-daily-curator/memory.md` and wrote the memory successfully

### 2026-04-22 16:24 CST

- candidate_count: 35
- accepted: 1
- rejected: 4
- rejection_bar_met: yes
- outcome: accepted
- validation: pass
- build_db: pass
- build_app: pass
- screenshot: pass
- commit_push: pass
- commit_sha: f847e3a
- pushed_branch: main
- ci_deploy: not_checked
- failure_tags: [none]
- reward: 3
- dominant_failure_mode: none
- proposed_change: none
- decision: none
- affected_file: n/a
- affected_section: n/a
- evidence:
  - bootstrap succeeded for `venturedex-daily-curator`, restored repo-local `.env`, verified an active Cloudflare token, and restored `node_modules`; R2 access remained unavailable but screenshot generation degraded cleanly to local storage
  - discovered 35 recent TechCrunch startup/source candidates across the current startup archive pages, then deduplicated prior accepted and rejected names before promoting finalists
  - accepted GRAI after verifying its $9M Seed round from TechCrunch, resolving lead investor Khosla Ventures against its official website, adding official Khosla Ventures and Inovo VC favicon assets, and capturing an official GRAI site screenshot
  - recorded four fresh rejects for Extra, NeoCognition, Latitude/Voyage, and SaySo; rejection count remained above the 3:1 bar for one accepted startup
  - `bb-browser` was used for browser-side verification of Extra and GRAI pages; Extra stopped at a waitlist/invite-code gate, while GRAI exposed public product surfaces for iOS and Android through its official site and source article
  - five review passes completed: funding facts, dedup, official brand assets, taste/rating language, and staged file scope; local gates passed with only pre-existing investor fallback warnings

### 2026-04-23 13:50 CST

- candidate_count: 30
- accepted: 0
- rejected: 6
- rejection_bar_met: yes
- outcome: rejected-only
- validation: pass
- build_db: pass
- build_app: pass
- screenshot: n/a
- commit_push: pass
- commit_sha: 3a8280b
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
  - bootstrap succeeded for `venturedex-daily-curator`, restored repo-local `.env`, verified an active Cloudflare token, and restored `node_modules`; R2 access remained unavailable but screenshot work was not needed
  - discovered 30 current source candidates from TechCrunch startup pages and recent funding roundups, then deduplicated existing VentureDex acceptances and prior rejections before promoting new names
  - recorded six fresh rejects for Lucra, 10x Science, Noon, Coral, Logicc, and ViewsML because gambling-adjacent mechanics, early-access gates, demo-only sales paths, or non-trialable public sites failed F1/F4 gates
  - `bb-browser` was used for page/product verification of Lucra, 10x Science, Noon, Coral, Logicc, and ViewsML; no candidate exposed a compliant self-serve product flow worth advancing to brand assets or screenshots
  - local gates passed: `./scripts/validate.sh`, `./scripts/build-db.sh`, and `npm run build`; `d1/generated-seed.sql` and `scripts/__pycache__/` were restored/removed as verification output
  - content commit `3a8280b` records the rejected candidates and is paired with this separate learning-log commit to keep content and automation-doc scopes isolated
  - GitHub Actions deploy run `24819322745` completed successfully for pushed learning-log commit `109e5b5`

### 2026-04-24 13:57 CST

- candidate_count: 40
- accepted: 0
- rejected: 7
- rejection_bar_met: yes
- outcome: rejected-only
- validation: pass
- build_db: pass
- build_app: pass
- screenshot: n/a
- commit_push: pass
- commit_sha: a86a437
- pushed_branch: main
- ci_deploy: not_checked
- failure_tags: [other]
- reward: 1
- dominant_failure_mode: minor discovery command-shaping errors were corrected before content decisions
- proposed_change: none
- decision: none
- affected_file: n/a
- affected_section: n/a
- evidence:
  - bootstrap succeeded for `venturedex-daily-curator`, restored repo-local `.env`, verified an active Cloudflare token, and restored `node_modules`; R2 access still lacks permission, but screenshot work was not needed
  - discovered current TechCrunch startup/funding source candidates from the April 2026 archive and WordPress API; 48 title-matched funding/source items and 128 startup-category items were narrowed to a 40-candidate review window after deduping prior accepted and rejected slugs
  - recorded seven fresh rejects for Era, Shade, Salmon, Blue Energy, Noscroll, Hiro, and Portal Space Systems because the public product was untrialable, the source lacked a mandatory Seed/Series A/B/C stage, or the company was acquired and shutting down
  - `bb-browser` was used for browser-side product/page verification of Era, Shade, Salmon, Blue Energy, Noscroll, and Portal Space Systems; all tabs opened by the run were closed afterward
  - local gates passed: `./scripts/validate.sh`, `./scripts/build-db.sh`, and `npm run build`; `d1/generated-seed.sql` and `scripts/__pycache__/` were restored/removed as verification output
  - content commit `a86a437` was pushed to `main`; no GitHub Actions run was visible for that commit when checked with `gh run list --commit a86a437`
  - minor command issues during discovery were root-caused and corrected: one jq filter had shell-quote breakage, one TechCrunch API query exceeded valid pages, and two `bb-browser` helper commands were adjusted after command-format or tab-state feedback

### 2026-04-25 00:20 CST

- candidate_count: 50
- accepted: 1
- rejected: 4
- rejection_bar_met: yes
- outcome: accepted
- validation: pass
- build_db: pass
- build_app: pass
- screenshot: pass
- commit_push: pass
- commit_sha: 5607939
- pushed_branch: main
- ci_deploy: not_visible
- failure_tags: [other]
- reward: 2
- dominant_failure_mode: stale `bb-browser` daemon CDP connection and non-trialable Forbes watchlist candidates were corrected or deferred before content decisions
- proposed_change: none
- decision: none
- affected_file: n/a
- affected_section: n/a
- evidence:
  - bootstrap succeeded for `venturedex-daily-curator`, restored repo-local `.env`, verified an active Cloudflare token, and confirmed `node_modules`; R2 access still lacks permission, so screenshot upload degraded to local storage
  - treated Forbes AI50 as a discovery source only, deduped it against existing VentureDex startups/rejections, and promoted individual companies through the normal funding-source, product-trial, taste, brand-asset, screenshot, and gate flow instead of recreating a static market map
  - accepted Krea after verifying TechCrunch's April 7, 2025 report of a $47M Series B led by Bain Capital Ventures, cross-checking Bain Capital Ventures against its official website, adding official Krea and BCV icon assets, and capturing a local screenshot
  - `bb-browser` product review reached Krea's `image/k1` workspace with Krea 1, LoRA, style transfer, prompt, ratio, and resolution controls; generation required sign-in state, but the actual product surface was accessible and not a pure landing page
  - recorded four fresh F3 rejects from the Forbes list: Baseten's official $300M Series E, fal's official $140M Series D, Databricks' reported Series L at $134B, and Skild AI's official Series C valuation above $14B
  - deferred rather than forced other watchlist names: Gamma's site stayed behind a Cloudflare interstitial in `bb-browser`, Lovable rendered a blank dashboard surface in the browser session, and Listen Labs' public trial path required email/signup before the product could be used
  - local gates passed: `./scripts/validate.sh`, `./scripts/build-db.sh`, and `npm run build`; `d1/generated-seed.sql`, `.playwright-cli/`, and `scripts/__pycache__/` were restored or removed as verification output
  - content commit `5607939` was pushed to `main`; `gh run list --commit 5607939` returned no visible GitHub Actions runs when checked

### 2026-04-25 13:58 CST

- candidate_count: 40
- accepted: 0
- rejected: 11
- rejection_bar_met: yes
- outcome: rejected-only
- validation: pass
- build_db: pass
- build_app: pass
- screenshot: n/a
- commit_push: pass
- commit_sha: 9563fbb
- pushed_branch: main
- ci_deploy: not_visible
- failure_tags: [other]
- reward: 1
- dominant_failure_mode: stale `bb-browser` daemon process required an evidence-backed cleanup before browser product review
- proposed_change: preflight and clear stale `bb-browser` daemon processes before browser-based product trials
- decision: applied
- affected_file: docs/automation/venturedex-daily-runbook.md
- affected_section: Adaptive Heuristics > Operational Heuristics
- evidence:
  - bootstrap succeeded, restored repo-local `.env`, verified an active Cloudflare token, and restored `node_modules`; R2 access still lacks permission, but screenshot work was not needed
  - discovered 40 current TechCrunch startup/funding source candidates from the recent API/archive window, deduped prior accepted and rejected slugs, and promoted 11 fresh names into screening
  - recorded fresh rejects for Series, ComfyUI, Pronto, X-energy, Aleph Alpha, Fragment, Mantis Biotech, AuX Labs, Aetherflux, Radify Metals, and Halter because product access, independence, stage, IPO status, or mandatory stage sourcing failed F1-F3
  - `bb-browser open` initially failed because Comet CDP was reachable but `bb-browser status` reported no daemon while an orphaned `bb-browser/dist/daemon.js --cdp-port 19825` process was still running; terminating only that stale daemon restored browser review without restarting Comet
  - `bb-browser` product/page checks were completed for ComfyUI, Series, Mantis Biotech, AuX Labs, Aetherflux, Radify Metals, Pronto, and Halter, and all opened tabs were closed afterward
  - a source-audit helper command had a shell quoting error; the corrected query pulled TechCrunch WordPress API snippets and confirmed the rejection reasons before commit
  - local gates passed: `./scripts/validate.sh`, `./scripts/build-db.sh`, and `npm run build`; `d1/generated-seed.sql` and `scripts/__pycache__/` were restored or removed as verification output
  - content commit `9563fbb` was pushed to `main`; `gh run list --commit 9563fbb` returned no visible GitHub Actions runs when checked
  - the heuristic update is limited to the marked runbook auto-edit region and tightens the repeated stale-daemon recovery path observed in this run and the previous curation run

### 2026-04-26 13:57 CST

- candidate_count: 40
- accepted: 0
- rejected: 5
- rejection_bar_met: yes
- outcome: rejected-only
- validation: pass
- build_db: pass
- build_app: pass
- screenshot: n/a
- commit_push: pass
- commit_sha: 5e2cca9
- pushed_branch: main
- ci_deploy: not_visible
- failure_tags: [other]
- reward: 1
- dominant_failure_mode: minor command-shaping errors during source parsing and bb-browser tab cleanup were corrected before content decisions
- proposed_change: none
- decision: none
- affected_file: n/a
- affected_section: n/a
- evidence:
  - bootstrap succeeded for `venturedex-daily-curator`, restored repo-local `.env`, verified an active Cloudflare token, and restored `node_modules`; R2 access still lacks permission, but screenshot work was not needed
  - discovered a 40-candidate current TechCrunch source window across recent funding, valuation, IPO, acquisition, and source items, then deduped prior published and rejected slugs before promoting unresolved names
  - recorded fresh rejects for Snabbit, Parasail, Gitar, Upscale AI, and Fluidstack because current sources lacked a closed Seed-Series C round, product access stopped at login/install gates, no product was released, or valuation exceeded the guardrail
  - `bb-browser` was used for Parasail and Gitar product verification; Parasail redirected trial access to Auth0 without rendering a usable workspace, while Gitar's signup route rendered only a blank app shell and required connecting a GitHub or GitLab repository
  - a TechCrunch API jq filter initially failed because shell quoting was broken by an apostrophe replacement, and an attempted `bb-browser tab close --id` cleanup used long CDP ids instead of short tab indices; both were root-caused and corrected without changing content decisions
  - local gates passed: `./scripts/validate.sh`, `./scripts/build-db.sh`, and `npm run build`; `d1/generated-seed.sql` and `scripts/__pycache__/` were restored or removed as verification output
  - content commit `5e2cca9` was pushed to `main`; `gh run list --commit 5e2cca9` returned no visible GitHub Actions runs when checked

### 2026-04-27 13:58 CST

- candidate_count: 43
- accepted: 0
- rejected: 4
- rejection_bar_met: yes
- outcome: rejected-only
- validation: pass
- build_db: pass
- build_app: pass
- screenshot: n/a
- commit_push: pass
- commit_sha: 3d81538
- pushed_branch: main
- ci_deploy: not_visible
- failure_tags: [other]
- reward: 1
- dominant_failure_mode: minor command-shaping issues during discovery and browser-tab reuse were corrected before content decisions
- proposed_change: none
- decision: none
- affected_file: n/a
- affected_section: n/a
- evidence:
  - bootstrap succeeded for `venturedex-daily-curator`, restored repo-local `.env`, verified an active Cloudflare token, and restored `node_modules`; R2 access still lacks permission, but screenshot work was not needed
  - discovered a 40-item current TechCrunch funding/source window and added three credible broad-source candidates from current Moneycontrol, YourStory, official release, and ET coverage before dedupe and F1 screening
  - recorded fresh F1 rejects for Antioch, Oolka, Bachatt, and STCH because each current public path stopped at login, sensitive financial/KYC intake, app-only onboarding, contact-led enterprise flow, or a non-functional assistant-style surface
  - `bb-browser` was used for browser-side product verification of Antioch, Oolka, Bachatt, and STCH, and the tabs opened by this run were closed afterward
  - a TechCrunch API jq helper initially failed due to shell quoting around an apostrophe replacement, and one `bb-browser open --tab current` attempt used an option form that this daemon rejected; both were root-caused and corrected without changing content decisions
  - local gates passed: `./scripts/validate.sh`, `./scripts/build-db.sh`, and `npm run build`; `d1/generated-seed.sql` and `scripts/__pycache__/` were restored or removed as verification output
  - content commit `3d81538` and learning-log commit `8c1ec7b` were pushed to `main`; `gh run list` returned no visible GitHub Actions runs for either commit when checked

### 2026-04-29 16:16 CST

- candidate_count: 40
- accepted: 0
- rejected: 7
- rejection_bar_met: yes
- outcome: rejected-only
- validation: pass after one duplicate-slug fix
- build_db: pass
- build_app: pass
- screenshot: n/a
- commit_push: pass
- commit_sha: 133257c
- pushed_branch: main
- ci_deploy: not_checked
- failure_tags: [validate_fail, other]
- reward: -1
- dominant_failure_mode: duplicate rejected slug for a later-round recheck plus recurring command-shaping and bb-browser tab-management friction
- proposed_change: tighten TechCrunch API parsing and bb-browser tab-cleanup heuristics
- decision: applied
- affected_file: docs/automation/venturedex-daily-runbook.md
- affected_section: Adaptive Heuristics > Operational Heuristics
- evidence:
  - bootstrap succeeded for `venturedex-daily-curator`, restored repo-local `.env`, verified an active Cloudflare token, and restored `node_modules`; R2 access still lacks permission, but screenshot work was not needed
  - discovered a 40-candidate recent funding/source window from TechCrunch API/search plus current primary or business-news sources, then deduped prior accepted and rejected companies before promoting fresh unresolved names
  - recorded six net-new rejected entries for Cloudsmith, Orkes, Patlytics, Bluefish, Skye/Signull Labs, and Neurable; Snabbit was rechecked under the later-funding exception and its existing rejection was updated to the current $56M Series D ineligibility
  - `bb-browser` was used for product/page verification of Cloudsmith, Orkes, Patlytics, Bluefish, Skye, Neurable, and House of Chikankari; all run-opened tabs were closed after review
  - `bb-browser open` first failed because `daemon status` reported no daemon while a stale `bb-browser/dist/daemon.js` process was present; terminating only that process and confirming CDP restored the browser workflow
  - the first TechCrunch API helper failed from shell quoting around apostrophe entity normalization; the corrected helper extracted only simple fields, matching the new parsing heuristic
  - first `./scripts/validate.sh` failed with `rejected.jsonl:117 duplicate slug: snabbit`; inspecting `scripts/validate.py` showed rejected slugs must be unique, so the later-round evidence was merged into the existing Snabbit line and validation then passed
  - local gates passed after the fix: `./scripts/validate.sh`, `./scripts/build-db.sh`, and `npm run build`; `d1/generated-seed.sql` and `scripts/__pycache__/` were restored or removed as verification output
  - content commit `133257c` was pushed to `main`; `gh run list --commit 133257c` returned no visible GitHub Actions runs, and this separate automation-doc commit records the learning log and the allowed heuristic update

### 2026-04-30 13:59 CST

- candidate_count: 40
- accepted: 0
- rejected: 8
- rejection_bar_met: yes
- outcome: rejected-only
- validation: pass
- build_db: pass
- build_app: pass
- screenshot: n/a
- commit_push: pass
- commit_sha: 755d48d
- pushed_branch: main
- ci_deploy: not_visible
- failure_tags: [other]
- reward: 1
- dominant_failure_mode: minor discovery and bb-browser interaction command-shaping errors were corrected before content decisions
- proposed_change: none
- decision: none
- affected_file: n/a
- affected_section: n/a
- evidence:
  - bootstrap succeeded for `venturedex-daily-curator`, restored repo-local `.env`, verified an active Cloudflare token, and restored `node_modules`; R2 access still lacks permission, but screenshot work was not needed
  - discovered a 40-candidate current funding/source window from TechCrunch API/search plus TechStartups funding roundups, then deduped prior accepted and rejected slugs before promoting fresh names
  - recorded eight fresh F1 rejects for Parallel Web Systems, Pursuit, General Analysis, Actively AI, Firestorm Labs, Scout AI, Axoft, and SPREAD AI because public product access stopped at login, demo/contact, hardware/medical-device information, blank render, or non-trialable enterprise/defense surfaces
  - `bb-browser` was used for product/page verification of Parallel Web Systems, Pursuit, General Analysis, Actively AI, Firestorm Labs, Scout AI, Axoft, and SPREAD AI; all tabs opened by this run were closed afterward
  - one TechCrunch API helper command failed from an unmatched shell quote, and Parallel trial interaction hit stale or wrong `bb-browser` refs before a fresh snapshot clarified the current refs; both were root-caused and corrected without changing content decisions
  - local gates passed: `./scripts/validate.sh`, `./scripts/build-db.sh`, and `npm run build`; `d1/generated-seed.sql` and `scripts/__pycache__/` were restored or removed as verification output
  - content commit `755d48d` was pushed to `main`; `gh run list --commit 755d48d` returned no visible GitHub Actions runs when checked

### 2026-04-30 14:07 CST

- candidate_count: 0
- accepted: 0
- rejected: 0
- rejection_bar_met: yes
- outcome: stopped
- validation: pass
- build_db: pass
- build_app: pass
- screenshot: n/a
- commit_push: pass
- commit_sha: n/a
- pushed_branch: main
- ci_deploy: not_checked
- failure_tags: [none]
- reward: 0
- dominant_failure_mode: none
- proposed_change: relax F1 and F3 so gated ToB/API/infrastructure products and high-signal private breakout companies can be evaluated when public product evidence is strong
- decision: applied
- affected_file: content/STANDARD.md; content/CODEX_TASK.md; docs/automation/venturedex-daily-runbook.md
- affected_section: Stage 2 screening; Stage 3 product evaluation; red lines; Content Safety; Daily Execution; Five Review Passes
- evidence:
  - user explicitly directed a governance change after the 2026-04-30 curation run rejected several high-signal companies for login, demo, or enterprise-access gates
  - `content/STANDARD.md` now defines F1 as product evaluability rather than mandatory no-login self-serve trial, and accepts public docs, API references, SDKs, demos, real UI, benchmarks, pricing/usage pages, app-store pages, and customer workflows as evidence
  - `content/STANDARD.md` and `content/CODEX_TASK.md` now treat Seed-Series C as the default preference rather than an absolute ceiling, allowing independent private breakout companies at Series D+, >$10B valuation, or unusually large financing when product evidence and reader relevance are strong
  - rejected candidates may be reconsidered when a later funding round, new product evidence, or explicit human-governance change makes the original rejection reason obsolete
  - local gates passed after the governance edits: `./scripts/validate.sh`, `./scripts/build-db.sh`, and `npm run build`; `d1/generated-seed.sql` and `scripts/__pycache__/` were restored or removed as verification output

### 2026-05-01 14:05 CST

- candidate_count: 40
- accepted: 3
- rejected: 9
- rejection_bar_met: yes
- outcome: content-updated
- validation: pass
- build_db: pass
- build_app: pass
- screenshot: pass; Parallel homepage required Cloudflare fallback after Playwright overlay false-positive, Shapes and Parasail passed popup-safe capture; R2 upload skipped because token lacks R2 permission
- commit_push: pass
- commit_sha: 4ab5546
- pushed_branch: main
- ci_deploy: not_visible
- failure_tags: [screenshot_env, policy_conflict, other]
- reward: 3
- dominant_failure_mode: screenshot overlay classifier false-positive on Parallel fixed negative-z-index background, plus one repeated shell-quoting mistake during TechCrunch API source verification
- proposed_change: defer code-level alignment for screenshot overlay detection and Series D+ validator policy; no automation-doc heuristic edit because the shell-quoting issue is already covered by the simple-field TechCrunch heuristic
- decision: deferred
- affected_file: scripts/screenshot.sh; scripts/validate.py
- affected_section: deferred outside automation-doc auto-edit regions
- evidence:
  - bootstrap succeeded for `venturedex-daily-curator`, restored repo-local `.env`, verified an active Cloudflare token, and restored `node_modules`; R2 access still lacks permission, so screenshot uploads degraded to local files
  - discovered a 40-candidate TechCrunch/current-source window and accepted Parallel Web Systems, Shapes, and Parasail after the 2026-04-30 F1 governance change made public docs, APIs, app surfaces, and pricing/product pages sufficient for gated API, infra, and consumer products
  - Parallel Web Systems was reclassified from the prior F1 reject because `bb-browser` verified the homepage, API links, pricing, benchmarks, and official docs with API Playground, OpenAPI, Python SDK, TypeScript SDK, and agent/tool integrations
  - Shapes was accepted because the public app exposes sign-up, search, 300+ AI models, group-chat surfaces, public character cards, visible message counts, and mobile app links rather than only a waitlist
  - Parasail was accepted because the homepage and docs expose serverless and dedicated inference products, pricing, free credits, API reference, batch, rate limits, billing, compliance, and concrete usage claims including 500B+ daily tokens
  - removed obsolete rejected entries for Parallel Web Systems and Parasail, updated Gitar and Antioch under the new F1 rule, and added seven fresh rejected/deferred decisions for Legora, Ineffable Intelligence, Rocket AI, Avec, Divine, Skio, and Drizzle
  - Legora exposed a policy mismatch: current governance allows exceptional Series D+ breakouts, but `scripts/validate.py` still blocks stages outside Seed-Series C, so the candidate was deferred rather than forcing an unsupported stage
  - `./scripts/screenshot.sh parallel-web-systems https://parallel.ai` failed because the Playwright overlay heuristic scored a `position: fixed; z-index: -10` visual background as a popup; after manual bb-browser/Playwright confirmation that the page was usable, the built-in Cloudflare fallback created the local screenshot
  - one TechCrunch API `jq` helper failed from shell quoting around apostrophe entity replacement; the command was corrected to simple title/date/excerpt fields without affecting content decisions
  - local gates passed: `./scripts/validate.sh`, `./scripts/build-db.sh`, and `npm run build`; `d1/generated-seed.sql`, `.playwright-cli/`, and `scripts/__pycache__/` were restored or removed as verification output
  - content commit `4ab5546` was pushed to `main`; `gh run list --commit 4ab5546` returned no visible GitHub Actions runs when checked

### 2026-05-02 14:06 CST

- candidate_count: 40
- accepted: 3
- rejected: 9
- rejection_bar_met: yes
- outcome: content-updated
- validation: pass
- build_db: pass
- build_app: pass
- screenshot: pass; Alcatraz required Cloudflare fallback after a HubSpot overlay false-positive, Synera and Monk passed popup-safe capture; R2 upload skipped because token lacks R2 permission
- commit_push: pass
- commit_sha: f409aa8
- pushed_branch: main
- ci_deploy: not_visible
- failure_tags: [screenshot_env, other]
- reward: 3
- dominant_failure_mode: screenshot overlay classifier false-positive on Alcatraz HubSpot full-viewport anchor
- proposed_change: defer code-level screenshot overlay classifier alignment; no automation-doc heuristic update because the retry path is already covered by the current screenshot fallback heuristic
- decision: deferred
- affected_file: scripts/screenshot.sh
- affected_section: deferred outside automation-doc auto-edit regions
- evidence:
  - bootstrap succeeded for `venturedex-daily-curator`, restored repo-local `.env`, verified an active Cloudflare token, and restored `node_modules`; R2 access still lacks permission, so screenshot uploads degraded to local files
  - discovered a 40-candidate TechCrunch/current-source window plus official funding pages and accepted Synera, Monk, and Alcatraz after product, funding, investor, logo, and screenshot verification
  - Synera was accepted because its public product pages and official Series B release show an active agentic engineering platform with CAD, FEA, meshing, reporting, Python/custom-node automation, customer stories, and a $40M Series B led by Revaia
  - Monk was accepted because its public product pages and official Series A release show an active accounts-receivable automation platform for invoices, collections, cash application, portal uploads, PO mismatch handling, and disputes, with a $25M Series A led by Footwork
  - Alcatraz was accepted because its public product pages and official Series B release show an active Rock X facial access authentication product with edge authentication, 3D liveness, tailgating detection, opt-in enrollment, privacy posture, and a $50M Series B led by BlackPeak Capital
  - recorded nine rejected/deferred decisions for Musely, Assured Robot Intelligence, Bolto, Luminai, Earth AI, Sniffies, Zap Energy, Coefficient Bio, and TBPN, meeting the 3:1 rejection bar
  - `bb-browser` was used for product and browser-side verification, including Synera, Monk, Bolto, Luminai, and Alcatraz; tabs opened by this run were closed afterward
  - `./scripts/screenshot.sh alcatraz https://www.alcatraz.ai` first failed on popup detection; bb-browser inspection showed the page was usable and the fixed full-viewport HubSpot anchor was the false-positive, so the built-in Cloudflare fallback created the local screenshot
  - local gates passed: `./scripts/validate.sh`, `./scripts/build-db.sh`, `npm run build`, and `git diff --check`; `d1/generated-seed.sql`, `.playwright-cli/`, and `scripts/__pycache__/` were restored or removed as verification output
  - content commit `f409aa8` was pushed to `main`; `gh run list --commit f409aa8` returned no visible GitHub Actions runs when checked

### 2026-05-02 18:27 CST

- candidate_count: 0
- accepted: 0
- rejected: 0
- rejection_bar_met: yes
- outcome: process-hardened
- validation: pass
- build_db: pass
- build_app: pass
- screenshot: n/a
- commit_push: pass
- commit_sha: b572563
- pushed_branch: main
- ci_deploy: pass
- failure_tags: [validate_fail, deploy_fail, other]
- reward: 0
- dominant_failure_mode: release and automation gates were too weak to detect disabled GitHub Actions, stale generated seed files, live listing count drift, and legacy site-model SQL
- proposed_change: add GitHub Actions preflight, strong live smoke, generated-seed freshness checks, CI validation, legacy SQL guard, and explicit post-push deploy/live-smoke requirements
- decision: applied
- affected_file: scripts/check-github-actions.sh; scripts/smoke-live.py; scripts/manage.sh; scripts/bootstrap-automation.sh; scripts/validate.sh; .github/workflows/ci.yml; src/pages/index.astro; src/pages/collections/index.astro; docs/automation/venturedex-daily-runbook.md
- affected_section: human-directed process hardening outside daily auto-edit scope
- evidence:
  - user explicitly requested an Agent Team project and process diagnosis plus comprehensive fixes after homepage and News/listing drift was observed
  - UI/data audit confirmed current live pages are consistent but identified future homepage truncation risk, inaccurate Collections copy, and legacy executable SQL files using the old `sites` model
  - release/process audit identified stale tracked `d1/generated-seed.sql` risk for `sync --skip-build`, weak release smoke, lack of dual-domain smoke, lack of a non-deploy CI workflow, and missing automation preflight for disabled GitHub Actions
  - automation-guard audit identified missing runbook requirements for GitHub Actions enabled state, deploy observability, and post-deploy live smoke; it also surfaced a transient `IncompleteRead` risk in live smoke fetches
  - implemented a strong live smoke that checks homepage count/card invariants, sort/filter views, News rows, Collections index/detail counts, and Search result counts
  - implemented GitHub Actions preflight in bootstrap and a generated-seed freshness check before remote D1 sync, and deleted legacy executable SQL files tied to the old site-model schema
  - added a lightweight `Validate` GitHub Actions workflow for push and pull_request so validation/build failures are visible independently of deploy
  - code/process commit `b572563` was pushed to `main`; GitHub Actions runs passed for Validate `25249897902` and Deploy `25249897911`
  - local and live verification passed: script syntax checks, YAML parsing, GitHub Actions preflight, `./scripts/validate.sh`, `./scripts/build-db.sh`, `npm run build`, `./scripts/manage.sh smoke https://venturedex.co`, and `git diff --check`

### 2026-05-03 14:29 CST

- candidate_count: 40
- accepted: 3
- rejected: 9
- rejection_bar_met: yes
- outcome: content-updated
- validation: pass
- build_db: pass
- build_app: pass
- screenshot: pass; Featherless required manual Playwright-wrapper capture after the popup-safe script left a cookie dialog, Liquid Instruments required manual wrapper cleanup after visual review found a Cookiebot panel despite script success, and Balerion passed the standard script; R2 upload skipped because token lacks R2 permission
- commit_push: pass
- commit_sha: 8e4db31
- pushed_branch: main
- ci_deploy: pass
- failure_tags: [screenshot_env, other]
- reward: 3
- dominant_failure_mode: screenshot consent and overlay handling remains site-specific, especially Featherless cookie consent and Liquid Instruments Cookiebot/HubSpot anchors
- proposed_change: defer code-level screenshot cleanup alignment; no automation-doc heuristic edit because the current screenshot retry and failure-investigation heuristics already covered this path
- decision: deferred
- affected_file: scripts/screenshot.sh
- affected_section: deferred outside automation-doc auto-edit regions
- evidence:
  - bootstrap succeeded for `venturedex-daily-curator`, restored repo-local `.env`, verified an active Cloudflare token, and restored `node_modules`; R2 access still lacks permission, so screenshot uploads degraded to local files
  - discovered a 40-candidate TechCrunch/current-source window and accepted Featherless, Liquid Instruments, and Balerion after product, funding, investor, logo, screenshot, and taste verification
  - Featherless was accepted because its official Series A post verifies a $20M Series A co-led by AMD Ventures and Airbus Ventures, while the live product and docs expose 30,000+ open models, API docs, chat completions, embeddings, tool calling, vision, agents, pricing, and model-library usage signals
  - Liquid Instruments was accepted because its official Series C post verifies a $50M Series C co-led by Keysight Technologies and NRFC, while product pages expose the Moku platform, 15+ instruments, FPGA-backed processing, custom measurement workflows, and live product CTAs
  - Balerion was accepted because its official press page and Business Wire/Yahoo source verify a $6M Seed led by Kleiner Perkins, while the product pages expose loan-file intelligence for income analysis, document fraud, NSF review, compliance overlays, VOIAE monitoring, and mortgage workflow evidence
  - recorded nine rejected/deferred decisions for Chord, Fun, Lumian, Chance AI, TextQL, Botify, Macrodata Labs, Alta Ares, and Dashverse, meeting the 3:1 rejection bar
  - `bb-browser` was used for product and browser-side verification of Featherless, Balerion, Chord, Liquid Instruments, Fun, Lumian, and official logo sources; the installed CLI still rejects `--tab current`, so the existing runbook cleanup heuristic was followed
  - `./scripts/screenshot.sh featherless https://featherless.ai` failed with `popup_detected` on a fixed nav and cookie dialog; Cloudflare fallback produced a screenshot with the cookie dialog, so a Playwright-wrapper capture dismissed consent before replacing the local WebP
  - the standard Liquid Instruments screenshot command exited OK but visual review showed a Cookiebot panel; `bb-browser` and Playwright inspection traced the obstruction to hidden Cookiebot consent assets plus `hs-web-interactives-*` fixed anchors, so a wrapper capture removed those overlays before replacing the local WebP
  - local gates passed: `./scripts/check-github-actions.sh .github/workflows/deploy.yml`, `./scripts/validate.sh`, `./scripts/build-db.sh`, `npm run build`, and `git diff --check`; `d1/generated-seed.sql`, `.playwright-cli/`, and `scripts/__pycache__/` were restored or removed as verification output
  - content commit `8e4db31` was pushed to `main`; GitHub Actions passed for Validate `25271953010` and Deploy `25271952997`
  - post-deploy live smoke passed with `./scripts/manage.sh smoke https://venturedex.co`, reporting 22 published startups

### 2026-05-04 14:20 CST

- candidate_count: 40
- accepted: 2
- rejected: 6
- rejection_bar_met: yes
- outcome: content-updated
- validation: pass
- build_db: pass
- build_app: pass
- screenshot: pass; JuliaHub required manual Playwright-wrapper consent dismissal after the popup-safe script could not clear an `OKAY` cookie banner, and All3 required a product-page capture after the homepage rendered blank in headless mode; R2 upload skipped because token lacks R2 permission
- commit_push: pass
- commit_sha: 4394d11
- pushed_branch: main
- ci_deploy: pass
- failure_tags: [screenshot_env, policy_conflict, other]
- reward: 2
- dominant_failure_mode: screenshot consent/overlay handling remains site-specific, and the current validator cannot represent known non-USD funding amounts without schema work
- proposed_change: defer code-level screenshot cleanup and non-USD funding amount schema alignment; no automation-doc heuristic edit because current retry/failure-investigation rules covered the path
- decision: deferred
- affected_file: scripts/screenshot.sh; scripts/validate.py
- affected_section: deferred outside automation-doc auto-edit regions
- evidence:
  - bootstrap succeeded for `venturedex-daily-curator`, restored repo-local `.env`, verified an active Cloudflare token, and restored `node_modules`; R2 access still lacks permission, so screenshot work degraded to local files
  - discovered a 40-candidate TechCrunch/current-source window and accepted JuliaHub and All3 after product, funding, investor, logo, screenshot, and taste verification
  - JuliaHub was accepted because its official Apr 30, 2026 post verifies a $65M Series B led by Dorilton Ventures, while the live product and docs expose Dyad 3.0, SciML, case studies, cloud simulation, documentation, pricing links, and industrial customer proof from ASML, Boeing, NASA, and Williams Racing
  - All3 was accepted because TNW verifies an Apr 29, 2026 $25M Seed led by RTP Global, while the live product pages expose AI-generated architecture, real-time fabrication software, timber components, Mantis on-site robots, 100+ in-house engineers, and a cost-your-project flow
  - recorded six rejected/deferred decisions for Pmtbox, QuoIntelligence, Atech, Schematik, Spacebackend, and Zynt, meeting the 3:1 rejection bar for two acceptances
  - `bb-browser` was used for product and browser-side verification of JuliaHub, Pmtbox, QuoIntelligence, and All3; QuoIntelligence's `.com` URL failed SSL, but the correct `.eu` domain loaded and exposed Mercury product evidence
  - QuoIntelligence was deferred rather than accepted because current sources state the Series A as EUR 7.3M and `scripts/validate.py` only accepts USD-style funding amounts; the run did not convert currencies or hide a known amount as `undisclosed`
  - the first TechCrunch API extraction failed from shell-embedded apostrophe entity rewrites in `jq`, then succeeded with the runbook's simple-field extraction pattern; a separate `curl | python3 - <<'PY'` parser failed because the here-doc consumed stdin, then succeeded with `python3 -c`
  - `./scripts/screenshot.sh juliahub https://juliahub.com` failed because the site exposes an `OKAY` consent banner; the first manual wrapper attempt used an invalid long Playwright session name, then a short-session wrapper clicked consent and captured a visually reviewed local WebP
  - `./scripts/screenshot.sh all3 https://www.all3.com` failed on a full-viewport relative `z-index: 100` element; the first manual homepage screenshot was visually blank, so the final local WebP was captured from `https://www.all3.com/integrated-technology` after the product heading loaded
  - the first `./scripts/validate.sh` rerun failed because `content/startups/all3.json` used `domain: all3.com` with URL host `www.all3.com`; fixing the domain and adding an explicit `Unlike` comparison made validation pass on the next run
  - local gates passed: `./scripts/check-github-actions.sh .github/workflows/deploy.yml`, `./scripts/validate.sh`, `./scripts/build-db.sh`, `npm run build`, and `git diff --check`; `d1/generated-seed.sql`, `.playwright-cli/`, and `scripts/__pycache__/` were restored or removed as verification output
  - content commit `4394d11` was pushed to `main`; GitHub Actions passed for Validate `25304135908` and Deploy `25304135907`
  - post-deploy live smoke passed with `./scripts/manage.sh smoke https://venturedex.co`, reporting 24 published startups

### 2026-05-05 14:43 CST

- candidate_count: 40
- accepted: 2
- rejected: 6
- rejection_bar_met: yes
- outcome: content-updated
- validation: pass
- build_db: pass
- build_app: pass
- screenshot: pass; Manifest OS required manual Playwright-wrapper cleanup after the standard screenshot command exited OK with a Framer cookie banner still visible, and LakeFusion passed the standard screenshot command; R2 upload skipped because token lacks R2 permission
- commit_push: pass
- commit_sha: 56cdbb5
- pushed_branch: main
- ci_deploy: pass
- failure_tags: [screenshot_env, validate_fail, source_incomplete, other]
- reward: 1
- dominant_failure_mode: screenshot consent handling still needs visual review, and local curl validation can fail when system DNS resolves an existing brand host to reserved `198.18.x.x` addresses
- proposed_change: defer code-level screenshot cleanup and validator/network-environment handling; no automation-doc heuristic edit because current visual-review, failure-investigation, and rerun rules covered the path
- decision: deferred
- affected_file: scripts/screenshot.sh; scripts/validate.py
- affected_section: deferred outside automation-doc auto-edit regions
- evidence:
  - bootstrap succeeded for `venturedex-daily-curator`, restored repo-local `.env`, verified an active Cloudflare token, and restored `node_modules`; R2 access still lacks permission, so screenshot uploads degraded to local files
  - discovered a 40-candidate TechCrunch/current-source window and accepted Manifest OS and LakeFusion after product, funding, investor, logo, screenshot, and taste verification
  - Manifest OS was accepted because a Business Wire/National Law Review source verifies an Apr 28, 2026 $60M Series A led by Menlo Ventures at a $750M valuation, while the official product pages expose an AI-native legal-services platform, fixed-fee immigration workflows, a client portal, AI Drafter, AI Case Evaluation, and 3,000+ engagements
  - LakeFusion was accepted because GlobeNewswire verifies a $7.5M Seed led by Silverton Partners, while the public site and source show Databricks-native MDM, LLM plus vector matching, Unity Catalog governance, AWS/Azure marketplace availability, zero data egress, and real-time sync to source systems
  - recorded six rejected or rechecked decisions for Sierra, Cerebras, Fervo Energy, Barocal, Acorn/Blacksky, and Standard Intelligence, meeting the 3:1 rejection bar for two acceptances
  - `bb-browser` was used for product and browser-side verification of LakeFusion, Manifest OS, Barocal, Sierra, and Standard Intelligence; tabs opened by this run were closed afterward
  - `./scripts/screenshot.sh manifest-os https://manifestos.com` first failed, then exited OK on rerun, but visual review showed a Framer cookie panel; Playwright inspection confirmed a fixed `--framer-cookie-banner` element, and a wrapper capture with explicit consent removal replaced the local WebP
  - the first `./scripts/validate.sh` rerun failed because the original Morningstar/Business Wire mirror returned HTTP 202, the newly appended Cerebras rejection duplicated an existing slug, and the existing Perplexity brand asset was unreachable via local system DNS; switching Manifest OS to the accessible Business Wire/National Law Review source, updating the existing Cerebras rejection, and rerunning validation with a temporary `CURL_HOME` that resolved Perplexity to public Cloudflare IPs made validation pass
  - local gates passed: `./scripts/check-github-actions.sh .github/workflows/deploy.yml`, `CURL_HOME=/tmp/venturedex-curl-home ./scripts/validate.sh`, `./scripts/build-db.sh`, `npm run build`, and `git diff --check`; `d1/generated-seed.sql`, `.playwright-cli/`, and `scripts/__pycache__/` were restored or removed as verification output
  - content commit `56cdbb5` was pushed to `main`; GitHub Actions passed for Validate `25361712504` and Deploy `25361712516`
  - post-deploy live smoke passed with `./scripts/manage.sh smoke https://venturedex.co`, reporting 26 published startups

### 2026-05-06 14:29 CST

- candidate_count: 40
- accepted: 3
- rejected: 9
- rejection_bar_met: yes
- outcome: content-updated
- validation: pass
- build_db: pass
- build_app: pass
- screenshot: pass; CopilotKit and QuantWare passed the standard screenshot command, while Moment Energy required a manual Playwright-wrapper capture after visual review found a cookie banner still visible; R2 upload skipped because token lacks R2 permission
- commit_push: pass
- commit_sha: a67178e
- pushed_branch: main
- ci_deploy: pass
- failure_tags: [screenshot_env, other]
- reward: 3
- dominant_failure_mode: screenshot consent handling still depends on visual review and site-specific manual cleanup, and one bb-browser page text extraction needed a guarded retry after `document.body` was briefly null
- proposed_change: defer code-level screenshot consent cleanup; no automation-doc heuristic edit because current visual-review and failure-investigation rules covered the path
- decision: deferred
- affected_file: scripts/screenshot.sh
- affected_section: deferred outside automation-doc auto-edit regions
- evidence:
  - bootstrap succeeded for `venturedex-daily-curator`, restored repo-local `.env`, verified an active Cloudflare token, and restored `node_modules`; R2 access still lacks permission, so screenshot uploads degraded to local files
  - discovered a 40-candidate TechCrunch/current-source window and accepted CopilotKit, Moment Energy, and QuantWare after product, funding, investor, logo, screenshot, and taste verification
  - CopilotKit was accepted because its official May 5, 2026 announcement verifies a $27M Series A led by Glilot Capital, NFX, and SignalFire, while the live site and docs expose React/Angular SDKs, AG-UI, MCP Apps, GitHub docs, examples, and self-serve developer entry points
  - Moment Energy was accepted because PRNewswire and TechCrunch verify a May 5, 2026 $40M+ Series B led by Evok Innovations, while the live product pages expose Luna BESS, UL 1974 and UL 9540A certifications, commercial BESS use cases, and second-life EV battery infrastructure evidence
  - QuantWare was accepted because its official announcement verifies a May 5, 2026 $178M Series B and Bloomberg verifies Intel Capital led the round alongside FORWARD.one, while the live site exposes A-Line, D-Line, peripherals, foundry services, packaging services, VIO, and 50+ customers across 20 countries
  - recorded nine rejected decisions for Prior Labs, Corvera, Dandelion Health, Series AI, Traza, PeakMetrics, SCATR, Sygaldry, and Netomi, meeting the 3:1 rejection bar for three acceptances
  - `bb-browser` was used for product and browser-side verification of CopilotKit, Moment Energy, Corvera, Dandelion Health, QuantWare, PeakMetrics, SCATR, Sygaldry, and Netomi; tabs opened by this run were closed afterward
  - `./scripts/screenshot.sh moment-energy https://www.momentenergy.com` exited OK, but visual review showed a cookie banner; a Playwright-wrapper session clicked consent and produced a clean 1440x900 WebP before validation and build
  - a PeakMetrics `bb-browser eval` call briefly failed because `document.body` was null during page load; checking URL/title/errors and rerunning with a `document.body && ...` guard completed the product-evidence review without changing content criteria
  - local gates passed: `./scripts/check-github-actions.sh .github/workflows/deploy.yml`, `./scripts/validate.sh`, `./scripts/build-db.sh`, `npm run build`, and `git diff --check`; `d1/generated-seed.sql`, `.playwright-cli/`, and `scripts/__pycache__/` were restored or removed as verification output
  - content commit `a67178e` was pushed to `main`; GitHub Actions passed for Validate `25419997511` and Deploy `25419997513`
  - post-deploy live smoke passed with `./scripts/manage.sh smoke https://venturedex.co`, reporting 29 published startups

### 2026-05-07 14:25 CST

- candidate_count: 40
- accepted: 2
- rejected: 7
- rejection_bar_met: yes
- outcome: content-updated
- validation: pass
- build_db: pass
- build_app: pass
- screenshot: pass; Ethos passed the standard screenshot command, while Corgi required a manual Playwright-wrapper capture after the popup-safe script false-positive failed on fixed quote/partner widgets and an initial manual attempt captured the wrong page; R2 upload skipped because token lacks R2 permission
- commit_push: pass
- commit_sha: 44c80c5
- pushed_branch: main
- ci_deploy: fail in GitHub Actions; local deploy pass and live smoke pass
- failure_tags: [screenshot_env, ci_fail, other]
- reward: 2
- dominant_failure_mode: Cloudflare Wrangler deploy in GitHub Actions failed at Worker version creation with `Completion token has already been consumed [code: 100312]` after D1 sync and static asset upload had already succeeded; screenshot overlay classification still has site-specific false positives and manual-capture risks
- proposed_change: defer code-level screenshot classifier cleanup and deploy retry/hardening for Cloudflare `100312`; no automation-doc heuristic edit because current failure-investigation and downstream-rerun rules covered this path
- decision: deferred
- affected_file: scripts/screenshot.sh; scripts/manage.sh; .github/workflows/deploy.yml
- affected_section: deferred outside automation-doc auto-edit regions
- evidence:
  - bootstrap succeeded for `venturedex-daily-curator`, restored repo-local `.env`, verified an active Cloudflare token, and restored `node_modules`; R2 access still lacks permission, so screenshot uploads degraded to local files
  - discovered a 40-candidate TechCrunch/current-source window and accepted Corgi and Ethos after product, funding, investor, logo, screenshot, and taste verification
  - Corgi was accepted because TechCrunch verifies a May 6, 2026 $160M Series B led by TCV, while the live product page exposes instant startup insurance quoting, stage-based coverage paths, D&O, Cyber, Tech E&O, CGL, and customer proof from Deel, Bland, and Intryc
  - Ethos was accepted because TechCrunch verifies a May 6, 2026 $22.75M Series A led by Andreessen Horowitz, while the correct live product at `https://agent.askethos.com/` exposes paid expert opportunities, expert/client modes, voice onboarding, AI matching, and featured opportunity cards
  - recorded seven rejected or rechecked decisions for Pronto, Altara, QuTwo, DeepSeek, Genesis AI, MochaTrade, and OpenTrade, meeting the 3:1 rejection bar for two acceptances
  - `bb-browser` was used for product and browser-side verification of Corgi, Ethos, Altara, and Pronto; the incorrect `ethos.network` result was rejected in favor of the verified `askethos.com`/`agent.askethos.com` product
  - `./scripts/screenshot.sh corgi https://www.corgi.insure` failed with `popup_detected`; script review and visual checks showed fixed quote/Archetype widgets were classified as a popup, so a Playwright-wrapper capture removed those widgets and replaced the local WebP
  - the first manual Corgi screenshot attempt used an incorrect browser state and captured Ethos; visual review caught the mismatch before validation, and a second wrapper capture produced the correct Corgi 1440x900 WebP
  - local gates passed: `./scripts/check-github-actions.sh .github/workflows/deploy.yml`, `./scripts/validate.sh`, `./scripts/build-db.sh`, `npm run build`, and `git diff --check`; `d1/generated-seed.sql`, `.playwright-cli/`, `scripts/__pycache__/`, and temporary screenshot files were restored or removed as verification output
  - content commit `44c80c5` was pushed to `main`; GitHub Actions Validate `25479444429` passed, but Deploy `25479444482` failed in `bash scripts/manage.sh release` at Cloudflare API `/workers/scripts/venturedex/versions` with code `100312` after D1 sync reported 31 startups and asset upload completed for five new files
  - a targeted downstream rerun with `./scripts/manage.sh deploy` succeeded locally using Wrangler 4.82.2 and produced Worker version `04f1e668-ff6f-4505-8048-5c6416f9374a`, supporting classification as a transient Cloudflare/API or CI deploy-state failure rather than a content/configuration failure
  - post-deploy live smoke passed for both `https://venturedex.genedai.workers.dev` and `https://venturedex.co`, each reporting 31 published startups

### 2026-05-08 14:33 CST

- candidate_count: 36
- accepted: 3
- rejected: 12
- rejection_bar_met: yes
- outcome: content-updated
- validation: pass
- build_db: pass
- build_app: pass
- screenshot: pass; the standard screenshot command produced all three local WebPs, but Pit required a manual Playwright-wrapper recapture after visual review showed Cookiebot still visible; R2 upload skipped because token lacks R2 permission
- commit_push: pass
- commit_sha: 3de6951
- pushed_branch: main
- ci_deploy: pass
- failure_tags: [screenshot_env, other]
- reward: 3
- dominant_failure_mode: screenshot consent handling still depends on visual review for Cookiebot-style banners, and command-shaping mistakes around shell quoting or missing curl timeouts can create avoidable investigation noise
- proposed_change: defer code-level screenshot cleanup to add an explicit `Deny` dismissal path and avoid `bb-browser screenshot` ref overlays; no automation-doc heuristic edit because current visual-review, failure-investigation, and rerun rules covered the path
- decision: deferred
- affected_file: scripts/screenshot.sh
- affected_section: deferred outside automation-doc auto-edit regions
- evidence:
  - bootstrap succeeded for `venturedex-daily-curator`, restored repo-local `.env`, verified an active Cloudflare token, and restored `node_modules`; R2 access still lacks permission, so screenshot uploads degraded to local files
  - discovered 36 source candidates from the TechCrunch WordPress API/current startup coverage and the TechStartups May 6 funding roundup, then deduplicated prior accepted and rejected slugs before promoting fresh names
  - accepted Pit because TechCrunch verifies a May 7, 2026 $16M Seed led by Andreessen Horowitz, while `bb-browser` product review confirmed Pit Studio/Pit Cloud, workflow mapping, governance, audit trails, SSO, tenant isolation, customer evidence, and clear positioning against SaaS/no-code/in-house builds
  - accepted RadixArk because its official May 5, 2026 blog verifies a $100M Seed led by Accel and co-led by Spark Capital, while product review confirmed SGLang, Miles, OpenAI-compatible serving, disaggregated prefill/decode, speculative decoding, managed infrastructure, and hardware/platform support across NVIDIA, AMD, TPU, Ascend, XPU, and CPU
  - accepted Scout Space because PR Newswire verifies a May 6, 2026 Series A of up to $18M led by Washington Harbour Partners, while the public site and source expose Owl sensors, mission autonomy software, edge processing, data platforms, government/commercial contracts, and a 2,600-square-foot Virginia production facility
  - recorded 12 rejected or deferred decisions for Ramp, Kodiak AI, Gusto, Lovable, Kalshi, Skyroot, Moonshot AI, Braintrust, Aurora, Blitzy, Astrocade, and LiveEO, meeting the 3:1 rejection bar for three acceptances
  - District was reviewed and deferred outside `content/rejected.jsonl`: product and funding evidence cleared, but `district.net` returned HTTP 429 to the validator for official site/logo reachability, and the rejected-stage taxonomy has no accurate asset-blocker category
  - `bb-browser` was used for product and browser-side verification of Pit, District, RadixArk/SGLang, Astrocade, Blitzy, and Scout Space; when the daemon reported CDP disconnected, `bb-browser daemon stop` followed by a fresh `bb-browser open` restored operation
  - a Washington Harbour logo probe initially hung because the curl command omitted `--max-time`; the specific curl pipeline processes were killed, then the probe was rerun with a timeout and found official favicon and logo sources
  - one funding-source status command failed because an unquoted URL containing `?` triggered zsh glob parsing, and the initial TechCrunch jq helper failed due shell quoting; both were command-shaping issues corrected without changing content decisions
  - the first post-edit validation had passed, but after adding a numeric Scout Space fact the next validation failed because `editor_note` reached 510 characters; shortening it to 464 characters fixed the error and validation then passed
  - local gates passed after final edits: `./scripts/check-github-actions.sh .github/workflows/deploy.yml`, `./scripts/validate.sh`, `./scripts/build-db.sh`, `npm run build`, and `git diff --check`; `d1/generated-seed.sql`, `.playwright-cli/`, and `scripts/__pycache__/` were restored or removed as verification output
  - content commit `3de6951` was pushed to `main`; GitHub Actions passed for Validate `25540799659` and Deploy `25540799646`
  - post-deploy live smoke passed with `./scripts/manage.sh smoke https://venturedex.co`, reporting 34 published startups, and a direct homepage check showed Pit, Scout Space, and RadixArk in the live ticker

### 2026-05-10 14:13 CST

- candidate_count: 40
- accepted: 2
- rejected: 6
- rejection_bar_met: yes
- outcome: content-updated
- validation: pass
- build_db: pass
- build_app: pass
- screenshot: pass; Amperos passed the standard screenshot command, while Hilbert required a manual Playwright-wrapper recapture after `scripts/screenshot.sh` flagged an empty `DIV` false-positive overlay; R2 upload skipped because token lacks R2 permission
- commit_push: pass
- commit_sha: 34f31f4
- pushed_branch: main
- ci_deploy: pass after targeted Validate rerun; Deploy passed on the original run
- failure_tags: [screenshot_env, ci_fail, other]
- reward: 2
- dominant_failure_mode: screenshot overlay classification still false-positives on decorative/empty absolute page layers, and GitHub Actions validation can transiently fail old third-party brand-source reachability even when the same validator passes locally
- proposed_change: defer code-level screenshot classifier cleanup for empty decorative overlays and validator hardening for transient CI-only old-asset reachability; no automation-doc heuristic edit because current failure-investigation and targeted-rerun rules covered the path
- decision: deferred
- affected_file: scripts/screenshot.sh; scripts/validate.py
- affected_section: deferred outside automation-doc auto-edit regions
- evidence:
  - bootstrap succeeded for `venturedex-daily-curator`, restored repo-local `.env`, verified an active Cloudflare token, and restored `node_modules`; R2 access still lacks permission, so screenshot uploads degraded to local files
  - the user-supplied run metadata said the last run was 2026-05-09, but repo-local learning log and automation memory both last recorded a completed persistent run on 2026-05-08; dedupe was therefore based on the current repo content, rejected ledger, and memory state
  - initial TechCrunch WordPress API discovery hit a curl TLS/HTTP2 error, but `curl -Iv` confirmed the host and API were reachable; rerunning the same official API with `--http1.1` and timeouts completed without changing source criteria
  - accepted Amperos because PR Newswire verifies an Apr 22, 2026 $16M Series A led by Bessemer Venture Partners, while `bb-browser` product review confirmed AI-native insurance collections, denial management, payor workflows, corrected claims, appeals, RCM specialist escalation, integrations, customer proof, and quantified operating claims
  - accepted Hilbert because Gunderson Dettmer verifies an Apr 15, 2026 $28M Series A led by Andreessen Horowitz, while `bb-browser` product review confirmed AI-native B2C growth infrastructure, anomaly detection, root-cause analysis, counterfactuals, forecasting, pLTV targeting, and agent-driven growth tasks; the original Axios link was not used because local curl received a Cloudflare 403
  - recorded six rejected decisions for Kanvas Biosciences, Willog, Wispr Flow, Parker, Lime, and Hightouch, meeting the 3:1 rejection bar for two acceptances
  - Kanvas was rejected under F1 because the public site exposes biotech platform/pipeline/services copy but no inspectable product workflow, demo, docs, pricing, clinical access, customer workflow, or user-facing product surface
  - Willog was rejected under F3 because the source says Series B-2, which the current startup schema cannot represent without normalizing beyond the source
  - Wispr Flow, Parker, Lime, and Hightouch were rejected under F3 because the current sources were respectively a product/profile story, bankruptcy filing, IPO filing, and ARR milestone rather than fresh closed Seed-Series C financing events
  - `bb-browser` was used for product and browser-side verification of Amperos, Hilbert, and Kanvas; tabs opened by this run were closed afterward
  - `./scripts/screenshot.sh hilbert https://hilberts.ai` failed with `popup_detected` hidden inside the command substitution; `bash -x` showed the payload was one empty `DIV`, and a clean manual Playwright-wrapper capture produced the final 1440x900 WebP after visual review
  - local gates passed: `./scripts/check-github-actions.sh .github/workflows/deploy.yml`, `./scripts/validate.sh`, `./scripts/build-db.sh`, `npm run build`, and `git diff --check`; `d1/generated-seed.sql`, `.playwright-cli/`, and `scripts/__pycache__/` were restored or removed as verification output
  - content commit `34f31f4` was pushed to `main`; GitHub Actions Deploy `25621494940` passed on the original run, while Validate `25621494948` initially failed only on pre-existing Blackpeak and Touring investor brand-source reachability
  - local targeted curl checks returned HTTP 200 for the failing Blackpeak and Touring source URLs using the same validator curl shape, and a targeted rerun of the failed GitHub Validate job passed as job `75209017358`, supporting classification as transient CI-side reachability rather than a content regression
  - post-deploy live smoke passed with `./scripts/manage.sh smoke https://venturedex.co`, reporting 36 published startups, and a direct homepage check showed Amperos and Hilbert in the live ticker

### 2026-05-11 14:06 CST

- candidate_count: 40
- accepted: 2
- rejected: 6
- rejection_bar_met: yes
- outcome: content-updated
- validation: pass
- build_db: pass
- build_app: pass
- screenshot: pass; Basata required manual Playwright-wrapper recapture after visual review showed a HubSpot chat prompt despite a successful retry, and Enzo Health required manual startup-layer cleanup after `scripts/screenshot.sh` flagged an empty fixed `DIV`; R2 upload skipped because token lacks R2 permission
- commit_push: pass
- commit_sha: 809fe81
- pushed_branch: main
- ci_deploy: pass; GitHub Actions Validate `25653252570` and Deploy `25653252559` passed
- failure_tags: [screenshot_env]
- reward: 3
- dominant_failure_mode: screenshot cleanup still depends on visual review and site-specific handling for empty fixed startup layers and chat widgets that are not real modal blockers
- proposed_change: defer code-level screenshot cleanup alignment for empty fixed startup layers and HubSpot chat prompts; no automation-doc heuristic edit because the current failure-investigation, visual-review, and manual-recapture path covered the issue
- decision: deferred
- affected_file: scripts/screenshot.sh
- affected_section: deferred outside automation-doc auto-edit regions
- evidence:
  - bootstrap succeeded for `venturedex-daily-curator`, restored repo-local `.env`, verified an active Cloudflare token, and restored `node_modules`; R2 access still lacks permission, so screenshot uploads degraded to local files
  - discovered a 40-candidate TechCrunch/current-source window plus official PR/news sources, deduped prior accepted/rejected names, and promoted Basata and Enzo Health after funding, product, investor, logo, screenshot, and taste verification
  - accepted Basata because TechCrunch verifies a May 7, 2026 $21M Series A led by Basis Set Ventures, while `bb-browser` product review confirmed referral/fax processing, EHR chart creation, AI voice agents, quantified referral volume, same-day document handling, and specialty-practice workflow evidence
  - accepted Enzo Health because PR Newswire verifies a May 4, 2026 $20M Series A led by N47, while `bb-browser` product review confirmed Intake, Scribe, QA, OASIS validation, referral checks, secure messaging, 5-minute intake-to-admission claims, and customer workflow evidence
  - recorded six rejected decisions for ReFiBuy, Tessera Labs, Jetty, ROBOTERA, Boost Security, and Panthalassa, exactly meeting the 3:1 rejection bar for two acceptances
  - ReFiBuy was rejected under F4 because its agentic commerce optimization product is effectively SEO/GEO for AI shopping discovery, while Tessera Labs, Jetty, ROBOTERA, Boost Security, and Panthalassa were rejected or deferred under F3 for missing schema-compliant stage evidence, pre-seed stage, unlabeled financing, acquisition-linked funding, or ambiguous lead-investor identity
  - `bb-browser` was used for browser-side product and screenshot-failure verification of Basata, ReFiBuy, and Enzo Health; tabs opened by this run were closed afterward
  - `./scripts/screenshot.sh basata https://www.basata.ai` first failed, then `bash -x` showed the standard Playwright path could complete; visual review still found a HubSpot chat prompt, so a wrapper capture removed `#hubspot-messages-iframe-container` and produced a clean 1440x900 WebP
  - `./scripts/screenshot.sh enzo-health https://www.enzo.health` failed with `popup_detected`; `bash -x` showed one empty `DIV`, and `bb-browser` inspection traced it to fixed empty startup layers `_1be2dfv0` and `_1ln3ruo0`, so a wrapper capture removed those layers, restored `.text-intro` opacity/transform, and produced a visually reviewed 1440x900 WebP
  - local gates passed: `./scripts/check-github-actions.sh .github/workflows/deploy.yml`, `./scripts/validate.sh`, `./scripts/build-db.sh`, `npm run build`, and `git diff --check`; `d1/generated-seed.sql`, `.playwright-cli/`, and `scripts/__pycache__/` were restored or removed as verification output
  - content commit `809fe81` was pushed to `main`; GitHub Actions passed for Validate `25653252570` and Deploy `25653252559`
  - post-deploy live smoke passed with `./scripts/manage.sh smoke https://venturedex.co`, reporting 38 published startups, and a direct homepage check showed Basata and Enzo Health in the live ticker

### 2026-05-15 14:26 CST

- candidate_count: 40
- accepted: 3
- rejected: 9
- rejection_bar_met: yes
- outcome: content-updated
- validation: pass
- build_db: pass
- build_app: pass
- screenshot: pass; Origin Lab and Config used the standard screenshot path first, Origin Lab was manually recaptured after visual review showed a cookie banner, and Vapi required manual Playwright-wrapper capture after `scripts/screenshot.sh` false-positive `popup_detected` on decorative `pointer-events-none` hero layers; R2 upload skipped because token lacks R2 permission
- commit_push: pass
- commit_sha: 5e5ab74
- pushed_branch: main
- ci_deploy: pass; GitHub Actions Validate `25903762702` and Deploy `25903762669` passed
- live_smoke: pass; `./scripts/manage.sh smoke https://venturedex.co` reported 41 published startups
- failure_tags: [screenshot_env, source_incomplete, investor_identity_ambiguous, other]
- reward: 3
- dominant_failure_mode: operational friction came from environment and browser-capture edges: the first bootstrap stalled in `sharp` install probing until rerun with `SHARP_IGNORE_GLOBAL_LIBVIPS=1`, GitHub GraphQL preflight hit a transient TLS handshake timeout, and screenshot cleanup still misclassifies decorative absolute layers or misses consent banners without visual review
- proposed_change: apply a narrow screenshot retry clarification for decorative `pointer-events-none`/empty fixed layers and consent/chat widgets; defer bootstrap-level `sharp` environment hardening because that would touch script behavior outside automation-doc heuristic text
- decision: applied
- affected_file: docs/automation/venturedex-daily-runbook.md; scripts/bootstrap-automation.sh
- affected_section: `Adaptive Heuristics` / `Operational Heuristics`; bootstrap hardening deferred outside automation-doc auto-edit regions
- evidence:
  - bootstrap was required and did run before discovery; the first attempt restored repo-local `.env`, verified an active Cloudflare token, reported no R2 permission, then stalled during `npm ci` in `node_modules/sharp/install/check.js`
  - root cause for the bootstrap stall was environment-specific `sharp` global-libvips probing: `node node_modules/sharp/install/check.js` timed out locally, while `SHARP_IGNORE_GLOBAL_LIBVIPS=1 node node_modules/sharp/install/check.js` exited cleanly; after killing the stuck bootstrap/npm/sharp processes, the full bootstrap rerun with that env completed
  - the original bootstrap also hit `Post "https://api.github.com/graphql": net/http: TLS handshake timeout`; `gh auth status` and a targeted `./scripts/check-github-actions.sh .github/workflows/deploy.yml` rerun passed, so this was classified as a transient external GitHub/API reachability issue rather than auth or workflow drift
  - discovered a 40-candidate current TechCrunch API window, deduped existing startups and rejected slugs, and promoted Vapi, Origin Lab, and Config after funding, product, investor, logo, screenshot, and taste checks
  - accepted Vapi because TechCrunch verifies a May 12, 2026 $50M Series B led by Peak XV Partners, while `bb-browser` product review confirmed voice-agent workflows, tool integrations, enterprise controls, Ring customer proof, 1B calls, 2.5M+ agents, 750K developers, and sub-500ms latency claims
  - accepted Origin Lab because TechCrunch verifies a May 13, 2026 $8M seed led by Lightspeed Venture Partners, while `bb-browser` product review confirmed licensed game-engine data, HUD-free video, depth/action/camera/scene metadata, 20+ metadata categories, 50+ titles, same-day API access, and rights/audit-trail positioning
  - accepted Config because TechCrunch verifies a May 11, 2026 $27M seed led by Samsung Venture Investment, while `bb-browser` product review confirmed the Config Data Platform, 9-stage robot-data workflow, CFG-1, 100K in-house human-data hours, 2B parameters, and sub-50ms RTX 5090 latency
  - recorded nine rejected decisions for Wirestock, Dessn, Exaforce, Synthetic, Mind Robotics, Cowboy Space, Anduril, Helsing, and Redwood Materials, meeting the 3:1 rejection bar for three acceptances
  - Wirestock was rejected under F3 because the Nava Ventures lead identity could not be cross-validated against an official investor website or existing directory entry; Dessn, Exaforce, Mind Robotics, Anduril, Helsing, and Redwood Materials were rejected for source/schema completeness issues; Synthetic and Cowboy Space were rejected under F1 for insufficient current product evaluability
  - `bb-browser` was used for product and browser-side verification of Vapi, Wirestock, Config, Origin Lab, Synthetic, Mind Robotics, Cowboy Space, and Exaforce; automation-opened tabs were closed after verification
  - `./scripts/screenshot.sh vapi https://vapi.ai` failed with `popup_detected`; `bb-browser` overlay scoring showed decorative `pointer-events-none absolute inset-* z-20/z-30` hero layers, not a modal blocker, and a clean 1440x900 Playwright-wrapper recapture was visually reviewed before writing `public/screenshots/vapi.webp`
  - local gates passed: `./scripts/check-github-actions.sh .github/workflows/deploy.yml`, `./scripts/validate.sh`, `./scripts/build-db.sh`, `npm run build`, and `git diff --check`; `d1/generated-seed.sql`, `.playwright-cli/`, and `scripts/__pycache__/` were restored or removed as verification output
  - content commit `5e5ab74` was pushed to `main`; GitHub Actions passed for Validate `25903762702` and Deploy `25903762669`
  - post-deploy live smoke passed with `./scripts/manage.sh smoke https://venturedex.co`, reporting 41 published startups
