# Lab 4 — UI Spec

Extends `docs/lab-03/ui-spec.md`. Zen Green tokens (`client/src/theme.css`), Bootstrap 5.3,
the shared badges (`client/src/ticketBadges.tsx`) and the form conventions of Lab 2 and 3 are
reused; no new colour is introduced. Rule IDs refer to [specification.md](specification.md).

## 1. Navigation (FR-19)

One row of buttons under the header, role specific. The current page has `aria-current="page"`
and the solid style; the others use the outline style.

| Role | Items |
|---|---|
| Requester | Dashboard, New Ticket, My Tickets |
| IT Staff | Dashboard, Ticket Queue |
| Administrator | Dashboard, Ticket Queue, User Management (specification D-2, D-6) |

The Administrator opens the same Ticket Queue and Ticket Detail screens as IT Staff, with every
control enabled (claim, reassign, IT priority, status, comments, notes, Actions Taken); there is
no separate or read-only Administrator ticket screen.

The landing page after login is the Dashboard of the role. An item the role cannot use is not
rendered; the API still answers `403` (Lab 3 FR-07).

## 2. Staff / Administrator Dashboard (FR-15, FR-16, FR-17)

Layout (desktop): a row of metric cards, then two lists.

- Cards: Unassigned, Assigned to me, **My open actions** (specification BR-27: the number of
  open tickets that hold an open action assigned to me), By status (8 small counts), By IT
  priority (3 counts).
  Each card has a label, the number, and a link "View" that opens the Ticket Queue with the
  matching filter (drill-down). The whole number is not the only target: the "View" link is a
  real link with an accessible name such as "View 6 unassigned tickets".
- Recent: "Recently updated" list of at most 5 tickets (number, summary, status badge,
  priority badge, updated time); each row opens the ticket.
