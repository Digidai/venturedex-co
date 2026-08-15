# Launch Card Refinement Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Turn the VentureDex launch directory into a compact four-column video-card catalog whose media and descriptive information read as one component.

**Architecture:** Keep the existing Astro data flow and lazy video loader. Refactor the shared server-rendered component and its equivalent client renderer to one full-card anchor, then replace the page-level card/grid CSS with a responsive compact-card system.

**Tech Stack:** Astro, TypeScript browser script, CSS Grid, native video, Node test runner, Playwright CLI.

---

### Task 1: Unify card markup

**Files:**
- Modify: `src/components/LaunchCard.astro`
- Modify: `src/pages/launches.astro`

**Step 1:** Change the Astro card to use one anchor containing both the media and content regions, with no nested links.

**Step 2:** Limit visible public tags to three and replace the large footer link with a compact non-link action label inside the card anchor.

**Step 3:** Apply the same DOM structure and three-tag limit in the client-side `renderCard` path used after search, filtering, and pagination.

**Step 4:** Run `npm run typecheck`; expect zero errors.

### Task 2: Implement the compact responsive visual system

**Files:**
- Modify: `src/pages/launches.astro`

**Step 1:** Change the wide grid from three lattice columns to four guttered columns.

**Step 2:** Add a single bordered/rounded card shell, compact spacing, a two-line title clamp, a one-line identity, a clipped three-tag row, and a small action row.

**Step 3:** Add unified hover and focus-visible states plus 3/2/1-column breakpoints.

**Step 4:** Run focused tests and `npm run build`; expect successful generation of the launch index and all detail routes.

### Task 3: Visual and release verification

**Files:**
- Verify: `src/pages/launches.astro`
- Verify: `src/components/LaunchCard.astro`

**Step 1:** Open the local production preview at 1440×900 and verify four columns, loaded video covers, consistent card heights, and internal card links.

**Step 2:** Verify 900px and 390px layouts, including no horizontal overflow and a usable focus target.

**Step 3:** Run `bash scripts/manage.sh validate` and `git diff --check`; expect the complete gate to pass.

**Step 4:** Stage only the plan and launch-card files, commit, push, merge after CI, wait for the exact-main-SHA deploy, and repeat the live browser smoke.
