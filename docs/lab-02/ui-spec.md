# Lab 2 / Feature 3 — UI Spec: Create Ticket Form

## Entry point

`App.tsx` shows a **New Ticket** button below the existing Lab 1 health-check
section. Clicking it mounts `CreateTicketForm` for the first time, which is
also the first moment it fetches `GET /api/categories`,
`GET /api/related-systems`, and `GET /api/requesters` — nothing is fetched on
page load, matching the existing "Check System" button's fetch-on-click
pattern and keeping Lab 1's tests unaffected.

## Fields

| Field | Control | Source | Notes |
|---|---|---|---|
| Requester | `<select>` | `GET /api/requesters` | Label shows `name (email)`. Stands in for auth (Lab 3). |
| Category | `<select>` | `GET /api/categories` | |
| Related System | `<select>` | `GET /api/related-systems` | |
| Summary | `<input maxlength=150>` | — | Live `(n/150)` counter next to the label. |
| Description | `<textarea maxlength=2000>` | — | Live `(n/2000)` counter. |
| Requested Priority | `<select>` | `LOW`/`MEDIUM`/`HIGH` | Defaults to `MEDIUM`. |
| Supporting attachment | `<input type="file">` | — | Optional, single file, `accept=".jpg,.jpeg,.png,.webp,.pdf"` as a UX hint only — the server is the real gate. |

## Submit flow

1. `POST /api/tickets` with the six fields above.
2. If it 400s, each `errors.<field>` from the response is shown directly under
   that field (see [api-spec.md](api-spec.md)); the form stays filled in so
   nothing is lost, and the button re-enables.
3. If it succeeds (`201`, or `200` on BR-02 duplicate-resubmission) and a file
   was selected, `POST /api/tickets/:id/attachments` is called with the new
   ticket's id. A failure here does **not** hide the created ticket — the
   confirmation still shows, with a warning appended (the ticket exists
   either way; losing sight of its number would be worse than a stuck
   attachment).
4. On success: confirmation view — "Ticket created successfully. Your Ticket
   Number: **`<ticketNumber>`**" — with a "Create another ticket" button that
   resets the form.

## Duplicate-submission (BR-02)

The submit button is disabled and reads "Submitting…" for the duration of the
request, so a double-click can't fire two requests from the UI. The backend's
10-second dedup window (BR-02) is the actual guarantee; this is belt-and-braces
on top of it, per the note this file used to carry as a TODO.

## BR-06 (found while building this)

An unselected `<select>` reads as `""`, and the form sends `Number(value)` for
the three id fields — `Number("")` is `0`, which is a syntactically valid
integer. The backend originally only checked `Number.isInteger`, so a fully
empty submission reported "Summary is required." / "Description is required."
but silently accepted `requesterId/categoryId/relatedSystemId: 0`. Fixed in
`server/src/app.ts` to also require the id to be `> 0`; see
[specification.md](specification.md) BR-06.
