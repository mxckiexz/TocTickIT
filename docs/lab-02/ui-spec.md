# Lab 2 / Feature 1 — UI Spec

## Status: out of scope for this PR

`feature/1-create-an-IT-support-ticket` implements the backend contract only
(`POST /api/tickets`, see [api-spec.md](api-spec.md)). `client/src/` still only
contains the Lab 1 health/category screen — there is no ticket-creation form in
this branch.

This file is a placeholder rather than a spec for a form that doesn't exist yet,
so it doesn't invent UI details nobody has agreed on. When the ticket-creation
form issue is picked up, this file should be filled in with:

- Field list and layout (Requester, Category, Related System, Summary,
  Description, Requested Priority), matching the constraints in
  [api-spec.md](api-spec.md) (150/2000-char limits, required fields, enum
  values).
- How `400` field-level errors from the API are shown next to each field.
- The submit-button behavior needed to complement BR-02 (duplicate-submission
  prevention): disable the button (or show a "submitting…" state) while the
  request is in flight, so a double-click doesn't rely on the backend's
  10-second dedup window alone.
- What the user sees on success (e.g. the returned `ticketNumber`).
