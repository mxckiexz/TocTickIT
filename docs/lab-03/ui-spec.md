# Lab 3 — UI Spec: Login + Change Password + App Shell + Requester Ticket Detail (additions) + IT Staff Ticket Queue + IT Staff Ticket Detail + Administrator User Management

Extends `docs/lab-02/ui-spec.md`. Reuses Lab 2's Zen Green tokens and shell classes
unchanged (§1 below) — no new color system. Lab 2's `CreateTicketForm` and `MyTickets`
screens are unchanged by Lab 3 beyond losing the dev-requester gate (covered under App
Shell, §3); they are not repeated here.

## 1. Zen Green theme (reused, unchanged)

| Token | Value | Used for |
|---|---|---|
| Primary green | `#006B3C` | App header background, solid buttons, strong emphasis text |
| Secondary green | `#0B7A46` | Links, hover/active/focus states, focus rings |
| Pale green | `#EAF6EF` | Success confirmations |
| Page background | `#F5F7F6` | Body background |
| Surface / cards | White, `1px solid #dfe7e2`, restrained shadow | `.zg-surface` |
| Text | `#16281F` | Body text |
| Read-only field | `#F0F3EF` | Disabled/read-only inputs |
| Error | `#842029` | `.alert-danger` text |

**New badge tokens** (Lab 3 introduces status/priority/role badges the Requester-only Lab 2
screens never needed):

