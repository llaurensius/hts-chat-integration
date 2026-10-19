# Implementation Master Plan

Status: HANDOFF READY / IMPLEMENTATION NOT STARTED  
Scope: Phase 1-4 audit consolidation  
Date: 2026-10-19

## 1. Source Coverage

| Phase | Availability | Source |
|---|---|---|
| Phase 1 | INCOMPLETE as standalone artifact; findings available in working context | Repository inspection, baseline commands |
| Phase 2 | INCOMPLETE as standalone artifact; findings available in working context | Bug and business-logic audit |
| Phase 3 | INCOMPLETE as standalone artifact; findings available in working context | Database, relation, authentication, authorization, security audit |
| Phase 4 | INCOMPLETE as standalone artifact; findings available in working context | UI/UX audit and master improvement plan |

Existing repository documents are reference material, not proof that findings are fixed. In particular, `docs/QA_and_Quality.md` and `docs/summary.md` contain completion claims that were not accepted as verification without current code/test evidence.

## 2. Architecture and Protected Features

Actual stack:

- Backend: Node.js, Express, Prisma, PostgreSQL, Socket.IO.
- Frontend: React, Vite, React Router, Tailwind, Socket.IO client.
- Integrations: Evolution API/WhatsApp and external HTS portal.
- Storage: PostgreSQL records, local `backend/uploads`, Redis for Evolution API.

Primary flow:

1. Evolution API sends an authenticated webhook.
2. Backend resolves customer, active ticket, media, and message.
3. Backend persists data and emits realtime events.
4. Frontend reads REST data and Socket.IO updates.
5. Agents reply through Evolution API.
6. L1/authorized roles assign, link, create, solve, and close HTS work.

Features to preserve during remediation:

- WhatsApp inbound/outbound messaging and message deduplication.
- Customer identity/master-data precedence.
- General chat versus technical complaint classification.
- Multi-category assignment and L2 resolution workflow.
- Internal notes and internal media confidentiality.
- Multi-HTS linking, PIC completion, solve, unlink, and reconciliation.
- JWT/RBAC, webhook authentication, rate limiting, Helmet, path safety.
- Socket.IO realtime updates.
- Quick replies, contact import, start-new-chat, reopen, reports, FRT/MTTR.
- File retention worker and graceful shutdown.

No feature is considered preserved until regression evidence exists.

## 3. Priority Model

- **P0:** active security exposure, likely data loss, unreproducible deployment, or unauthorized mutation. Block production implementation beyond containment.
- **P1:** integrity/reliability defects that can duplicate, lose, or desynchronize business data.
- **P2:** correctness, UX, accessibility, performance, and maintainability defects after P0/P1 controls.
- **P3:** optional polish or optimization requiring baseline evidence.

## 4. Implementation Order

### Phase 5 - Security containment

Scope: SEC-001 through SEC-010. Rotate secrets, protect uploads, remove encryption fallback, remove query-token auth, scope socket events, enforce object authorization, and fix sensitive logging.

Dependencies: security decisions in `PHASE_HANDOFF_RULES.md`.  
Exit: no unmitigated Critical/High security finding; authorization matrix passes.

### Phase 6 - Schema and migration reconciliation

Scope: DB-001, DB-002, DB-003, DB-004, DB-005, DB-006, DB-008, DB-009.

Dependencies: business decisions on active tickets, HTS ownership, legacy fields, and deletion.  
Exit: fresh install and upgrade rehearsal match `schema.prisma`; destructive operations have backup/rollback.

### Phase 7 - Ticket and HTS state integrity

Scope: BUG-005, BUG-020, BUG-021, BUG-022, BUG-023, BUG-024, DB-007, DB-013.

Dependencies: Phase 6 constraints and transition matrix.  
Exit: invalid transitions and cross-parent operations rejected atomically.

### Phase 8 - Webhook and outbound reliability

Scope: BUG-001, BUG-006, BUG-007, BUG-008, BUG-009, BUG-010, BUG-011, BUG-012, BUG-013, BUG-014.

Dependencies: Phase 6 invariants; provider idempotency behavior.  
Exit: crash/retry/timeout tests show no silent loss or duplicate external operation.

### Phase 9 - SLA and reporting correctness

