# Lab 2 / Feature 1 — Create an IT Support Ticket — Specification

> Written against the code as implemented on `feature/1-create-an-IT-support-ticket`
> (commit `eff3ca3`). Kept as the source of truth to check the API/tests against —
> update this file first when the contract changes, then update the code and tests
> to match.

## Scope

Backend only: `POST /api/tickets`. No client-side ticket form exists yet in this
branch (see [ui-spec.md](ui-spec.md)).

## Entities

| Entity | Fields | Notes |
|---|---|---|
| Requester | id, name, email, isActive | Stands in for authentication until Lab 3. Only an active Requester may submit a ticket. |
| Category | id, name, isActive | Seeded: Account and Access, Hardware, Software, Network. Only an active Category may be used. |
| RelatedSystem | id, name, isActive | Seeded: Email, Campus Wi-Fi, VPN, LEB2 App, Grade Submission App, Printer, Corporate Laptop. Only an active RelatedSystem may be used. |
| Ticket | id, ticketNumber, requesterId, categoryId, relatedSystemId, summary, description, requestedPriority, currentStatus, createdAt, updatedAt | Created via `POST /api/tickets`. |

## Acceptance Criteria

- **AC-01**: Submitting a valid ticket creates a `Ticket` row and returns it with a
  unique, backend-generated `ticketNumber`.
- **AC-02**: Submitting with missing/invalid required fields returns field-level
  validation errors and creates no row.
- **AC-03**: Submitting with a Requester, Category, or RelatedSystem that is
  inactive or does not exist is rejected.

## Business Rules

- **BR-01 — Ticket Number**: backend-generated, format `TKT-<year>-<6-digit
  sequence>` (e.g. `TKT-2026-000042`), unique, never supplied by the client.
- **BR-02 — Duplicate-submission prevention**: if the same Requester resubmits a
  ticket with identical Category, Related System, Summary, Description, and
  Requested Priority within 10 seconds of their prior submission, the API returns
  the ticket that was already created (`200`) instead of inserting a second row.
  This guards against double-clicks and naive client retries; it is not a
  substitute for a client-side "submitting…" disabled-button state, which should
  still be added when the ticket form is built.
- **BR-03 — Field limits**: `summary` ≤ 150 characters, `description` ≤ 2000
  characters, both required and not whitespace-only.
- **BR-04 — Requested Priority**: one of `LOW`, `MEDIUM`, `HIGH`.
- **BR-05 — Initial status**: every new ticket starts with `currentStatus: "New"`.

See [api-spec.md](api-spec.md) for the exact request/response contract and
[tests.md](tests.md) for how each rule is covered by tests.