| Badge | Token reused | Mapping |
|---|---|---|
| Role badge | `.badge` + existing greens | Requester → outline secondary-green; IT Staff → solid secondary-green; Administrator → solid primary-green |
| Priority badge | Bootstrap semantic classes, not new colors | LOW → `bg-secondary`, MEDIUM → `bg-warning text-dark`, HIGH → `bg-danger` (reuses `--zg-error`'s red family) |
| Status badge | Bootstrap semantic classes | NEW/OPEN → `bg-secondary`; IN_PROGRESS/WAITING_FOR_REQUESTER → `bg-warning text-dark`; RESOLVED/CLOSED → `bg-success` (pale/primary green pairing); REOPENED → `bg-warning text-dark`; CANCELLED → `bg-secondary` with a strikethrough on the ticket number |

No color alone ever carries meaning — every badge also carries its text label (e.g. "HIGH",
"In Progress"), matching Lab 2's existing "never color-only" rule.

## 2. Login (new — Feature: Authentication)

Replaces nothing (this is the new first screen unauthenticated visitors see).

### Layout

Centered `.zg-surface` card, max-width ~400px, on the `.zg-page-bg` background: app name/
header, email field, password field, "Log in" button, and a single-line safe-error area
below the button.

### States

| State | Shown |
|---|---|
| Idle | Empty form, "Log in" enabled only once both fields are non-empty |
| Loading | Button shows "Logging in…" and is disabled; fields disabled |
| Validation error | Inline message under the offending field ("Email is required.", "Password is required.") |
| `401` (BR-07) | One line above the form: "Invalid email or password." — identical wording whether the email is unknown, the password is wrong, or the account is inactive |
| Network/`500` error | "Unable to log in. Please try again." |
| Success | Redirects into the app shell (§3), or straight to Change Password (§4) if `mustChangePassword` is true |

## 3. App Shell (replaces `RequesterBanner` / `DevRequesterPicker`)

`App.tsx`'s `.zg-app-header` now shows the authenticated user's name and role badge instead
of the ticket-flow title bar, plus a "Log out" action. Below it, role-scoped navigation
replaces the old unconditional "New Ticket / My Tickets" button group:

| Role | Navigation shown |
|---|---|
| Requester | New Ticket, My Tickets (Lab 2's screens, unchanged content) |
| IT Staff | Ticket Queue |
| Administrator | User Management |

A destination not in the caller's list is never rendered — and, per FR-07, hitting its API
route directly still gets `403` regardless.

### States

| State | Shown |
|---|---|
| Loading current user | A minimal "Loading…" shell, before the header renders (calls `GET /api/auth/me` once on mount) |
| `401` from `/auth/me` | Redirect to Login |
| `mustChangePassword: true` | Redirect to Change Password (§4); no navigation rendered until cleared |
| Loaded | Header + role-scoped nav + the selected screen |

`DevRequesterPicker.tsx` and the `activeRequester` localStorage key are removed entirely —
there is no "switch requester" affordance anywhere in Lab 3; identity comes only from the
session.

## 4. Change Password (forced) (new — Feature: Authentication)

Shown in place of the app shell whenever the current user's `mustChangePassword` is true —
whether that's a freshly-migrated Lab 2 Requester, a newly created user, or someone whose
password an Administrator just reset.

### Layout

`.zg-surface` card: current password, new password, confirm new password, "Save password"
button. No navigation is rendered around it — this screen blocks everything else (AC-02).

### States

| State | Shown |
|---|---|
| Idle | Empty form |
| Loading | Button "Saving…", fields disabled |
| Validation error | Inline per-field messages (too short, mismatch with confirm, same as current) |
| `401` (wrong current password) | "Current password is incorrect." above the form |
| Success | Proceeds into the normal role-scoped app shell (AC-09) |

## 5. Requester Ticket Detail — additions (extends Lab 2's `TicketDetail`)

Everything Lab 2 already shows (ticket fields, attachments) is unchanged. Two additions,
appended below the Attachments section:

### 5.1 Public Comments

A simple thread: each comment shows author name, role badge, timestamp, and body, oldest
first. Below the thread, a textarea + "Post comment" button.

| State | Shown |
|---|---|
| Loading | "Loading comments…" |
| Empty | "No comments yet." |
| Loaded | The thread, newest at the bottom |
| Posting | Button "Posting…", textarea disabled |
| Validation error | "Comment cannot be empty." / "Comment must be 2000 characters or fewer." under the textarea |
| Post error | An alert above the textarea, textarea content preserved (same "preserve the form on failure" pattern as Lab 2's `CreateTicketForm`) |

### 5.2 "Problem Appears Resolved"

A single button, visible only when the ticket is not already `RESOLVED`/`CLOSED`/
`CANCELLED`. Clicking it shows a confirmation (this is a one-way signal, not a status
change) and, on success, replaces the button with a small note: "You marked this as
resolved on <date>." The ticket's own status badge is unaffected (BR-24) — the note makes
clear this didn't close the ticket.

| State | Shown |
|---|---|
| Available | Button enabled |
| Confirming | Inline confirm/cancel, no request sent yet |
| Saving | Button "Saving…" |
| Success | Button replaced by the "You marked this as resolved on…" note |
| Error | Alert; button returns to Available |

## 6. IT Staff Ticket Queue (new — Feature: IT Staff work)

### Layout — desktop (≥ 992px, Bootstrap `lg`)

A table inside `.zg-surface`: Ticket No., Created, Summary, Category, Requested Priority
(badge), IT Priority (badge), Status (badge), Owner (name or "Unassigned"), Last Updated.
Above it: a search box, Category/Related System/Priority/Status/Owner filter dropdowns, and
column-header sort toggles. Below it: pagination controls (Lab 2's existing pagination
component, reused).

### Layout — tablet (768–991px, `md`)

Same table, with Category and Last Updated columns dropped to keep row width readable
(handout §8.3's "avoid an unreadable wide data table") — still a table, not yet cards.

### Layout — mobile (< 768px, `sm` and below)

Each ticket becomes a stacked card: Ticket No. + Status badge on one line, Summary below,
then a compact row of Requested/IT Priority badges, then Owner and Last Updated as small
muted text. Filters collapse into a single "Filters" disclosure button above the search box.

### States

| State | Shown |
|---|---|
| Loading | "Loading tickets…" |
| Empty (no tickets exist at all) | "No tickets yet." |
| No results (filters/search active) | "No tickets match your search and filters." — same wording pattern as Lab 2's `MyTickets` |
| Loaded | The table/cards above |
| Forbidden (`403`, non-staff role reaching this screen directly by URL) | A dedicated "You do not have permission to view this page." panel, not a blank table |
| Error | "Unable to load the ticket queue." banner |

## 7. IT Staff Ticket Detail (new — extends the Requester Ticket Detail layout)

Same base layout as §5 (ticket fields grouped, attachments), plus:

- **Ownership control**: "Claim this ticket" button when unassigned; when assigned, shows
  the current owner's name with a "Reassign" action opening a dropdown of active IT Staff
  users (sourced from `GET /api/staff/assignable-users` — never Administrator, who cannot
  own a ticket, BR-17).
- **IT Priority selector**: a `<select>` next to (not replacing) the read-only Requested
  Priority badge — both visible at once so the two are never confused (handout's explicit
  "keep editable vs. read-only fields distinct" rule).
- **Status control**: a `<select>` populated only with the current status's legal next
  states (per the matrix) plus the current value itself (shown, disabled/no-op) — an
  illegal transition is never even offered, though the API still enforces it independently
  (BR-22).
- **Public Comments**: same component as §5.1, staff can also post.
- **Internal Notes**: a visually distinct panel — a different background tint
  (`--zg-pale-green` reused but bordered in secondary-green, with a small "Internal — IT
  Staff only" label) placed clearly below/apart from Public Comments, specifically so no one
  mistakes it for the public thread. Same post/empty/loading/error states as §5.1.
- **Requester-resolved flag**: if the ticket's `requesterMarkedResolvedAt` is set, a small
  badge/note near the status control: "Requester marked this resolved on <date>."

### States

Same loading/empty/error/forbidden pattern as §6, applied to a single ticket instead of a
list; `404` shows "Ticket not found." (matches the API's message directly, as Lab 2's
`TicketDetail` already does for its own `404`).

**Administrator note**: §6/§7's screens are reachable in the client only from the IT Staff
navigation destination (App Shell, §3), which Administrator never sees (specification.md
§3.4). The server-side read access `GET /api/staff/tickets`/`:id` grants an Administrator
(BR-39) exists so that access is *possible* — satisfying BR-04's requirement that
Administrator can see Internal Notes — not so Lab 3 ships a second, admin-flavored ticket
UI; there is no dedicated Administrator ticket screen in this sprint (§3.2's exclusion of
admin dashboards beyond User Management covers this).

## 8. Administrator User Management (new — Feature: User Management)

One screen, per the handout's explicit "keep it simple" instruction (§8.5) — no tabs, no
wizard.

### Layout — desktop

`.zg-surface` card: search box + role filter dropdown across the top, a "Create user"
button, then a table — Name, Email, Role (badge), Status (badge: Active/Suspended),
Actions ("Edit"). No pagination (all matching users shown at once, per §8.5's exclusion).

"Create user" and "Edit" open a form (inline panel or modal — implementation detail left to
the branch that builds this screen, since the handout doesn't mandate one over the other;
either satisfies "modes: create/edit" as long as both are reachable from this one screen):

- **Create**: Name, Email, Role (single select — Requester/IT Staff/Administrator),
  Active (checkbox, default checked), Default password (text field, shown in the clear
  since the Administrator is choosing it, not the user's real password).
- **Edit**: Name, Email, Role, Active — plus a separate "Reset password" action (its own
  small form: new default password) kept apart from the main edit form, since it's a
  distinct API call (`POST .../reset-password`) with its own success message.

### Layout — tablet/mobile

Table becomes the same card-per-row pattern as §6's queue (Name + role/status badges on
top, email and Edit action below); Create/Edit forms stack single-column at any width (they
already are effectively single-column on desktop, being a short field list).

### States

| State | Shown |
|---|---|
| Loading list | "Loading users…" |
| Empty (search/filter with no matches) | "No users match your search." |
| Loaded | The table/cards |
| Create — validation error | Inline per-field messages, including the `409` duplicate-email case surfaced as a field-level message under Email, not a generic banner |
| Create — success | New row appears in the list; a confirmation line: "User created." |
| Edit — validation error | Same per-field pattern |
| Edit — blocked by self-suspend guard (`409`, BR-36) | "You cannot suspend your own account." shown at the Active checkbox |
| Edit — blocked by last-admin guard (`409`, BR-37) | "At least one active Administrator is required." shown at the Role/Active control |
| Edit — success | Row updates in place; confirmation line |
| Reset password — success | "Password reset. The user must set a new password at their next login." |
| Forbidden (`403`, non-Administrator reaching this screen) | Same dedicated forbidden panel as §6 |

## 9. Responsive and accessibility requirements

Same as Lab 2 (handout §8.7: "เหมือนกับ Lab 2"). Concretely, using Bootstrap 5.3's default
breakpoints (already in use via Lab 2's `.btn-group`/grid classes, never previously
restated numerically in `docs/lab-02/ui-spec.md`, so stated explicitly here for Lab 3's new
data-table screens):

- **Desktop**: ≥ 992px (`lg`) — full table layouts (§6, §8).
- **Tablet**: 768–991px (`md`) — reduced-column tables.
- **Mobile**: < 768px (`sm` and below) — stacked cards, collapsed filters.

Accessibility: every interactive control keeps a visible label (no icon-only buttons
without an `aria-label`); focus rings use the existing secondary-green box-shadow token
(`rgba(11,122,70,0.25)`), never removed; status/priority/role badges always pair color with
a text label (§1); form errors are associated with their field (`aria-describedby` or an
adjacent `<label>`-owned message, matching Lab 2's existing form pattern); the forced
Change Password screen and any Forbidden panel are reachable and readable via keyboard/
screen reader alone, since they're the only content on the page at that point.

## 10. Screenshot evidence and visual-inspection checklist

Screenshots for every Lab 3 screen (Login, Change Password, App Shell w/ each role's nav,
IT Staff Ticket Queue, IT Staff Ticket Detail, Administrator User Management) are captured
at desktop/tablet/mobile widths and stored under:

```
artifacts/lab-03/screenshots/
  authentication/{desktop,tablet,mobile}.png
  staff-queue/{desktop,tablet,mobile}.png
  staff-ticket-detail/{desktop,tablet,mobile}.png
  user-management/{desktop,tablet,mobile}.png
```

matching the required repository structure (handout §12). Visual-inspection checklist
(verified against the screenshots before Release Integration, issue #41):

- [ ] Every screen uses only the Zen Green tokens in §1 — no stray colors.
- [ ] Role-scoped navigation never shows a destination the current role can't reach.
- [ ] Badges are legible and never rely on color alone.
- [ ] Editable vs. read-only fields are visually distinct (`--zg-readonly-bg`) on every
      screen that mixes both (IT Staff Ticket Detail's IT Priority vs. Requested Priority
      being the clearest case).
- [ ] Error messages are positioned consistently (inline under the field for validation,
      a banner above the form/table for request failures) across all six new screens.
- [ ] Focus states are visible on every interactive control at every breakpoint.
- [ ] No clipping, overlap, or horizontal scroll at 375px (mobile), 768px (tablet), or
      1280px (desktop) reference widths.
- [ ] Internal Notes are visually unmistakable from Public Comments on the IT Staff Ticket
      Detail screen (§7).
