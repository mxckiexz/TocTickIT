# Lab 2 — UI Spec: Create Ticket Form (Feature 3) + My Tickets (Feature 5)

## Entry point

`App.tsx` shows **New Ticket** and **My Tickets** buttons below the existing
Lab 1 health-check section. Clicking either opens the ticket flow — nothing
is fetched on page load, matching the existing "Check System" button's
fetch-on-click pattern and keeping Lab 1's tests unaffected. What's shown
next depends on whether a Development Requester is already active (AC-05):

1. **No active Requester** (first time, or after "Switch requester") →
   `DevRequesterPicker` — its own step, fetches `GET /api/requesters`,
   presents a `<select>` + "Continue as this Requester". Nothing about
   categories/related systems/tickets is fetched yet. This step is shared by
   both flows — it doesn't matter which button was clicked to get here.
2. **Active Requester present** → straight to `CreateTicketForm` or
   `MyTickets` (whichever was picked), plus a small tab switcher ("New
   Ticket" / "My Tickets") above it so the two views can be swapped without
   re-picking the Requester or losing it.

The chosen Requester is kept in `App.tsx` state and mirrored to
`localStorage` (`toktickit.activeRequester`), so it survives a page reload —
"stays active" per AC-05, across both ticket creation and browsing My
Tickets. Both `CreateTicketForm` and `MyTickets` render the same shared
`RequesterBanner` component (`RequesterBanner.tsx`) with a "Switch requester"
button that clears the stored choice and returns to step 1 — labeled
"Creating as …" on the form, "Viewing as …" on the list (`label` prop).
Submitting a ticket, clicking "Create another ticket", or switching between
the two tabs does **not** clear the active Requester.

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

## `MyTickets` (Feature 5)

Reached via the **My Tickets** entry button / tab. Once the active Requester
is known, it fetches `GET /api/categories` and `GET /api/related-systems`
(for the filter dropdowns' labels — the same lookups `CreateTicketForm`
uses) and then `GET /api/tickets` with the current search/filter/sort/page
state.

### Controls

| Control | Type | Effect |
|---|---|---|
| Search | `<input type="search">` | Debounced 300ms after the user stops typing, then sent as `search` (AC-07). Matches summary, description, or ticket number. |
| Category | `<select>` | `categoryId` filter, "All categories" clears it. |
| Related System | `<select>` | `relatedSystemId` filter, "All related systems" clears it. |
| Priority | `<select>` | `requestedPriority` filter (`LOW`/`MEDIUM`/`HIGH`), "All priorities" clears it. |
| Sort | `<select>` | One dropdown covering both `sortBy` and `sortDir` as a single choice: Newest first (default, `createdAt desc`), Oldest first (`createdAt asc`), Summary A–Z (`summary asc`), Summary Z–A (`summary desc`). |
| Previous / Next | buttons | Page navigation. Disabled at the first/last page respectively (`pagination.page`/`totalPages` from the response). |

There is no `currentStatus` filter control in the UI even though the API
supports one (see [api-spec.md](api-spec.md)) — every ticket today is
`"New"` (BR-05, no status-transition feature exists yet), so a status filter
would have exactly one useful value. Easy to add once Feature 6/7 introduce
status changes.

Changing search, any filter, or sort resets to page 1 — otherwise a filter
narrow enough to have fewer pages than the current page number would land on
an empty/out-of-range page.

### Results table

Columns: Ticket Number, Summary, Category (name, resolved from the fetched
category list by id — the API returns ids, not names), Related System
(same), Priority, Status, Created (localized date/time). Below the table:
"Page `<page>` of `<totalPages>` (`<totalItems>` tickets)" plus the
Previous/Next buttons.

Empty states:
- No tickets at all for this Requester, or none matching the current
  search/filters → "No tickets match your search and filters." (same message
  either way — the controls are right there to relax them).
- Filter/category/related-system lookups fail to load → an error banner
  ("Unable to load My Tickets…"), same pattern as `CreateTicketForm`.