- **My recent actions**: a list of my 5 newest performed actions (ticket number, status badge
  with text, action time, description cut to 120 characters). Each row is a link that opens the
  ticket detail at the Actions Taken section. The "My open actions" card's "View" link opens the
  Ticket Queue with `actionAssigneeId=me` (accessible name such as "View 2 tickets with my open
  actions"). Empty: the card shows `0` with "Nothing here" and the list shows "You have not
  recorded any actions yet."
- Quick actions: "Open Ticket Queue", and for the Administrator also "Manage users".
- Administrator only: a short line "Users: 18 total, 15 active" with a link to User Management.
- A metric whose value is 0 is shown as `0` (not hidden) with a muted note "Nothing here".

Tablet: cards in two columns. Mobile: one column, lists below the cards.

States (FR-20): loading ("Loading dashboard…", no stale numbers), empty (all zeros plus a muted
sentence, recent list "No recent tickets"), forbidden (the Lab 3 forbidden panel), error
("Unable to load the dashboard." with a Retry button), conflict (not applicable; read only).

## 3. Requester Dashboard (FR-14)

Not a copy of My Tickets: it answers "what needs me" with four cards and two short lists.

- Cards: Open tickets, Waiting for you, each with a "View" link to My Tickets with that filter.
- Lists: "Recently updated" and "Recently resolved", at most 5 rows each, own tickets only.
- Empty: "You have no tickets yet." with a primary "New Ticket" button.
- Same loading / forbidden / error states as §2.

## 4. Actions Taken section in Ticket Detail (FR-01 to FR-08)

Placed below the ticket fields and above Comments, in the staff Ticket Detail (IT Staff and
Administrator, identical) and (read-only) in the Requester Ticket Detail.

**List mode** — a list ordered as returned by the API (never re-sorted client side). The
Requester sees every entry with every field below (specification D-5). Each entry shows: when (`actionAt`), who performed it, status badge with text (PLANNED / IN PROGRESS /
COMPLETED / CANCELLED), assignee (or "Unassigned"), description, result, a "Follow-up needed"
badge with its note, and attachment notes. Staff entries have an "Edit" button (not shown for
COMPLETED or CANCELLED entries, which are final). The Requester sees no buttons.

**Create mode** (staff) — "Add action" opens an inline form: Description (required), Result,
Action time (defaults to now), Status, Assignee (select of active IT Staff and Administrators),
"Follow-up required" checkbox with a Follow-up note that becomes required when checked,
Attachment notes. Buttons: Save, Cancel. The Status select offers exactly Planned (selected by
default), In progress and Completed (BR-06); Cancelled is not offered on create. Choosing
Completed marks Result as required ("Result is required to complete an action") and the
server enforces it too.

**Edit mode** — the same form filled with the entry; carries the `version`. The Status select
offers only the current status and the moves BR-06 allows from it (from Planned: In progress,
Completed, Cancelled; from In progress: Completed, Cancelled). Completed requires Result, same
message. Saving a stale entry shows the conflict banner (§6). There is no Delete button; to drop
an entry the user sets it to Cancelled.

Feedback: field errors sit directly under the field and are tied to it (`aria-describedby`);
a request failure shows a banner above the form; the values typed stay after an error
(FR-21); Save is disabled while the request is in flight (shows "Saving…").

States: loading ("Loading actions…"), empty ("No actions recorded yet." — staff also see the
Add action button), forbidden (a Requester on someone else's ticket gets the Lab 3 not-found
message), conflict, error ("Unable to load actions." with Retry).

## 5. Status control in staff Ticket Detail (FR-09, FR-10, FR-12)

For IT Staff and Administrator alike, replaces the Lab 3 `<select>` with a row of buttons, one per status returned in
`allowedTransitions`; nothing else is offered. Resolved, Closed, Reopened and Cancelled keep
the confirm step. When Resolved is offered but `resolutionGate.ok` is false the button is still
shown, disabled, with the unmet conditions listed in plain text next to it ("Needs an owner",
"Needs a completed action", "Finish or cancel open actions"). After a change the ticket
summary, `version`, buttons and gate are refreshed from the response.

The Claim and Reassign controls are unchanged in look. Their list comes from
`GET /api/staff/assignable-users`, which now holds active IT Staff and Administrators, so an
Administrator can claim a ticket and appear as its owner (specification BR-26).

The Requester's "Problem appears resolved" button keeps its Lab 3 behaviour and wording; it
never changes the status badge.

## 6. Conflict banner (FR-20, AC-32)

On `409 STALE_VERSION` a banner (role `alert`) appears above the affected form or control:
"Someone else changed this. Reload to see the latest, then try again." with a Reload button
that refetches the record and keeps the user's unsaved input visible below it. A
`RESOLUTION_GATE` or `ILLEGAL_TRANSITION` conflict uses the same banner with the server's
message.

## 7. Responsive (FR-23)

Checked at 375, 768 and 1280 px: no horizontal page scroll, no overlap, no clipped label.
Actions entries stack their fields on mobile; status buttons wrap to several lines; dashboard
cards go 4 → 2 → 1 columns. Tables (if any) keep their wrapper; the test measures the wrapper,
not only the page.

## 8. Accessibility checklist (FR-22)

- Every control has a visible label; icon-only controls have an `aria-label`.
- Focus ring visible on every new interactive element (the Zen Green focus ring is not removed).
- Everything reachable and operable by keyboard; the confirm step and the banner receive focus
  or are announced (`role="alert"` / `role="status"`).
- Status, priority and follow-up are shown with text, never colour alone.
- Text and badge contrast at least 4.5:1, measured in a real browser.
- Dashboard cards are not clickable `div`s: each drill-down is a link or button with a name.
- Form errors are associated with their field.
- Page titles / headings in order (one `h1`, then `h2`).

## 9. Screenshots and visual checklist

Stored at `artifacts/lab-04/screenshots/{staff-dashboard,requester-dashboard,actions-taken}/`
as `desktop.png`, `tablet.png`, `mobile.png` (1280 / 768 / 375), plus the conflict banner and the
gate message. Checklist, filled in during F10 by opening each screenshot:

- [ ] Only Zen Green tokens; no stray colour.
- [ ] Role navigation shows only usable items, current page marked.
- [ ] Badges carry text; priority and status colours match Lab 3.
- [ ] Editable and read-only fields are distinct (Requester sees Actions Taken read-only).
- [ ] The Administrator sees the same enabled ticket controls as IT Staff.
- [ ] My open actions card and My recent actions list, with zero and non-zero data.
- [ ] Error messages under fields; banners above forms.
- [ ] Focus visible on every new control.
- [ ] No clipping, overlap or horizontal scroll at the three widths.
- [ ] No console error, placeholder text or temporary UI.
