# Lab 2 / Feature 3 — UI Spec: Create Ticket Form

## Entry point

`App.tsx` shows a **New Ticket** button below the existing Lab 1 health-check
section. Clicking it opens the ticket flow — nothing is fetched on page load,
matching the existing "Check System" button's fetch-on-click pattern and
keeping Lab 1's tests unaffected. What's shown next depends on whether a
Development Requester is already active (AC-05):

1. **No active Requester** (first time, or after "Switch requester") →
   `DevRequesterPicker` — its own step, fetches `GET /api/requesters`,
   presents a `<select>` + "Continue as this Requester". Nothing about
   categories/related systems is fetched yet.
2. **Active Requester present** → straight to `CreateTicketForm`, which
   fetches `GET /api/categories` and `GET /api/related-systems`.

The chosen Requester is kept in `App.tsx` state and mirrored to
`localStorage` (`toktickit.activeRequester`), so it survives a page reload —
"stays active while creating tickets" per AC-05. `CreateTicketForm` shows it
in a banner ("Creating as `<name>` (`<email>`)") with a "Switch requester"
button that clears the stored choice and returns to step 1. Submitting a
ticket and clicking "Create another ticket" does **not** clear it.

## Fields (`CreateTicketForm`)

There is no Requester field in this form — it comes from the active
Development Requester (AC-05) instead.

| Field | Control | Source | Notes |
|---|---|---|---|
| Category | `<select>` | `GET /api/categories` | |
| Related System | `<select>` | `GET /api/related-systems` | |
| Summary | `<input maxlength=150>` | — | Live `(n/150)` counter next to the label. |
| Description | `<textarea maxlength=2000>` | — | Live `(n/2000)` counter. |
| Requested Priority | `<select>` | `LOW`/`MEDIUM`/`HIGH` | Defaults to `MEDIUM`. |
| Supporting attachment | `<input type="file">` | — | Optional, single file, `accept=".jpg,.jpeg,.png,.webp,.pdf"` as a UX hint only — the server is the real gate. Uploaded with the active Requester's id (BR-07). |

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

## BR-07 (peer review)

Two issues came back from review before approval:

1. `POST /api/tickets/:id/attachments` checked that the ticket existed but not
   that the caller owned it — any Requester id could attach a file to any
   ticket. Fixed: the endpoint now requires `requesterId` and rejects with
   `403` unless it matches `ticket.requesterId` (see
   [specification.md](specification.md) BR-07 and [api-spec.md](api-spec.md)).
2. The Requester picker was inside `CreateTicketForm` (re-picked per ticket).
   Reworked into the two-step flow described above under **Entry point** —
   `DevRequesterPicker` is a separate step, and the choice stays active across
   ticket creations (AC-05) instead of resetting.
