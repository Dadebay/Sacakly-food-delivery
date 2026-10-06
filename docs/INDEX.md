# Saçakly documentation index

Start each task with [Project context](PROJECT_CONTEXT.md) and
[Change history](CHANGELOG.md). Read [Infrastructure](INFRASTRUCTURE.md) for
runtime and CI changes and [Deployment](DEPLOYMENT.md) before any release work.

- [Cafe onboarding](CAFE_ONBOARDING.md): OWNER setup, merchant preparation, publication, reports and printer acceptance.
- [Onboarding QA](CAFE_ONBOARDING_QA.md): browser checks and verification evidence.
- [Roadmap](ROADMAP.md): implemented features and work before onboarding cafes.
- [Monorepo](MONOREPO.md): application boundaries and root install, run and verification commands.
- [Browser E2E](PLAYWRIGHT_E2E.md): isolated Playwright setup, coverage and limits.
- [Mobile handoff](mobile/README.md): two app boundaries, shared API/auth/push rules;
  [customer app](mobile/CUSTOMER_APP.md) and [courier app](mobile/COURIER_APP.md).
- [Receipt queue](RECEIPT_QUEUE.md): durable print behavior inherited from the
  legacy system; current cafe isolation is in project context.
- [Legacy source context](legacy/PROJECT_CONTEXT.md): historical A7 decisions,
  not current Saçakly policy.

Feature-specific QA notes are in this directory. The repository's `AGENTS.md`
requires a new change-history entry in every pull request.
