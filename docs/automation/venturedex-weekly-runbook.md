# VentureDex Weekly Runbook

This file defines the weekly research digest workflow. It is separate from the daily curation run.

## Precedence

Editorial authority comes from:

1. `content/STANDARD.md`
2. `content/CODEX_TASK.md`
3. this file

If this file conflicts with the first two, this file is wrong.

## Immutable Guards

Automation must never rewrite this section.

- Weekly issues use already published `content/startups/*.json` records.
- The weekly workflow may create or update `content/weekly/*.json`; it must not add new startups.
- Published weekly issues must not contain TODO text.
- Published weekly issues should use the startup record's structured `research` block when available, especially `product_evidence`, `market_context`, `risks`, and `sources`.
- The Weekly draft scaffold should carry structured startup research sources and product evidence forward, but draft TODO fields are not publication-ready copy.
- Published weekly evaluations must be source-bound. Do not infer users, revenue, retention, market share, customer migrations, reliability, or benchmark claims unless a cited source states them.
- If evidence is insufficient, keep the issue as `status: draft` or defer the claim.
- Browser-driven source checks must use the [`bb-browser`](/Users/dai/.codex/skills/bb-browser/SKILL.md) workflow.
- Do not manually trigger Weekly newsletter delivery during the publishing run. The email send is intentionally delayed by the newsletter system so the live issue can be corrected first.

## Cadence

- Create a draft every Monday for the previous Monday-Sunday window.
- A GitHub Actions workflow runs `scripts/weekly.py draft` and opens a draft PR when there is a new issue file.
- Publishing is a review step: replace TODO fields with source-bound research, set `status` to `published`, set `published_at`, and merge only after local gates pass.
- Newsletter delivery is a separate post-publish step governed by `docs/newsletter.md`. The default Weekly email delay is 24 hours after the issue is published.

## Weekly Execution

1. Compute the previous full week.
2. Run:

   ```bash
   python3 scripts/weekly.py draft --week-start YYYY-MM-DD --week-end YYYY-MM-DD --write
   ```

3. Review candidate picks. Prioritize startups newly added or updated in the week; if fewer than 5 qualify, add related high-rating published startups and explain the theme link.
4. For every pick, review the VentureDex startup file, its `research` block, official product surface, and linked source URLs.
5. Write `why_this_week`, `product_evaluation`, `evidence`, `risks`, and `verdict`.
6. Remove every TODO and set:

   ```json
   {
     "status": "published",
     "published_at": "YYYY-MM-DD"
   }
   ```

7. Run local gates:

   ```bash
   python3 scripts/weekly.py validate
   ./scripts/manage.sh validate
   git diff --check
   ```

8. Restore `d1/generated-seed.sql` and generated cache artifacts if validation changed them locally.
9. Verify `/weekly` and `/weekly/{N}` in a browser before publish.
10. Commit with:

   ```bash
   git commit -m "content: weekly #N - {title}"
   ```

11. Push only after the worktree contains no unrelated changes and all gates pass.

## Review Passes

1. Source: every factual claim links back to a VentureDex record, structured startup research entry, official page, or cited source.
2. Scope: no new startup, logo, screenshot, schema, or deployment change is mixed into a weekly content PR unless explicitly requested by a human.
3. Objectivity: the issue states evidence gaps instead of guessing.
4. Theme: the 5-7 picks share a real product or market pattern.
5. Release: local gates pass, generated verification outputs are restored, and browser verification confirms `/weekly` and the issue page render the research fields.
6. Newsletter readiness: the issue has stable published copy, because the Weekly email will reuse `editorial_intro`, `research_summary`, themes, and pick evaluations.
