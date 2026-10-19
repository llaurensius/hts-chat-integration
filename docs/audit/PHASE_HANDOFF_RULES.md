# Phase Handoff Rules

## Before Starting Any Phase

1. Read `IMPLEMENTATION_MASTER_PLAN.md`.
2. Read `FINDINGS_REGISTER.md`.
3. Read the current `IMPLEMENTATION_STATUS.md`.
4. Inspect `git status`, recent commits, and all local changes. Never overwrite unrelated work.
5. Confirm required human decisions for the selected scope.
6. Define acceptance criteria and regression tests before editing.
7. Confirm whether the work touches production data, secrets, migrations, external APIs, or customer messages.

## Implementation Rules

- Backend authorization is mandatory; UI visibility is not security.
- No migration or destructive data operation without backup, preflight, rehearsal, and rollback plan.
- Never print secrets, tokens, passwords, cookies, customer message contents, or personal data.
- Never send real customer messages during tests.
- Use mocks/fixtures for Evolution API and HTS unless explicitly approved.
- Preserve existing user-visible features unless a business decision changes them.
- Do not expand scope because of an unclassified observation.
- Register new findings before implementing beyond approved scope.
- Mark a finding `DONE` only after code, tests, and evidence satisfy its criteria.

## After Completing a Phase

1. Run the declared tests and safe baseline checks.
2. Review diff and ensure only intended files changed.
3. Update finding statuses and link evidence.
4. Record residual risks and blocked decisions.
5. Update `IMPLEMENTATION_STATUS.md`.
6. Add a concise phase handoff note with:
   - changes,
   - tests,
   - known failures,
   - migration/data impact,
   - rollback procedure.
7. Stop and request review before starting the next phase.

## New Findings and Priority Changes

- Assign a stable ID using the category prefix and next unused number.
- Record source file/line, reproduction, impact, confidence, and proposed test.
- Mark `CONFIRMED`, `POTENTIAL`, `QUESTION`, or `OPTIONAL` in the finding notes.
- Do not close an existing finding merely because a related change was made.
- If a new Critical/High issue appears, pause scope expansion and re-evaluate priority.
- If findings conflict, preserve both evidence records and ask for a business/technical decision.

## Blocked Work

- Mark the finding/phase `BLOCKED`.
- State the exact missing decision, environment, fixture, or access.
- Do not guess business rules.
- Do not substitute a frontend workaround for a backend/security control.
- Resume only after the blocker is resolved or formally accepted as risk.

## Completion Definition

A phase is complete only when:

- all in-scope findings have a final status;
- acceptance criteria pass or an explicit accepted-risk record exists;
- regression tests pass or failures are documented;
- migration/destructive impact is reviewed;
- evidence is reproducible by another engineer;
- next-phase dependencies are clear.
