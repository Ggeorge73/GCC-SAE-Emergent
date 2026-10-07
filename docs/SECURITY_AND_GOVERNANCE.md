# Security and Governance

## Purpose

Law Suite handles workflows that could contain privileged legal work and highly sensitive enterprise documents. The current repository is a portfolio prototype, not a secure production system. This document makes that boundary explicit and defines the controls required before real use.

## Current-state assessment

### Implemented in the prototype

- SHA-256 hashing of actual bytes, mismatch rejection, and a 10 MiB upload limit
- Default-disabled data endpoints and local-only demo opt-in
- Explicit unverified drafts and unavailable-service responses
- Request-scoped model calls; no shared matter-keyed model history
- Client-side synthetic review state machine and export (not an authorization boundary)
- Matter-level document metadata
- Basic audit aggregation for advisory logs, document uploads, and compliance changes
- Environment-based backend connection settings
- A modeled administrator experience for SSO, SCIM, RBAC, and access review

- Firm accounts with scrypt-hashed passwords (12-character minimum), revocable server-side sessions stored as token digests, 12-hour expiry and a 15-minute lockout after five failed sign-ins
- One role permission table (admin, partner, associate, paralegal, client) enforced on every authenticated route
- Firm isolation and matter membership on every matter, task, comment, activity and document path; ethical walls override admin access and return "not found"
- A client portal that reads only explicitly shared records; clients are refused every firm route
- Immediate sign-out of deactivated members; at least one active admin is always kept

### Not production-ready

- Session tokens live in browser localStorage rather than secure HTTP-only cookies
- No email delivery, password reset, SSO, MFA or SCIM
- The legacy deal-room routes remain unauthenticated; they are disabled by default and loopback-only for the developer harness
- No implemented SSO, SCIM, or RBAC despite the portfolio UI model
- CORS defaults to a local origin; full deployment security remains unvalidated
- Firebase rules are not included or verified; external storage registration and the frontend upload fallback are disabled
- MongoDB fallback can store document bytes as base64
- Uploaded documents are marked stored; no extraction/indexing pipeline exists
- AI document context currently includes filenames, not governed document retrieval
- No immutable or externally exportable audit log
- No data-retention, deletion, legal-hold, or residency controls
- No secrets-management integration
- API boundary regression tests exist; no penetration test or comprehensive security pipeline

Do not deploy the prototype with privileged or personal data.

## Target trust model

### Identity

- SAML or OIDC SSO with customer-controlled enforcement
- SCIM provisioning and deprovisioning with reconciliation status
- Step-up authentication for sensitive administrative actions
- Session revocation and configurable idle/absolute timeouts
- Break-glass accounts with explicit monitoring and review

### Authorization

Proposed roles:

| Role | Aggregate analytics | Named-user access data | Manage access | Configure policy | Export audit |
|---|---:|---:|---:|---:|---:|
| Organization viewer | Yes | No | No | No | No |
| Adoption manager | Yes | Limited cohorts | No | No | No |
| Identity administrator | Limited | Yes | Yes | No | Limited |
| Security administrator | Yes | Yes | Approval-based | Yes | Yes |
| Auditor | Read-only | Purpose-bound | No | Read-only | Yes |

Controls:

- Organization ID enforced in every database and object-store query
- Server-side permission checks; UI visibility is never an authorization control
- Separation of duties for policy changes and high-risk access grants
- Approval workflows for privilege escalation and bulk changes
- Row- and column-level access for named-user analytics

### Analytics privacy

- Pseudonymize user identifiers in the event warehouse.
- Default to cohort-level reporting.
- Suppress small cohorts where re-identification is plausible.
- Restrict named-user detail to access, security, or support purposes.
- Log every identity-level analytics view and export.
- Exclude prompt content, document text, matter name, client name, and legal advice from default telemetry.
- Provide administrators with event definitions, retention periods, and employee-notice guidance.

### LLM and analytics-agent boundaries

The target deployment-insights assistant must:

- Query only approved aggregate views through bounded tools.
- Apply the caller's authorization context to every query.
- Cite metric definition, date range, cohort, freshness, and source query identifier.
- Distinguish observed facts from inference and recommendation.
- Refuse identity-level or small-cohort questions without the required purpose and permission.
- Never grant, revoke, or change access autonomously.
- Require confirmation and, where configured, a second approver before administrative mutation.

## Threat model

| Threat | Example | Required mitigation |
|---|---|---|
| Cross-tenant data access | Modified deal-room ID returns another organization's documents | Organization-scoped authorization on every server query; negative contract tests |
| Privilege escalation | Adoption manager calls an identity-admin endpoint directly | Server-side policy enforcement and approval gates |
| Stale access | Departed contractor remains provisioned | SCIM deprovisioning SLA, reconciliation alerts, inactivity review |
| Prompt or document leakage | Sensitive matter text enters analytics logs | Telemetry allowlist and automated payload scanning |
| Metric manipulation | Test traffic inflates adoption | Service/test actor exclusion and versioned event validation |
| Unsafe recommendation | Assistant recommends removing a legitimate user's access | Evidence, confidence, human confirmation, no autonomous mutation |
| Orphaned storage | Metadata deleted while Firebase object remains | Transactional deletion workflow and reconciliation job |
| Audit tampering | Administrator changes or deletes evidence | Append-only signed audit store with external export |

## Production release gates

### Identity and tenancy

- [ ] SSO and SCIM integration tests pass for provision, update, suspend, and deprovision.
- [ ] Every API contract has cross-tenant negative tests.
- [ ] Role and permission matrix reviewed by Security and Product Legal.
- [ ] Step-up authentication enforced for high-risk administrative actions.

### Data protection

- [ ] Storage rules deny unauthenticated and cross-organization access.
- [ ] Encryption at rest and in transit is verified for every data store.
- [ ] Secrets are held in a managed secrets service and rotated.
- [ ] Retention, deletion, legal hold, residency, backup, and restore are tested.
- [ ] Document deletion reconciles metadata, object storage, derived indexes, and backups.

### Analytics and AI

- [ ] Event schema excludes privileged content by construction.
- [ ] Identity reconciliation and aggregate metrics meet documented accuracy thresholds.
- [ ] Small-cohort suppression and purpose-based access are enforced server-side.
- [ ] Analytics-agent evaluation covers accuracy, authorization, privacy, and unsafe action proposals.
- [ ] Every generated insight exposes provenance and data freshness.

### Operations

- [ ] Immutable audit export tested.
- [ ] Security logging, alerting, incident response, and support impersonation controls are operational.
- [ ] Dependency, secret, SAST, and container scans run in CI.
- [ ] Disaster recovery objectives are tested and documented.

## Near-term engineering sequence

1. Introduce organizations, users, memberships, and server-side roles.
2. Require authentication and organization scope on every existing endpoint.
3. Move file access behind authorized signed URLs and remove database byte fallback.
4. Add SCIM reconciliation and access-review records.
5. Define privacy-preserving product events and build append-only ingestion.
6. Add metric provenance and cohort privacy before deployment recommendations.
7. Add bounded, evaluated analytics assistance only after the data and authorization layers are trustworthy.
