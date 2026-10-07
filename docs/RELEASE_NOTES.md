# Release notes: firm workspace and client portal

Delivered in five sprints, tracked in Jira project SCRUM ([delivery plan](DELIVERY_PLAN.md)). Every change was merged only after backend tests, frontend unit tests, demo browser tests and signed-in browser tests passed in CI.

## What changed

| Sprint | Pull request | Delivered |
|---|---|---|
| 1 | #12 | Firm accounts, scrypt-hashed passwords, revocable server sessions, five roles in one permission table, sign-in gate when an API is configured |
| 2 | #13 | Shared matters, members, ethical walls and tasks on the API; one-time colleague invitations; Firm workspace page |
| — | #14 | Fix: a second browser tab could silently overwrite a colleague's saved review note; writers now confirm the latest revision before saving |
| 3 | #15 | Matter discussion signed by the real author, @mentions, personal notifications, server-written activity log |
| 4 | #16 | Client invitations and a separate client portal: partner-approved shared updates, client messages, document requests with hashed uploads |
| 5 | this release | Admin console (roles, deactivation), Solo/Practice/Enterprise seat limits, sign-in lockout, 12-character passwords, legacy deal-room screens retired |

## How to run it

Start the API with an in-memory store, then the frontend pointed at it:

1. From the repository root: `MONGO_URL=memory CORS_ORIGINS=http://localhost:3000 uvicorn backend.server:app --port 8001`
2. From `frontend`: `REACT_APP_BACKEND_URL=http://127.0.0.1:8001 npm start`
3. Open the sign-up page, create a firm, then use **Firm workspace** to invite colleagues and clients.

Use a MongoDB `MONGO_URL` instead of `memory` to keep records between restarts. Without `REACT_APP_BACKEND_URL` the site runs as the public, browser-local demo exactly as before.

## Roles

| Role | Can |
|---|---|
| Admin | Everything, plus roles, deactivation and plan |
| Partner | Open and staff matters, record ethical walls, approve client updates, invite colleagues |
| Associate | Open and staff matters, tasks, discussion, client room (cannot approve updates) |
| Paralegal | Tasks, discussion and client room on matters they belong to |
| Client | Only the client portal for matters they were invited to |

## Verified behaviour

- Firms never see each other's records; non-members and walled colleagues get "not found" on every matter path.
- Two lawyers on different browsers share matters, tasks and comments; mentions and assignments notify the right person.
- A client sees only partner-approved updates the firm shared, their document requests and their message thread; internal discussion, tasks, walls and drafts never reach the portal.
- Deactivating a member signs them out everywhere immediately; the last admin cannot be removed.
- Five failed sign-ins lock that email for 15 minutes, for known and unknown emails alike.

## Still a prototype: not yet production-ready

- **Hosting:** the public GitHub Pages site is the browser-local demo. The API is not deployed anywhere; a host, TLS and a managed MongoDB are needed.
- **Email:** invitation codes are shown on screen for the inviter to share; nothing is emailed. Password reset is not implemented.
- **Single sign-on, MFA and SCIM** are not implemented.
- **Billing:** plans change seat limits only; no payment is taken. Invoices remain in the browser-local Practice desk and are not shared with clients.
- **Documents:** client uploads are stored in the database (10 MiB cap, SHA-256); there is no virus scanning, object storage or retention policy.
- **Session tokens** are kept in browser localStorage; a production deployment should move to secure, HTTP-only cookies.
- **Legacy deal-room API** (`/api/deal-rooms`, `/api/chat`, …) remains only as a default-off, loopback-only developer harness used by `backend_test.py`; the signed-in app no longer calls it.
