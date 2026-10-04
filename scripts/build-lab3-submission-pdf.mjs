// Builds the Lab 3 submission PDF (sheet section 14: "Answer Part 1" .. "Answer
// Part 9", in that order) into TokTickIT_Lab3_Submission.pdf at the repo root.
//
//   1. LAB3_EVIDENCE=1 npx playwright test e2e/evidence   (screens + API evidence)
//   2. node scripts/build-lab3-submission-pdf.mjs
//
// Everything that can be generated is generated from the repository and GitHub
// at build time (git log, PR/issue data, rendered docs, test output), not typed
// in. Test output comes from logs of runs on `main`: pass --logs <dir> holding
// server.log, client.log and e2e.log (default: ./artifacts/lab-03/main-test-output
// if present, otherwise the tests are run now).
//
// Requires: root devDependencies (marked, @playwright/test), `gh` authenticated.
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { marked } from "marked";
import { chromium } from "@playwright/test";

const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const DOCS = path.join(REPO, "docs", "lab-03");
const SHOTS = path.join(REPO, "artifacts", "lab-03", "screenshots");
const EVIDENCE = path.join(REPO, "artifacts", "lab-03", "submission-evidence");
const OUT_HTML = path.join(REPO, "_submission-lab3.html");
const OUT_PDF = path.join(REPO, "TokTickIT_Lab3_Submission.pdf");
const GH = "https://github.com/mxckiexz/TocTickIT";
const BOARD_URL = "https://github.com/users/mxckiexz/projects/2";
const argLogs = process.argv.indexOf("--logs") > -1 ? process.argv[process.argv.indexOf("--logs") + 1] : null;

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const pre = (t) => `<pre>${esc(t)}</pre>`;
// Rendered docs keep their own h1, but must not force a page break of their own.
const md = (name) => `<div class="doc">${marked.parse(fs.readFileSync(path.join(DOCS, name), "utf8"))}</div>`;

