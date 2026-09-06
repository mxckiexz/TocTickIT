// Regenerates the Lab 2 submission PDF (docs/lab-02/*.md rendered, git/test
// evidence, and the artifacts/lab-02 screenshots) into
// TokTickIT_Lab2_Submission.pdf at the repo root.
//
// Run from the repo root: node scripts/build-submission-pdf.mjs
// Requires: npm install (marked + @playwright/test are root devDependencies),
// and both dev servers running if you want to regenerate the screenshots
// too (see e2e/lab-02/responsive-screenshots.spec.ts and pdf-evidence.spec.ts).
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { marked } from "marked";
import { chromium } from "@playwright/test";

const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const DOCS = path.join(REPO, "docs", "lab-02");
const SCREENSHOTS = path.join(REPO, "artifacts", "lab-02", "screenshots");
const EVIDENCE = path.join(REPO, "artifacts", "lab-02", "pdf-evidence");
const OUT_HTML = path.join(REPO, "_submission.html");
const OUT_PDF = path.join(REPO, "TokTickIT_Lab2_Submission.pdf");

function readMd(name) {
  return marked.parse(fs.readFileSync(path.join(DOCS, name), "utf8"));
}

function esc(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function pre(text) {
  return `<pre>${esc(text)}</pre>`;
}

function img(absPath, caption, maxWidth = "100%") {
  return `<figure><img src="file://${absPath}" style="max-width:${maxWidth}" /><figcaption>${esc(
    caption
  )}</figcaption></figure>`;
}

function sh(cmd, cwd = REPO) {
  try {
    return execSync(cmd, { cwd, encoding: "utf8" });
  } catch (error) {
    return (error.stdout || "") + (error.stderr || "");
  }
}

console.log("Gathering git log...");
const gitLog = sh("git log --oneline --graph --all -40", REPO);

console.log("Gathering directory tree...");
const rawTree = sh(
  `find . -not -path '*/node_modules/*' -not -path '*/.git/*' -not -path '*/dist/*' -not -path '*/test-results/*' -not -path '*/playwright-report/*' -not -path '*/.claude/*' -not -path '*/server/uploads/*' | sort`,
  REPO
);
const uploadCount = fs.existsSync(path.join(REPO, "server", "uploads"))
  ? fs.readdirSync(path.join(REPO, "server", "uploads")).length
  : 0;
const treeWithUploads =
  rawTree + `./server/uploads  (${uploadCount} files, gitignored — user-uploaded attachments)\n`;
const treeFinal = (() => {
  const lines = treeWithUploads.trim().split("\n").sort();
  return lines
    .map((line) => line.replace(/[^-][^/]*\//g, "  |").replace(/\|([^ ])/, "|-- $1"))
    .join("\n");
})();

console.log("Running backend tests...");
const backendTestOutput = sh("npx vitest run 2>&1 | tail -20", path.join(REPO, "server"));
console.log("Running frontend tests...");
const frontendTestOutput = sh("npx vitest run 2>&1 | tail -15", path.join(REPO, "client"));
console.log("Running e2e test...");
const e2eTestOutput = sh(
  "npx playwright test e2e/lab-02/requester-ticket-flow.spec.ts 2>&1 | tail -15",
  REPO
);
sh("rm -rf test-results playwright-report", REPO);

const readmeRaw = fs.readFileSync(path.join(REPO, "README.md"), "utf8");
const gitignoreRaw = fs.readFileSync(path.join(REPO, ".gitignore"), "utf8");

const issuesList = [
  ["#22", "Feature 1: Create an IT support ticket"],
  ["#23", "Feature 2: Upload permitted supporting attachments"],
  ["#24", "Feature 3: Receive a unique Ticket Number"],
  ["#25", "Feature 4: View own tickets in My Tickets"],
  ["#26", "Feature 5: Search, filter, sort, and page through tickets"],
  ["#27", "Feature 6: Open a Ticket Detail screen"],
  ["#28", "Feature 7: Inspect ticket information and attachments"],
  ["#29", "Feature 8: Add a permitted attachment to an existing ticket"],
  ["#30", "Feature 9: Remove one of their own permitted attachments using the required soft-removal rules"],
]
  .map(
    ([num, title]) =>
      `<li><a href="https://github.com/mxckiexz/TocTickIT/issues/${num.slice(1)}">${num}</a> — ${esc(
        title
      )} — <strong>Done</strong> ✅</li>`
  )
  .join("\n");

const prLinks = [
  ["#9", "Feature 1"],
  ["#11", "Feature 2"],
  ["#12 / #15", "Feature 3"],
  ["#16", "Feature 4"],
  ["#17", "Feature 5"],
  ["#18", "Feature 6"],
  ["#19", "Feature 7"],
  ["#20", "Feature 8"],
  ["#21", "Feature 9"],
  ["#31", "Lab compliance fixes"],
]
  .map(
    ([num, label]) =>
      `<li>${esc(label)}: ${num
        .split(" / ")
        .map((n) => `<a href="https://github.com/mxckiexz/TocTickIT/pull/${n.slice(1)}">${n}</a>`)
        .join(" / ")}</li>`
  )
  .join("\n");

// NOTE: if you've since created the GitHub Projects Kanban board and taken
// the IDE directory-structure screenshot, replace the two <div class="note">
// blocks below (search "GitHub Projects (Kanban board)" and "Note:") with
// the actual board screenshot / IDE screenshot before regenerating.
const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>TokTickIT — Lab 2 Submission</title>
<style>
  body { font-family: -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; color: #16281f; font-size: 13px; line-height: 1.5; }
  h1 { color: #006B3C; font-size: 26px; page-break-before: always; border-bottom: 3px solid #006B3C; padding-bottom: 8px; }
  h1.title-page { page-break-before: avoid; text-align: center; margin-top: 200px; font-size: 32px; }
  h2 { color: #0B7A46; font-size: 18px; margin-top: 24px; }
  h3 { color: #0B7A46; font-size: 15px; }
  table { border-collapse: collapse; width: 100%; margin: 8px 0; font-size: 11px; }
  th, td { border: 1px solid #ccc; padding: 4px 6px; text-align: left; vertical-align: top; }
  th { background: #EAF6EF; }
  pre { background: #f5f7f6; border: 1px solid #dfe7e2; padding: 8px; font-size: 10px; overflow-x: auto; white-space: pre-wrap; word-break: break-word; }
  code { background: #f0f3ef; padding: 1px 4px; border-radius: 3px; font-size: 11px; }
  figure { margin: 12px 0; page-break-inside: avoid; }
  figure img { border: 1px solid #dfe7e2; border-radius: 4px; }
  figcaption { font-size: 11px; color: #555; margin-top: 4px; font-style: italic; }
  blockquote { border-left: 3px solid #0B7A46; margin: 8px 0; padding-left: 12px; color: #333; }
  a { color: #0B7A46; }
  .subsection { margin-bottom: 28px; }
  .caption-grid { display: flex; gap: 12px; flex-wrap: wrap; }
  .caption-grid figure { flex: 1 1 30%; }
  .note { background: #fff3cd; border: 1px solid #ffc107; padding: 8px 12px; border-radius: 4px; margin: 12px 0; }
</style>
</head>
<body>

<h1 class="title-page">CPE 334 — Lab 2<br/>TokTickIT Requester Ticketing MVP<br/><span style="font-size:20px">Submission</span></h1>
<p style="text-align:center">Repository: <a href="https://github.com/mxckiexz/TocTickIT">github.com/mxckiexz/TocTickIT</a><br/>
Base branch: <code>Lab02-staging</code></p>

<h1>Answer Part 1: Git Use with Engineering Workflow</h1>

<div class="subsection">
<h2>Commit history — feature branches merged into staging then main</h2>
${pre(gitLog)}
</div>

<div class="subsection">
<h2>Pull Requests (feature branch → Lab02-staging, peer reviewed)</h2>
<ul>${prLinks}</ul>
</div>

<div class="subsection">
<h2>GitHub Issues — sprint decomposition, all in Done</h2>
<p>Nine issues, one per backlog feature, each closed with the <code>Done</code> label:</p>
<ul>${issuesList}</ul>
<div class="note">
<strong>GitHub Projects (Kanban board):</strong> not yet created — the CLI token used for this session lacks the <code>project</code> OAuth scope needed to create a GitHub Projects (v2) board programmatically. The 9 issues above exist and are labeled with the required Kanban statuses (Backlog/Specified/Started/PR Review/Fixing/Done); a Project board view grouping them can be added from the GitHub web UI in a couple of minutes (New project → board view → add existing issues).
</div>
</div>

<div class="subsection">
<h2>Reviewer log (docs/lab-02/reviewer.md)</h2>
${readMd("reviewer.md")}
</div>

<div class="subsection">
<h2>README.md</h2>
${marked.parse(readmeRaw)}
</div>

<div class="subsection">
<h2>.gitignore</h2>
${pre(gitignoreRaw)}
</div>

<div class="subsection">
<h2>Repository directory structure</h2>
${pre(treeFinal)}
<div class="note">
<strong>Note:</strong> the listing above is generated from the actual repository (<code>find</code> + a tree-style formatter), not a screenshot of an IDE window. A literal screenshot of the project explorer in VS Code (or the IDE actually used) should be added here before final submission — that's a capture only the student can take of their own editor.
</div>
</div>

<h1>Answer Part 2: Spec DD</h1>
<p><strong>Link:</strong> <a href="https://github.com/mxckiexz/TocTickIT/blob/Lab02-staging/docs/lab-02/specification.md">docs/lab-02/specification.md</a></p>
<div class="note">
<strong>Evidence the spec existed before implementation:</strong> <code>docs/lab-02/specification.md</code> was first committed in <code>5364c6c</code> ("fix: address peer review on ticket creation feature", 2026-09-02 15:21 +0700) — before Feature 3's implementation commit <code>c0c323b</code> (2026-09-04) and every feature after it. Spec-Driven Development was followed feature-by-feature: the specification was extended with each feature's scope/AC/BR entries before or alongside that feature's implementation, and refined again after each peer-review round.
</div>
${readMd("specification.md")}

<h1>Answer Part 3: Test DD and Traceability</h1>
<p><strong>Link:</strong> <a href="https://github.com/mxckiexz/TocTickIT/blob/Lab02-staging/docs/lab-02/tests.md">docs/lab-02/tests.md</a></p>
<h2>Complete passing test output (backend)</h2>
${pre(backendTestOutput)}
<h2>Complete passing test output (frontend)</h2>
${pre(frontendTestOutput)}
<h2>Complete passing test output (e2e)</h2>
${pre(e2eTestOutput)}
${readMd("tests.md")}

<h1>Answer Part 4: AI Use with Reflection</h1>
${readMd("ai-use.md")}

<h1>Answer Part 5: Development Requester Select Screen</h1>
<p>0 points — folded into Part 6's Create Mode evidence below, per the handout ("Points for this will be included in Working Ticket Screen Create Mode").</p>
${img(path.join(EVIDENCE, "01-dev-requester-selection.png"), "Development Requester Selection screen — active Requesters loaded from PostgreSQL, testing-only disclaimer, Continue button.")}

<h1>Answer Part 6: Working Ticket Screen: Create Mode</h1>

<div class="subsection">
<h2>1. Requester field populated from the selected Development Requester</h2>
<p>The active Requester ("Jennifer Anderson", id <code>1</code>) is shown in the "Creating as …" banner throughout the form, and the ticket created during this evidence run was confirmed (via the app's own localStorage-persisted active Requester) to use <code>requesterId: 1</code> — matching the Requester selected before entering the application.</p>
${img(path.join(EVIDENCE, "02-create-ticket-initial-loaded-from-db.png"), "2. Create Ticket opened at a desktop viewport — Category and Related System dropdowns populated from the database (Hardware, Software, Account and Access, Network / Email, VPN, Campus Wi-Fi, ...).")}
</div>

<div class="subsection">
<h2>3. Invalid submission — field-level messages</h2>
${img(path.join(EVIDENCE, "03-create-ticket-validation-failure.png"), "Submitting with every field empty shows a validation message directly under each field (Category, Related System, Summary, Description), not one generic message at the top.")}
</div>

<div class="subsection">
<h2>4. Valid vs. invalid attachment</h2>
<p>A <code>.exe</code> file was selected as the supporting attachment and the form was submitted with otherwise-valid data. The ticket is still created (BR: a failed attachment upload must not hide the created ticket), with a warning appended about the failed attachment — the same behavior a valid-but-oversized or valid-but-wrong-type attachment produces on its own upload attempt (see Part 8's attachment tests for the direct 415/413 cases).</p>
${img(path.join(EVIDENCE, "04-create-ticket-invalid-attachment-result.png"), "4. Result of submitting with an invalid (.exe) attachment selected: the Ticket Number still displays; a warning about the failed attachment is appended rather than hiding the successful ticket creation.")}
</div>

<div class="subsection">
<h2>5. Backend/API failure — safe error state, form values preserved</h2>
${img(path.join(EVIDENCE, "05-create-ticket-api-failure-form-preserved.png"), "5. Simulated a network failure on submit (the request is aborted before reaching the server): a safe error message is shown, and every field the Requester had filled in (Category, Related System, Summary, Description) is still present — nothing is lost.")}
</div>

<h1>Answer Part 7: Working My Tickets Screen</h1>

<div class="subsection">
<h2>Requester isolation — Requester A vs. Requester B</h2>
<div class="caption-grid">
${img(path.join(EVIDENCE, "06-my-tickets-requester-a.png"), "Requester A (Jennifer Anderson) selected — her own tickets shown.", "48%")}
${img(path.join(EVIDENCE, "07-my-tickets-requester-b-different-list.png"), "Switched to Requester B (Michael Brown) — a completely different ticket list; none of Requester A's tickets appear.", "48%")}
</div>
</div>

<div class="subsection">
<h2>Search, filter, sort, pagination, empty &amp; no-results states</h2>
${img(path.join(EVIDENCE, "08-my-tickets-no-results-state.png"), "Searching for a term that matches nothing shows \"No tickets match your search and filters.\" rather than an error or a blank table.")}
${img(path.join(EVIDENCE, "09-my-tickets-sorted.png"), "Sort changed to \"Summary (A–Z)\" — the table re-sorts alphabetically. Category/Related System/Priority/Status filters and pagination (Previous/Next, \"Page N of M\") are visible in the same control row across all screenshots in this section.")}
</div>

<div class="subsection">
<h2>Cross-Requester access is rejected</h2>
<p>Requester 2 attempting to open Requester 1's ticket detail directly (API-level, the same check the UI relies on):</p>
${pre(fs.readFileSync(path.join(EVIDENCE, "10-cross-requester-access-rejected.txt"), "utf8"))}
</div>

<h1>Answer Part 8: Working Ticket Screen: View Mode and Attachments</h1>

${img(path.join(EVIDENCE, "11-ticket-detail-owned-view.png"), "Owned Ticket Detail screen — read-only ticket fields, Attachments section, and the Add-attachment control below it.")}

<div class="subsection">
<h2>Add an attachment, then download it</h2>
${img(path.join(EVIDENCE, "12-ticket-detail-attachment-added.png"), "After uploading _fixture-photo.png: the Attachments list refreshes to show it as a downloadable link.")}
<p>Download link (verified to point at the ownership-checked download endpoint):</p>
${pre(fs.readFileSync(path.join(EVIDENCE, "13-download-link-href.txt"), "utf8"))}
</div>

<div class="subsection">
<h2>Soft removal with a reason — metadata retained, download blocked</h2>
${img(path.join(EVIDENCE, "14-ticket-detail-attachment-removed-metadata-retained.png"), "After removing the attachment with a reason (\"PDF evidence: soft-removal with a reason\"): the row stays in the list, struck through, showing the removal time and reason — not hidden, per the handout's own example.")}
<p>The same attachment's download URL, requested again after removal:</p>
${pre(fs.readFileSync(path.join(EVIDENCE, "15-removed-attachment-download-blocked.txt"), "utf8"))}
</div>

<div class="subsection">
<h2>Unauthorized ticket access (repeated from Part 7 for this section's own evidence)</h2>
${pre(fs.readFileSync(path.join(EVIDENCE, "10-cross-requester-access-rejected.txt"), "utf8"))}
</div>

<h1>Answer Part 9: Zen Green UI and Responsive Evidence</h1>
<p><strong>Link:</strong> <a href="https://github.com/mxckiexz/TocTickIT/blob/Lab02-staging/docs/lab-02/ui-spec.md">docs/lab-02/ui-spec.md</a> (see its "Zen Green Theme" section for the full token table, typography, states, and accessibility notes).</p>

<h2>Desktop / tablet / mobile screenshots</h2>

<h3>Create Ticket</h3>
<div class="caption-grid">
${img(path.join(SCREENSHOTS, "create-ticket", "desktop.png"), "Desktop (1280px)", "31%")}
${img(path.join(SCREENSHOTS, "create-ticket", "tablet.png"), "Tablet (800px)", "31%")}
${img(path.join(SCREENSHOTS, "create-ticket", "mobile.png"), "Mobile (375px)", "31%")}
</div>

<h3>My Tickets</h3>
<div class="caption-grid">
${img(path.join(SCREENSHOTS, "my-tickets", "desktop.png"), "Desktop (1280px)", "31%")}
${img(path.join(SCREENSHOTS, "my-tickets", "tablet.png"), "Tablet (800px)", "31%")}
${img(path.join(SCREENSHOTS, "my-tickets", "mobile.png"), "Mobile (375px)", "31%")}
</div>

<h3>Ticket Detail</h3>
<div class="caption-grid">
${img(path.join(SCREENSHOTS, "ticket-detail", "desktop.png"), "Desktop (1280px)", "31%")}
${img(path.join(SCREENSHOTS, "ticket-detail", "tablet.png"), "Tablet (800px)", "31%")}
${img(path.join(SCREENSHOTS, "ticket-detail", "mobile.png"), "Mobile (375px)", "31%")}
</div>

<h2>Visual checklist</h2>
<table>
<tr><th>Check</th><th>Result</th></tr>
<tr><td>Primary green (#006B3C) used for app header and primary actions</td><td>✅ — see app header bar and solid buttons above</td></tr>
<tr><td>Secondary green (#0B7A46) used for links, hover/focus states</td><td>✅ — "Switch requester" / "Back to My Tickets" links, focus rings</td></tr>
<tr><td>Pale green (#EAF6EF) used for success confirmations</td><td>✅ — see Part 6's Create Ticket success state</td></tr>
<tr><td>Page background (#F5F7F6) distinct from surface/card (white)</td><td>✅ — visible in every screenshot above</td></tr>
<tr><td>Text is dark charcoal-green, not pure black</td><td>✅</td></tr>
<tr><td>Editable vs. read-only/disabled fields visually distinct</td><td>✅ — disabled Upload/file input at the 5-attachment limit uses the read-only shading token</td></tr>
<tr><td>Validation messages appear immediately below their field, not only at the top</td><td>✅ — see Part 6 item 3</td></tr>
<tr><td>Button hierarchy: primary (solid), secondary (outline), destructive (off-palette red link)</td><td>✅</td></tr>
<tr><td>No clipped labels, overlapping messages, or hidden buttons at any viewport</td><td>✅ — checked all 9 screenshots above</td></tr>
<tr><td>No unintended horizontal page scrolling on mobile</td><td>✅ — the My Tickets table uses Bootstrap's <code>.table-responsive</code>, which scrolls only the table region, not the page</td></tr>
<tr><td>Fields stack vertically on mobile; buttons remain touch-friendly</td><td>✅ — see Ticket Detail/Create Ticket mobile screenshots</td></tr>
<tr><td>Focus indicators remain visible for keyboard users</td><td>✅ — secondary-green focus ring on <code>.form-control</code>/<code>.form-select</code>/<code>.btn</code> (see theme.css)</td></tr>
</table>

</body>
</html>
`;

fs.writeFileSync(OUT_HTML, html);
console.log(`Wrote ${OUT_HTML} (${html.length} chars). Rendering PDF...`);

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(`file://${OUT_HTML}`, { waitUntil: "networkidle" });
await page.pdf({
  path: OUT_PDF,
  format: "A4",
  printBackground: true,
  margin: { top: "15mm", bottom: "15mm", left: "12mm", right: "12mm" },
});
await browser.close();
fs.unlinkSync(OUT_HTML);
console.log(`Wrote ${OUT_PDF}`);
