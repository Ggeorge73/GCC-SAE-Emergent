# Law Suite

**Evidence before delivery.** A legal work product review prototype for consequential US matters.

Law Suite connects evidence records, unresolved exceptions, accountable decisions, and handoff requirements. It helps a team inspect what supports a draft and what still needs attention before supervising counsel relies on it.

This is an independent prototype. All Matter Review excerpts, names, and amounts are fictional. It does not provide verified research, enforced ethical walls, authenticated reviewer identity, or readiness for filing. No superiority over another legal AI product has been established.

[Published site](https://ggeorge73.github.io/Law-Suite/) — follows the verified main deployment; branch changes remain previews until merged.

## Product surfaces

| Surface | Implemented | Boundary |
|---|---|---|
| Dashboard | Two-by-two portfolio metrics, practice summary, animated blue particle Lady Justice, and illustrative reviewer/research activity; metric and practice links into filtered matter directories | Summary only; all counts derive from local sample records |
| Matter Review | Searchable, filtered, sortable directory with 12-row pages; dedicated matter URLs; three US scenarios; saved notes and assignments; full sample sources; version comparisons and dependent review invalidation; working drafts; reference inspection; participant-stamped checks; partner approval; HTML memorandum and JSON export; internal targets | Browser-local fictional data. Survives navigation and refresh; Reset demo clears it. Comparisons and source links are scripted. Text imports check identifiers/versions only, without AI or legal verification |
| Firm Operations | Sample charts, identity filters, sample access review, recommendation state, filtered CSV export | No live identity provider, telemetry, permissions changes, or persistence |
| Research & Documents | Fictional source library with local excerpt search, versioned source previews, and contextual draft/review navigation. Optional local FastAPI prototype for matter metadata, bounded storage, unverified model drafts | Library search uses browser-local fixtures only. Data API disabled by default; no authentication/tenancy, extraction, legal retrieval, citator, or immutable audit |

Evidence quality, work ownership, and internal approval are separate. Save or escalate blocked findings; supported findings can be reviewed, while unsupported propositions require resolution or explicit exclusion from reliance. Exclusions remain visible in drafts and exports and do not turn missing evidence into verified evidence. Outstanding assignments require an explicit task resolution. Complete prerequisites and select the simulated partner to approve the internal memorandum. Source or draft changes revoke affected reviews and approval. No action files or sends work product.

## Handoff redesign

The new Vision UI handoff is implemented in the review branch, with all 32 reference routes adapted to Law Suite: attorney profiles, teams, portfolios, reports, account preferences, sample billing, engagement services, intake, calendar, coordination board, analytics, and six account-access layouts. Existing matter review and research pages share the glass design system. New interactions are local demonstrations; no live authentication, calendar, billing, or messaging service is introduced. See [the handoff implementation](docs/VISION_HANDOFF.md) for the route mapping, assets, and verification scope.

## Assessment and roadmap

- [Lady Justice artwork](docs/LADY_JUSTICE_HERO.md): dashboard animation, reference adaptation, and motion accessibility.

- [Workspace UI design](docs/UI_DESIGN.md): reference palette, application coverage, and validation scope.

- [Delivery plan](docs/DELIVERY_PLAN.md): Scrum team, five sprints and Definition of Done for the firm workspace and client portal.
- [Requirements review and end-to-end results](docs/REQUIREMENTS_REVIEW.md): capability against the one-stop firm workspace goal.
- [Codebase, website, and competitive review](docs/LAW_SUITE_REVIEW.md): findings, original positioning, US firm priorities, architecture, and evaluation plan.
- [Security and governance](docs/SECURITY_AND_GOVERNANCE.md): boundaries and production requirements.
- [Product case study](docs/PRODUCT_CASE_STUDY.md): review logic and discovery hypotheses.
- [Demo script](docs/DEMO_SCRIPT.md): walkthrough.
- [AI-assisted development](docs/AI_ASSISTED_DEVELOPMENT.md): development history and contribution boundaries.

## Run the preview

From frontend, run npm ci --legacy-peer-deps, then npm start. Open http://localhost:3000. Leave REACT_APP_BACKEND_URL unset to reproduce the public preview and disconnected-research screen. Matter Review and Firm Operations need no database or AI credentials.

## Optional local backend

Create/activate a Python virtual environment and install backend/requirements-ci.txt. Copy backend/.env.example to backend/.env, configure local MongoDB, and explicitly set LAW_SUITE_ALLOW_LOCAL_DEMO=true for isolated synthetic-data development. Run uvicorn backend.server:app --host 127.0.0.1 --port 8001 from the repository root. Set REACT_APP_BACKEND_URL=http://127.0.0.1:8001 in the frontend local environment and restart it.

The opt-in is not authentication. Never expose this API through a public reverse proxy. Keep LAW_SUITE_AI_MODE=offline for tests. Live drafts require a managed Gemini credential and explicit live mode; they remain unverified. Model conversations are request-scoped until authenticated history exists.

Uploads are limited to 10 MiB, hashed from bytes, and marked stored rather than indexed. Public and external-storage registration are rejected. Firebase helper code is dormant pending an authorized storage service.

## Sign in with a live API

Firm accounts, sign-in and roles work when the frontend points at the API. For a throwaway local run with no database, start the API with MONGO_URL=memory from the repository root: `MONGO_URL=memory CORS_ORIGINS=http://localhost:3000 uvicorn backend.server:app --port 8001`. Then start the frontend with REACT_APP_BACKEND_URL=http://127.0.0.1:8001 and open the sign-up page to create a firm. In this mode every workspace page requires sign-in, and the header shows the signed-in person, firm and role. The Firm workspace page shares matters, members, tasks and ethical walls across the firm; admins and partners create one-time invitation codes that colleagues redeem on the Join with invitation page. In-memory records disappear when the API stops. The legacy deal-room endpoints remain behind LAW_SUITE_ALLOW_LOCAL_DEMO until they are retired. See [the delivery plan](docs/DELIVERY_PLAN.md).

## Verification commands

- python -m unittest discover -s tests -p "test_*.py"
- python -m py_compile backend/server.py backend/research_safety.py backend_test.py
- In frontend: npm run build
- In frontend: npm test -- --watchAll=false --runInBand
- In frontend: npx playwright install chromium, then npm run test:e2e
- In frontend: npm run test:e2e:server (starts the API with an in-memory store; needs backend/requirements-ci.txt installed)

Boundary tests use fake persistence. The separate backend_test.py harness exercises a disposable MongoDB API in CI. RUN_LIVE_AI_TESTS=true adds a provider contract smoke test, not legal-accuracy evaluation. Build, browser tests, and backend integration must pass before Pages deployment on main.

## Production next step

Implement authenticated matter-scoped persistence and versioned source ingestion before real documents. Then validate primary-law retrieval, issue resolution, and server-enforced decisions with supervising lawyers. See the assessment for sequencing and proposed success criteria; they are not delivered capabilities or measured results.
