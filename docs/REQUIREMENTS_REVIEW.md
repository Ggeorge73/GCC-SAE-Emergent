# Requirements review and end-to-end results

Reviewed 2026-10-07 against the product goal: a one-stop workspace where lawyers plan and execute work, collaborate across the firm, and collaborate with clients without leaving the site, for firms of different sizes.

## Test results

| Suite | Result |
|---|---|
| Production build | Pass |
| Frontend unit tests | 15 / 15 pass |
| Backend unit and boundary tests | 22 pass, 1 skipped (live AI) |
| Browser end-to-end (existing journeys) | 66 / 66 pass |
| Browser end-to-end (new: every navigable page renders without errors) | 34 / 34 pass |

Two additional probe journeys were run and not committed:

- A comment posted by one lawyer was **not** visible to a second lawyer on another browser.
- The matter workspace opens without signing in; sign-in pages do not mention or route clients.

## Capability against the goal

| Requirement | Status | Evidence |
|---|---|---|
| Plan work | Partial | Matter intake with conflicts and engagement steps, legal calendar, review board, matter timeline, portfolios. All browser-local. |
| Execute work | Strong for a prototype | Matter Review (evidence, exceptions, drafts, partner approval, memo export), research library, time entries, reviewed invoices, backup and restore. |
| Collaborate across the firm | Missing | All records live in one browser's `localStorage`. No user accounts, no shared server data, no notifications delivered. Team comments are always attributed to "Maya Chen"; reviewers and assignees are simulated. |
| Collaborate with clients on the site | Missing | No client login or portal. "Client updates" are internal drafts approved and downloaded as `.txt`, marked "not sent". |
| Firms of different sizes | Missing | No firm accounts (tenancy), roles, permissions, or seat management. Plans and billing pages are illustrative. |
| Server backend | Not connected to the workspace | FastAPI and MongoDB API is off by default, has no authentication, and serves an older "deal rooms" model (`App.js` legacy screens) rather than Matter Review. |

## Status after the five delivery sprints

| Requirement | Now | Where |
|---|---|---|
| Plan work | Shared matters, members and tasks with assignees and due dates on the API, alongside the existing local planning tools | Firm workspace |
| Execute work | Unchanged demo tools, plus shared tasks and a server-written activity log | Firm workspace, Matter Review |
| Collaborate across the firm | **Delivered:** sign-in, firm accounts, roles, ethical walls, signed discussion, @mentions and notifications; verified on two browsers | Sprints 1–3 |
| Collaborate with clients on the site | **Delivered:** client accounts per matter, a separate client portal with approved updates, messages and document uploads | Sprint 4 |
| Firms of different sizes | **Delivered:** Solo, Practice and Enterprise seat limits, admin role changes and deactivation | Sprint 5 |
| Server backend | Connected: identity, workspace, collaboration, portal and administration APIs; legacy deal rooms retired from the app | All sprints |

Production gaps that remain (hosting, email, SSO, payments, document storage) are listed in the [release notes](RELEASE_NOTES.md).

## Recommended order of work (original, now delivered)

1. **Identity and firm accounts.** Real sign-in, firms as tenants, roles (partner, associate, paralegal, client). Everything else depends on knowing who is acting.
2. **Shared, server-side matter data.** Move matters, tasks, comments, time, and approvals from `localStorage` to the authenticated API, scoped by firm and matter.
3. **Firm collaboration.** Real assignees, comment threads attributed to the signed-in user, @mentions, and in-app notifications.
4. **Client portal.** A client role that sees only shared items on its own matters: approved updates, document requests and uploads, messages, invoices.
5. **Size tiers.** Seat limits, admin controls, and permission templates for solo, mid-size, and large firms.
6. **Retire legacy deal-room screens** or migrate them onto the matter model.