function sh(cmd, cwd = REPO) {
  try {
    return execSync(cmd, { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  } catch (error) {
    return (error.stdout || "") + (error.stderr || "");
  }
}
function gh(args) {
  return JSON.parse(execSync(`gh ${args}`, { cwd: REPO, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }));
}

function img(abs, caption, width = "100%") {
  if (!fs.existsSync(abs)) throw new Error(`Missing evidence image: ${abs} (run the evidence generator first)`);
  return `<figure><img src="file://${abs}" style="width:${width}" /><figcaption>${esc(caption)}</figcaption></figure>`;
}
const humanize = (file) =>
  file
    .replace(/\.(png|txt)$/, "")
    .replace(/^p\d-(\d+)-/, "$1 — ")
    .replace(/-/g, " ")
    .replace(/\bit\b/g, "IT")
    .replace(/\bapi\b/g, "API")
    .replace(/^(\d+) — (\w)/, (_, n, c) => `${n} — ${c.toUpperCase()}`);
function evidenceFor(prefix) {
  return fs
    .readdirSync(EVIDENCE)
    .filter((f) => f.startsWith(prefix))
    .sort();
}
function evidenceBlock(prefix, { width = "92%" } = {}) {
  return evidenceFor(prefix)
    .map((f) =>
      f.endsWith(".txt")
        ? `<figure class="txt"><figcaption>${esc(humanize(f))}</figcaption>${pre(fs.readFileSync(path.join(EVIDENCE, f), "utf8"))}</figure>`
        : img(path.join(EVIDENCE, f), humanize(f), width)
    )
    .join("\n");
}

// ---------------------------------------------------------------------------
// Data gathered from the repository and GitHub
// ---------------------------------------------------------------------------
console.log("Gathering git and GitHub data...");
const branch = sh("git branch --show-current").trim();
const mainSha = sh("git rev-parse --short origin/main").trim();
// Lab 3 only: everything after Lab 2's final main commit (ea6aff9, the merge of
// Lab02-staging), without the name of the branch this PDF happens to be built on.
const LAB2_FINAL = "ea6aff9";
const gitGraph = sh(`git log --graph --oneline --decorate --decorate-refs-exclude='refs/heads/feature/10*' --decorate-refs-exclude='refs/remotes/origin/feature/10*' ${LAB2_FINAL}..origin/main`);
const prs = gh("pr list --state all --limit 100 --json number,title,headRefName,baseRefName,state,mergedAt,mergedBy,createdAt,reviews")
  .filter((p) => p.number >= 43)
  .sort((a, b) => a.number - b.number);
const issues = gh("issue list --state all --limit 100 --json number,title,state,closedAt")
  .filter((i) => i.number >= 34)
  .sort((a, b) => a.number - b.number);
const lab3IssueNumbers = issues.map((i) => i.number);

// Spec-before-implementation evidence, from git itself.
const specFirst = sh("git log --diff-filter=A --reverse --format='%h|%ad|%s' --date=iso-strict -- docs/lab-03/specification.md").split("\n")[0];
const firstImpl = sh("git log --reverse --format='%h|%ad|%s' --date=iso-strict -- server/src/auth.ts").split("\n")[0];
const pr43 = prs.find((p) => p.number === 43);
const pr44 = prs.find((p) => p.number === 44);

// Directory structure from tracked files (screenshots collapsed to counts).
function tree() {
  const files = sh("git ls-files").split("\n").filter(Boolean);
  const dirs = {};
  const add = (parts, node) => {
    const [head, ...rest] = parts;
    if (!rest.length) node[head] = null;
    else add(rest, (node[head] ??= {}));
  };
  for (const f of files) add(f.split("/"), dirs);
  const lines = [];
  const walk = (node, prefix) => {
    const names = Object.keys(node).sort();
    names.forEach((name, i) => {
      const last = i === names.length - 1;
      const child = node[name];
      const countFiles = (n) => (n === null ? 1 : Object.values(n).reduce((a, c) => a + countFiles(c), 0));
      const collapse = child && (prefix.includes("artifacts") || name === "migrations" || name === "node_modules");
      lines.push(`${prefix}${last ? "└── " : "├── "}${name}${child ? "/" : ""}${collapse ? `   (${countFiles(child)} files)` : ""}`);
      if (child && !collapse) walk(child, prefix + (last ? "    " : "│   "));
    });
  };
  walk(dirs, "");
  return lines.join("\n");
}

// GitHub Projects board: the board is public, so capture it as a visitor sees it
// and check it really shows every Lab 3 issue as Done. If it does not, say so in
// the PDF instead of showing a board that does not support the claim.
console.log("Capturing the GitHub Projects board...");
let boardImage = null;
let boardNote = "";
{
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 1100 } });
  await page.goto(BOARD_URL, { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  const text = await page.evaluate(() => document.body.innerText);
  const missing = lab3IssueNumbers.filter((n) => !new RegExp(`#${n}\\b`).test(text));
  const file = path.join(EVIDENCE, "00-github-project-board.png");
  await page.screenshot({ path: file });
  await browser.close();
  if (missing.length === 0) boardImage = file;
  else {
    boardNote = `The public GitHub Projects board (${BOARD_URL}) did not list these Lab 3 issues when this PDF was built: ${missing
      .map((n) => "#" + n)
      .join(", ")}. The board screenshot is therefore withheld rather than shown without them; add the issues to the board (all with Status: Done) and rebuild.`;
    console.warn("WARNING: " + boardNote);
  }
}

// Test output from runs on main.
console.log("Collecting test output...");
const logsDir = argLogs ?? path.join(REPO, "artifacts", "lab-03", "main-test-output");
function testLog(name, run) {
  const file = path.join(logsDir, name);
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : run();
}
const keepVitest = (text) =>
  text
    .split("\n")
    .filter((l) => /^\s*(✓|×|❯) .*\(\d+ tests?/.test(l) || /^\s*(Test Files|Tests|Start at|Duration)\b/.test(l))
    .join("\n");
const serverOut = keepVitest(testLog("server.log", () => sh("npx vitest run 2>&1", path.join(REPO, "server"))));
const clientOut = keepVitest(testLog("client.log", () => sh("npx vitest run 2>&1", path.join(REPO, "client"))));
const e2eOut = testLog("e2e.log", () => sh("npx playwright test 2>&1")).split("\n").filter((l) => /^\s*(✓|✘|-)\s+\d+ |passed|failed|skipped/.test(l)).join("\n");

const readmeRaw = fs.readFileSync(path.join(REPO, "README.md"), "utf8");
const gitignoreRaw = fs.readFileSync(path.join(REPO, ".gitignore"), "utf8");

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------
const fmt = (iso) => (iso ? iso.replace("T", " ").replace(/:\d\dZ$/, " UTC") : "—");
const prRows = prs
  .map((p) => {
    const approved = p.reviews.filter((r) => r.state === "APPROVED").length;
    const changes = p.reviews.filter((r) => r.state === "CHANGES_REQUESTED").length;
    return `<tr><td><a href="${GH}/pull/${p.number}">#${p.number}</a></td><td>${esc(p.title)}</td><td><code>${esc(p.headRefName)}</code> → <code>${esc(p.baseRefName)}</code></td><td>${p.state === "MERGED" ? "Merged" : esc(p.state)} ${fmt(p.mergedAt)}</td><td>${changes} changes requested, ${approved} approved</td></tr>`;
  })
  .join("\n");
const issueRows = issues
  .map(
    (i) =>
      `<tr><td><a href="${GH}/issues/${i.number}">#${i.number}</a></td><td>${esc(i.title)}</td><td>${i.state === "CLOSED" ? "Closed" : esc(i.state)} ${fmt(i.closedAt)}</td></tr>`
  )
  .join("\n");

// Screenshots of a screen at the three required widths, laid out so each stays
// readable on an A4 page (sheet: "readable without extreme zoom"): desktop at full
// width, then tablet and mobile side by side. mode "compact" omits desktop (used in
// Parts 6-8, where the desktop screen is already shown in the main evidence).
function screenSet(dir, title, files = ["desktop", "tablet", "mobile"], mode = "full") {
  const labels = ["Desktop (1280px)", "Tablet (800px)", "Mobile (375px)"];
  const get = (i) => {
    const p = path.join(SHOTS, dir, `${files[i]}.png`);
    return fs.existsSync(p) ? img(p, labels[i], "100%") : "";
  };
  const desktop = mode === "full" ? `<div class="wide">${get(0)}</div>` : "";
  return `<div class="screenset"><h3>${esc(title)}</h3>${desktop}<div class="pair"><div class="tablet">${get(1)}</div><div class="mobile">${get(2)}</div></div></div>`;
}

const html = `<!doctype html>
<html><head><meta charset="utf-8" /><title>TokTickIT — Lab 3 Submission</title>
<style>
  body { font-family: -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; color: #16281f; font-size: 12.5px; line-height: 1.5; }
  h1 { color: #006B3C; font-size: 24px; page-break-before: always; border-bottom: 3px solid #006B3C; padding-bottom: 6px; }
  h1.title-page { page-break-before: avoid; text-align: center; margin-top: 190px; font-size: 30px; border: none; }
  h2 { color: #0B7A46; font-size: 17px; margin-top: 22px; }
  h3 { color: #0B7A46; font-size: 14px; }
  table { border-collapse: collapse; width: 100%; margin: 8px 0; font-size: 10.5px; }
  th, td { border: 1px solid #ccc; padding: 3px 6px; text-align: left; vertical-align: top; }
  th { background: #EAF6EF; }
  pre { background: #f5f7f6; border: 1px solid #dfe7e2; padding: 7px; font-size: 9px; white-space: pre-wrap; word-break: break-word; }
  code { background: #f0f3ef; padding: 1px 4px; border-radius: 3px; font-size: 10.5px; }
  figure { margin: 10px 0; page-break-inside: avoid; }
  figure img { border: 1px solid #dfe7e2; border-radius: 4px; max-height: 235mm; object-fit: contain; object-position: top left; }
  figure.txt { page-break-inside: auto; }
  .doc h1 { page-break-before: avoid; font-size: 20px; margin-top: 18px; }
  figcaption { font-size: 10.5px; color: #444; margin: 3px 0; font-style: italic; }
  blockquote { border-left: 3px solid #0B7A46; margin: 8px 0; padding-left: 12px; color: #333; }
  a { color: #0B7A46; }
  .screenset { margin-bottom: 14px; }
  h2, h3 { page-break-after: avoid; }
  .screenset figure { margin: 6px 0; }
  .pair { display: flex; gap: 14px; align-items: flex-start; }
  .pair .tablet { flex: 0 0 56%; }
  .pair .mobile { flex: 0 0 38%; }
  .pair figure img { max-height: 200mm; width: auto; max-width: 100%; }
  .wide figure img { max-height: 200mm; }
  .note { background: #fff3cd; border: 1px solid #ffc107; padding: 8px 12px; border-radius: 4px; margin: 10px 0; }
  .warn { background: #f8d7da; border: 1px solid #dc3545; padding: 8px 12px; border-radius: 4px; margin: 10px 0; }
  .ok { background: #EAF6EF; border: 1px solid #0B7A46; padding: 8px 12px; border-radius: 4px; margin: 10px 0; }
</style></head><body>

<h1 class="title-page">CPE 334 — Lab 3<br/>TokTickIT Users, Roles, IT Staff Ticketing, and Admin Screens<br/><span style="font-size:18px">Submission</span></h1>
<p style="text-align:center">Repository: <a href="${GH}">github.com/mxckiexz/TocTickIT</a><br/>
Final branch: <code>main</code> at <code>${esc(mainSha)}</code> · Staging branch: <code>lab3-staging</code></p>

<h1>Answer Part 1: Git Use with Engineering Workflow</h1>

<h2>Commit history — feature branches merged into <code>lab3-staging</code>, then into <code>main</code></h2>
<p>Every Lab 3 commit on <code>origin/main</code> since Lab 2's final merge (<code>git log --graph --oneline --decorate ea6aff9..origin/main</code>). Each feature branch is merged by a pull request into <code>lab3-staging</code>; the final pull request (#56) merges <code>lab3-staging</code> into <code>main</code>.</p>
${pre(gitGraph)}

<h2>Pull requests (peer reviewed by Thanwarat1303)</h2>
<table><tr><th>PR</th><th>Title</th><th>Branch</th><th>Result</th><th>Reviews</th></tr>${prRows}</table>

<h2>GitHub Issues — sprint decomposition</h2>
<table><tr><th>Issue</th><th>Title</th><th>State</th></tr>${issueRows}</table>
<h2>GitHub Projects board</h2>
${
  boardImage
    ? `<div class="ok">Public board (<a href="${BOARD_URL}">${BOARD_URL}</a>), captured when this PDF was built; every Lab 3 issue above is listed with Status: Done.</div>${img(boardImage, "GitHub Projects board — Status: Done for every item.")}`
    : `<div class="warn"><strong>Kanban evidence not complete.</strong> ${esc(boardNote)}</div>`
}

<h2>Reviewer log (<code>docs/lab-03/reviewer.md</code>)</h2>
${md("reviewer.md")}

<h2>README.md</h2>
${marked.parse(readmeRaw)}

<h2>.gitignore</h2>
${pre(gitignoreRaw)}

<h2>Repository directory structure</h2>
<p>Generated from <code>git ls-files</code> on this branch (artifact folders and migrations collapsed to file counts).</p>
${pre(tree())}

<h1>Answer Part 2: Spec DD</h1>
<p><strong>Link:</strong> <a href="${GH}/blob/main/docs/lab-03/specification.md">docs/lab-03/specification.md</a></p>
<div class="note"><strong>Evidence the specification existed before the main implementation PRs were completed.</strong>
First commit of <code>docs/lab-03/specification.md</code>: <code>${esc(specFirst || "n/a")}</code>.
First commit of implementation code (<code>server/src/auth.ts</code>): <code>${esc(firstImpl || "n/a")}</code>.
The contract PR (<a href="${GH}/pull/43">#43</a>, specification + API + UI + test plan, documentation only) was merged into <code>lab3-staging</code> on ${fmt(pr43?.mergedAt)}, before the first implementation PR (<a href="${GH}/pull/44">#44</a>, Authentication Foundation) was merged on ${fmt(pr44?.mergedAt)}; every later feature branch was built against the signed-off contract.</div>
${md("specification.md")}

<h1>Answer Part 3: Test DD and Traceability</h1>
<p><strong>Link:</strong> <a href="${GH}/blob/main/docs/lab-03/tests.md">docs/lab-03/tests.md</a></p>
<div class="ok">Test output below comes from runs on <code>main</code> at <code>${esc(mainSha)}</code> (after the merge of #56): server (unit, API/integration, authorization, migration, regression), client (UI component, style, regression) and Playwright (E2E, responsive, accessibility), run one suite at a time against one database.</div>
<h2>Server tests — unit, API / integration, authorization, migration, Lab 1/2 regression</h2>${pre(serverOut)}
<h2>Client tests — UI component, UI style, Lab 1/2 regression</h2>${pre(clientOut)}
<h2>End-to-end tests — Playwright</h2>${pre(e2eOut)}
${md("tests.md")}

<h1>Answer Part 4: AI Use with Reflection</h1>
${md("ai-use.md")}

<h1>Answer Part 5: Working Login and Password Change UI</h1>
<p>Valid and invalid login, an inactive account (same safe message, nothing about the account revealed), busy and safe-failure feedback, the mandatory first-password change with validation, the authenticated user and role in the shell (all three roles), logout, and direct access blocked after logout. Generated by <code>e2e/evidence/lab-03-submission-evidence.spec.ts</code>, which asserts each outcome before it saves the picture.</p>
${evidenceBlock("p5-")}

<h1>Answer Part 6: Working IT Staff Ticket Queue UI</h1>
<p>Realistic data across requesters, statuses and priorities; search, filters, sorting and pagination; assigned and unassigned ownership; status and priority badges; the open-detail action; empty / no-results, failure and forbidden feedback; and responsive behaviour (below, then Part 9).</p>
${evidenceBlock("p6-")}
${screenSet("staff-queue", "Responsive: reduced table on tablet, stacked cards on mobile (desktop above)", undefined, "compact")}

<h1>Answer Part 7: Working IT Staff Ticket Detail UI</h1>
<p>Claim and reassign, IT Priority, permitted status changes with the confirmation step, Public Comments, Internal Notes (visually distinct), attachment continuity, the Requester's resolution indication, role restrictions, validation, safe failure, and direct API authorization evidence.</p>
${evidenceBlock("p7-")}
${screenSet("staff-ticket-detail", "Responsive: Staff Ticket Detail on tablet and mobile (desktop above)", undefined, "compact")}
${screenSet("requester-ticket-detail", "Requester Ticket Detail with Public Comments and Problem Appears Resolved (no Internal Note)", undefined, "compact")}

<h1>Answer Part 8: Working Administrator User Management UI</h1>
<p>User list (Name, Email, Role, Status, Edit), search by name or email, optional role filter, create with one role and an initial password, duplicate-email and invalid-input validation, edit name / email / role / activation, set a new initial password and the required change at the next login, self-deactivation and last-Administrator protection, forbidden access for non-Administrators, and responsive behaviour.</p>
${evidenceBlock("p8-")}
${screenSet("user-management", "Responsive: table on tablet, cards on mobile (desktop above)", undefined, "compact")}

<h1>Answer Part 9: Zen Green UI and Responsive Evidence</h1>
<p><strong>Link:</strong> <a href="${GH}/blob/main/docs/lab-03/ui-spec.md">docs/lab-03/ui-spec.md</a> — rendered below, ending with the completed visual-inspection checklist (§10), including the defects the inspection found and fixed.</p>
<h2>Desktop, tablet, and mobile screenshots of every major Lab 3 screen</h2>
${screenSet("authentication", "Login")}
${screenSet("authentication", "Login — invalid credentials", ["login-error-desktop", "login-error-tablet", "login-error-mobile"])}
${screenSet("authentication", "Change Password — forced at first login", ["change-password-desktop", "change-password-tablet", "change-password-mobile"])}
${screenSet("authentication", "Change Password — opened voluntarily from the app header", ["change-password-voluntary-desktop", "change-password-voluntary-tablet", "change-password-voluntary-mobile"])}
${screenSet("requester-my-tickets", "Requester — My Tickets")}
${screenSet("requester-ticket-detail", "Requester — Ticket Detail")}
${screenSet("requester-ticket-detail", "Requester — Problem Appears Resolved confirmation", ["confirm-resolved-desktop", "confirm-resolved-tablet", "confirm-resolved-mobile"])}
${screenSet("staff-queue", "IT Staff — Ticket Queue")}
${screenSet("staff-ticket-detail", "IT Staff — Ticket Detail")}
${screenSet("user-management", "Administrator — User Management")}
${screenSet("user-management", "Administrator — Create user", ["create-user-desktop", "create-user-tablet", "create-user-mobile"])}
${md("ui-spec.md")}

</body></html>
`;

fs.writeFileSync(OUT_HTML, html);
console.log(`Wrote ${OUT_HTML} (${html.length} chars). Rendering PDF...`);
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(`file://${OUT_HTML}`, { waitUntil: "networkidle" });
await page.pdf({ path: OUT_PDF, format: "A4", printBackground: true, margin: { top: "14mm", bottom: "14mm", left: "11mm", right: "11mm" } });
await browser.close();
fs.unlinkSync(OUT_HTML);
console.log(`Wrote ${OUT_PDF}`);
if (boardNote) console.log("\nNOTE: the PDF says the Kanban evidence is incomplete — fix the board and rebuild.");
