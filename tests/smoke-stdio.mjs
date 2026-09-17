/**
 * End-to-end smoke test over real stdio: spawns the built server (npm start)
 * twice and checks that per-user preferences reach tool descriptions and
 * get_my_context. Run after `npm run build`:
 *
 *   node tests/smoke-stdio.mjs
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const repo = process.cwd();
const savedDir = mkdtempSync(join(tmpdir(), "redmine-smoke-saved-"));
const emptyDir = mkdtempSync(join(tmpdir(), "redmine-smoke-empty-"));
mkdirSync(join(savedDir, "redmine-mcp"), { recursive: true });
writeFileSync(
  join(savedDir, "redmine-mcp", "preferences.json"),
  JSON.stringify({
    focusProjects: [
      { id: 5, name: "Backend Core" },
      { id: 12, name: "Mobile App" },
    ],
    defaultActivityId: 18,
    defaultActivityName: "Development",
  })
);

let failures = 0;
function check(label, ok) {
  console.log((ok ? "✔" : "✖") + " " + label);
  if (!ok) failures++;
}

// Round 1: preferences saved -> context injected into descriptions.
const client = new Client({ name: "smoke", version: "0.0.0" });
await client.connect(
  new StdioClientTransport({
    command: "npm",
    args: ["start", "--silent"],
    cwd: repo,
    env: { ...process.env, XDG_CONFIG_HOME: savedDir },
  })
);
const tools = await client.listTools();
const list = tools.tools.find((t) => t.name === "redmine_list_issues");
const projects = tools.tools.find((t) => t.name === "redmine_list_projects");
check(
  "descriptions carry focus projects",
  list.description.includes("Backend Core (id=5)") &&
    list.description.includes("Mobile App (id=12)") &&
    projects.description.includes("Backend Core (id=5)")
);
check(
  "preference tools are registered",
  tools.tools.some((t) => t.name === "redmine_get_my_context") &&
    tools.tools.some((t) => t.name === "redmine_save_preferences")
);
const ctx = await client.callTool({ name: "redmine_get_my_context", arguments: {} });
const ctxText = ctx.content[0].text;
check(
  "get_my_context returns saved prefs without onboarding",
  ctxText.includes('"focusProjects"') && !ctxText.includes("None yet")
);
await client.close();

// Round 2: no preferences at all -> onboarding hint instead. The env var is
// cleared because it is a legitimate catchAllIssueId fallback that would
// otherwise count as saved personalization.
const client2 = new Client({ name: "smoke2", version: "0.0.0" });
await client2.connect(
  new StdioClientTransport({
    command: "npm",
    args: ["start", "--silent"],
    cwd: repo,
    env: { ...process.env, XDG_CONFIG_HOME: emptyDir, REDMINE_MGMT_ISSUE_ID: "" },
  })
);
const tools2 = await client2.listTools();
const list2 = tools2.tools.find((t) => t.name === "redmine_list_issues");
check(
  "empty state: onboarding hint rides in descriptions",
  list2.description.includes("none saved yet") &&
    list2.description.includes("redmine_save_preferences")
);
const ctx2 = await client2.callTool({ name: "redmine_get_my_context", arguments: {} });
check(
  "empty state: get_my_context carries onboarding steps",
  ctx2.content[0].text.includes("Onboarding (do this once")
);
await client2.close();

rmSync(savedDir, { recursive: true, force: true });
rmSync(emptyDir, { recursive: true, force: true });
process.exit(failures === 0 ? 0 : 1);