Scope: BUG-015, BUG-016, BUG-017, BUG-018, DB-011, SEC-020.

Dependencies: approved SLA definitions and status event model.  
Exit: fixture-based FRT/MTTR tests pass, including internal notes and reopen cycles.

### Phase 10 - Import, upload, and data lifecycle hardening

Scope: SEC-013, SEC-014, SEC-016, DB-010, DB-008, DB-009.

Dependencies: private attachment model and deletion policy.  
Exit: file/parser abuse tests pass; bulk operations are bounded and auditable.

### Phase 11 - UI permission and workflow alignment

Scope: UX-001, UX-002, UX-003, UX-004, UX-005.

Dependencies: finalized backend permission matrix.  
Exit: no routinely visible action produces expected `403`; direct API security remains independent.

### Phase 12 - UI states and destructive-action safety

Scope: UX-006, UX-007, UX-008, UX-009, UX-010.

Dependencies: reliable API error contracts.  
Exit: loading, empty, error, retry, pending, offline, and destructive confirmation flows are tested.

### Phase 13 - Accessibility and responsive UX

Scope: UX-011, UX-012, UX-013, UX-014, UX-015, UX-016.

Dependencies: stable UI workflows.  
Exit: keyboard, screen-reader smoke, contrast, focus, mobile, and zoom checks pass.

### Phase 14 - Frontend maintainability

Scope: UX-017, UX-018, UX-019.

Dependencies: regression suite before component extraction.  
Exit: feature modules and shared primitives preserve behavior; lint baseline improves.

### Phase 15 - Performance

Scope: PERF-001, PERF-002, PERF-003.

Dependencies: measured baseline and production-like dataset.  
Exit: pagination/query/bundle improvements have before/after measurements.

### Phase 16 - Test and observability completion

Scope: all unresolved findings and coverage gaps.

Dependencies: implementation phases.  
Exit: CI checks migrations, security, API contracts, UI accessibility, and critical workflows.

### Phase 17 - Deployment rehearsal

Scope: migration, secrets, Docker, backup/restore, health checks, webhook, provider failure.

Dependencies: Phases 5-16.  
Exit: staging rehearsal and rollback evidence.

### Phase 18 - Production readiness review

Scope: residual risk acceptance, runbooks, monitoring, final regression.

Dependencies: human approval of all business questions and residual risks.  
Exit: explicit go/no-go decision; no automatic production change.

## 5. Acceptance Gates

- No secret values in repository, documentation, logs, or test output.
- Every mutation has authentication, role, resource, parent, and state checks.
- Attachments are private and ticket-authorized.
- Socket events are scope-authorized.
- Webhook/outbound/HTS operations are idempotent or visibly reconcilable.
- Fresh and upgrade migrations are reproducible.
- SLA definitions are approved and tested.
- UI never replaces backend authorization.
- Critical role flows work on desktop, mobile, keyboard, and error paths.
- No finding is closed without linked test output or review evidence.

## 6. Human Decisions Required

1. One active ticket per customer: yes/no.
2. One HTS number linked to multiple local tickets: yes/no.
3. Source of truth for HTS status: portal/local/hybrid.
4. Roles allowed to read internal notes, reports, HTS, and auto-reply settings.
5. Behavior when sending to `CLOSED`.
6. FRT definition, BOT treatment, business hours, timezone, and reopen handling.
7. Attachment retention and access policy.
8. Whether force delete and sequence reset may exist in any environment.
9. Production migration strategy and backup retention.

## 7. Not Yet Verified

- Runtime browser behavior and screenshots.
- Production DB schema/data and migration history.
- Live Evolution API and HTS portal behavior.
- Multi-process deployment behavior.
- Real attachment/media security behavior behind reverse proxy.
- Browser/screen-reader/forced-colors compatibility.
- Provider retry/status contract.

## 8. Consolidated Counts

The register contains 67 stable findings:

| Severity | Count |
|---|---:|
| Critical | 4 |
| High | 33 |
| Medium | 29 |
| Low | 1 |

| Category | Count |
|---|---:|
| Security | 16 |
| Database/integrity | 13 |
| Bug/business logic | 21 |
| UI/UX | 14 |
| Performance | 3 |
