# TODO: Build a 1:1 clone of ona.com

_Last researched: April 7, 2026 (UTC)._
_Last updated for long-term feasibility: April 7, 2026 (UTC)._

## Research summary (what to clone)

Based on manual review of `https://ona.com/` and core marketing pages, Ona is currently positioned as a platform for background agents. The public site pattern to clone is:

- Top navigation with grouped product/resource links, auth link, and primary CTA.
- Hero section with strong headline + short support copy + dual CTA.
- Trust/social proof strip (customer logos / tenure labels).
- Multi-block feature narrative (media + heading + copy + CTA repeated by use case).
- Quantified outcomes section (metrics + testimonial style proof).
- Enterprise trust/compliance section.
- Recent content/blog cards.
- Final CTA and a dense, multi-column footer with legal/trust links.

## Definition of "1:1 clone" for this project

For this repo, "1:1 clone" means:

- **High visual parity**: same section order, spacing rhythm, typography hierarchy, and CTA placement.
- **High structural parity**: same information architecture and responsive behavior patterns.
- **Equivalent interaction quality**: nav/menu/focus/hover/motion behaviors feel the same.
- **No proprietary infringement**: replace assets/copy that cannot be reused legally.

## Guardrails and non-goals

- Do **not** clone private Ona product functionality (agent runtime, auth internals, billing, dashboards).
- Do **not** scrape or reuse protected logos/media unless explicit rights exist.
- Do **not** hardcode copy/assets into layout components; keep content data-driven.
- Do **not** optimize prematurely for pixel-perfect parity before responsive and accessibility parity are stable.

---

## Multi-horizon plan (feasible for months/years)

## Horizon 1 — MVP parity (Weeks 1–6)

### Week 1: Baseline and scope lock
- [ ] Capture date-stamped desktop/tablet/mobile reference screenshots.
- [ ] Create a parity checklist per section (layout, spacing, CTA placement, IA).
- [ ] Decide legal-safe content substitutions (logos/testimonials/blog snippets).

### Week 2: Architecture and content modeling
- [ ] Define homepage section schema and typed content model.
- [ ] Create centralized content config for nav, features, metrics, blog cards, footer links.
- [ ] Add initial placeholder data and enforce schema validation.

### Week 3: Design tokens and primitives
- [ ] Implement token system (colors, spacing, typography, radii, borders, shadows).
- [ ] Build reusable primitives (`Section`, `Container`, `Button`, `LogoRow`, `FeatureBlock`, `MetricCard`, `FooterColumn`).
- [ ] Verify breakpoint behavior and max-width/container consistency.

### Week 4: Core page assembly
- [ ] Implement header/nav + hero + trust strip.
- [ ] Implement feature narrative blocks and metrics/testimonial block.
- [ ] Implement enterprise section + blog cards + final CTA + footer.

### Week 5: Interaction and accessibility hardening
- [ ] Add hover/focus/active states and keyboard-first nav behavior.
- [ ] Respect `prefers-reduced-motion` and validate focus visibility.
- [ ] Fix heading hierarchy, landmarks, and image alt-text coverage.

### Week 6: Quality gates and launch prep
- [ ] Add/update Playwright smoke + visual parity checks.
- [ ] Run Lighthouse/Unlighthouse and fix high-impact regressions.
- [ ] Ship MVP clone behind a preview/staging environment.

**MVP exit criteria:**
- [ ] All major sections present in correct order and responsive across 3 breakpoints.
- [ ] No critical accessibility violations in automated checks.
- [ ] Visual diffs are stable and intentional.

---

## Horizon 2 — Production hardening (Months 2–3)

- [ ] Add robust metadata/OG/Twitter/canonical setup and JSON-LD.
- [ ] Add analytics for top CTA interactions and section engagement.
- [ ] Add synthetic uptime checks and post-deploy verification playbook.
- [ ] Improve performance budget enforcement (LCP/CLS guardrails in CI).
- [ ] Add content governance docs: who updates copy, cadence, and review checklist.

**Hardening exit criteria:**
- [ ] Repeatable release checklist exists and is used.
- [ ] Performance and accessibility baselines tracked per release.
- [ ] Deployment/rollback runbook validated at least once.

---

## Horizon 3 — Long-term maintainability (Quarterly / ongoing)

### Quarterly parity review
- [ ] Re-audit ona.com structure and identify drift from our clone baseline.
- [ ] Categorize drift: critical (IA break), medium (layout/visual), low (copy-only).
- [ ] Plan parity refreshes in small PRs rather than large rewrites.

### Design-system and code health
- [ ] Keep primitives composable and avoid one-off section-specific CSS.
- [ ] Refactor duplicated patterns into shared components each quarter.
- [ ] Track technical debt backlog (responsive bugs, animation consistency, flaky visual tests).

### Content and legal operations
- [ ] Revalidate asset licensing and trademark-safe replacements during major updates.
- [ ] Archive prior snapshots and decisions for auditability.
- [ ] Reconfirm acceptable-use boundaries before major redesign cycles.

### Observability and quality lifecycle
- [ ] Keep visual regression snapshots up-to-date and review false positives monthly.
- [ ] Monitor web vitals trends and address regressions before feature additions.
- [ ] Review analytics quarterly to improve CTA clarity without breaking parity goals.

---

## Suggested implementation order in this repository

1. Build a homepage clone scaffold in the marketing route.
2. Add reusable primitives under `src/components/`.
3. Add clone content config/types in a dedicated data module.
4. Wire responsive nav and interactions.
5. Add/update visual + smoke tests.
6. Add SEO metadata and structured data.
7. Add CI gates for a11y/perf/visual stability.

## Acceptance criteria (project-wide)

- [ ] Desktop/tablet/mobile rendering matches target section rhythm and IA.
- [ ] Navigation, CTA flow, and footer grouping mirror the target user journey.
- [ ] Accessibility checks remain free of critical issues in CI.
- [ ] Performance budgets and visual regression baselines are enforced.
- [ ] The plan supports incremental updates for at least 12+ months without full rewrites.

## Risk register and mitigations

- **Legal/trademark risk:** maintain substitution list + approval checklist before release.
- **Reference drift risk:** date-stamped baseline + quarterly parity review process.
- **Scope creep risk:** lock MVP scope to homepage parity before secondary pages.
- **Maintenance risk:** enforce data-driven content model and shared primitives.
- **Test fragility risk:** keep visual tests focused on stable regions + documented tolerances.
