# Delivery plan: firm workspace and client portal

Tracked in Jira project **SCRUM** (My Software Team-Legal Suite), label `law-suite-delivery`. It closes the gaps recorded in [the requirements review](REQUIREMENTS_REVIEW.md).

## Scrum team

| Role | Who | Responsibility |
|---|---|---|
| Product Owner | Olugbenga George | Sets priorities, accepts finished work |
| Scrum Master | Claude Code | Keeps the board current, moves tickets, flags blockers |
| Development team | Claude Code | Builds, tests and documents each story |
| Reviewer | Olugbenga George | Reviews pull requests |

## Sprints

| Sprint | Theme | Tickets | Points |
|---|---|---|---|
| 1 | Front-door locks: sign-in, firm accounts, roles | SCRUM-18, 19, 47, 48, 49, 50 | 31 |
| 2 | Shared filing cabinet: server-side matters, tasks, ethical walls | SCRUM-20, 51, 52, 53, 54 | 29 |
| 3 | Firm collaboration: comments, @mentions, notifications, activity | SCRUM-55 to 59 | 21 |
| 4 | Client portal: client accounts, shared items, messages, documents | SCRUM-60 to 64 | 26 |
| 5 | Firm sizes, hardening and release | SCRUM-65 to 69 | 19 |

## Board columns

To Do → In Progress (being built) → In Review (pull request open) → Testing (CI and browser journeys running) → Done (merged to `main`, checks green)

## Definition of Done

- Merged to `main`
- Backend unit tests, frontend unit tests, demo browser tests and signed-in browser tests all pass in CI
- The public GitHub Pages demo still works with no server
- The Jira ticket has a closing comment listing what changed

## Boundaries

The work runs against a local or CI API. Hosting, email delivery of invitations, single sign-on and payment are out of scope and are listed again in the Sprint 5 release notes.
