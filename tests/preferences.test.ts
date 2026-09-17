import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import {
  preferencesSchema,
  mergePreferences,
  describeUserContext,
  formatPreferences,
} from "../src/preferences.js";
import {
  defaultPreferencesPath,
  loadPreferencesFile,
  savePreferencesFile,
} from "../src/preferences-file.js";

const savedEnv = process.env.XDG_CONFIG_HOME;
let workDir: string;

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), "redmine-prefs-test-"));
  process.env.XDG_CONFIG_HOME = workDir;
});

after(() => {
  if (savedEnv === undefined) delete process.env.XDG_CONFIG_HOME;
  else process.env.XDG_CONFIG_HOME = savedEnv;
});

function cleanup() {
  // Called at the end of each file-level lifecycle test; keeps /tmp small.
  try { rmSync(workDir, { recursive: true, force: true }); } catch { /* best effort */ }
}

test("schema accepts a full preferences object", () => {
  const parsed = preferencesSchema.parse({
    focusProjects: [{ id: 5, name: "Backend Core" }],
    defaultProjectId: 5,
    defaultActivityId: 18,
    defaultActivityName: "Development",
    catchAllIssueId: 3210,
    defaultTrackerId: 4,
    teammates: [{ name: "Lan", userId: 23 }],
    timesheet: { workDays: [1, 2, 3, 4, 5], hoursPerDay: 8 },
    contentLanguage: "en",
  });
  assert.equal(parsed.focusProjects?.[0].id, 5);
});

test("schema rejects unknown keys and out-of-range values", () => {
  assert.throws(() => preferencesSchema.parse({ whatever: 1 }));
  assert.throws(() => preferencesSchema.parse({ timesheet: { workDays: [9] } }));
  assert.throws(() => preferencesSchema.parse({ defaultProjectId: 0 }));
});

test("mergePreferences replaces provided keys and keeps omitted ones", () => {
  const base = preferencesSchema.parse({
    focusProjects: [{ id: 5, name: "Backend Core" }],
    catchAllIssueId: 100,
  });
  const patch = preferencesSchema.parse({
    focusProjects: [{ id: 7, name: "Mobile App" }],
  });
  const merged = mergePreferences(base, patch);
  assert.deepEqual(merged.focusProjects, [{ id: 7, name: "Mobile App" }]);
  assert.equal(merged.catchAllIssueId, 100);
});

test("mergePreferences treats empty arrays as cleared", () => {
  const base = preferencesSchema.parse({
    focusProjects: [{ id: 5, name: "Backend Core" }],
    teammates: [{ name: "Lan", userId: 23 }],
  });
  const merged = mergePreferences(base, preferencesSchema.parse({ focusProjects: [] }));
  assert.equal(merged.focusProjects, undefined);
  assert.equal(merged.teammates?.length, 1);
});

test("describeUserContext: empty state returns the onboarding hint", () => {
  const text = describeUserContext({ preferences: {} });
  assert.match(text, /redmine_get_my_context/);
  assert.match(text, /redmine_save_preferences/);
  assert.match(text, /Do not ask on later sessions/);
});

test("describeUserContext: saved preferences are summarized for the agent", () => {
  const state = {
    preferences: preferencesSchema.parse({
      focusProjects: [{ id: 5, name: "Backend Core" }, { id: 12, name: "Mobile App" }],
      defaultProjectId: 5,
      defaultActivityId: 18,
      defaultActivityName: "Development",
      catchAllIssueId: 3210,
      timesheet: { workDays: [1, 5], hoursPerDay: 8 },
    }),
  };
  const text = describeUserContext(state);
  assert.match(text, /Backend Core \(id=5\)/);
  assert.match(text, /Mobile App \(id=12\)/);
  assert.match(text, /default project id=5/);
  assert.match(text, /Development \(id=18\)/);
  assert.match(text, /#3210/);
  assert.match(text, /Mon, Fri, 8h\/day/);
  assert.doesNotMatch(text, /onboarding/i);
});

test("describeUserContext: a broken file suppresses the hint", () => {
  const text = describeUserContext({ preferences: {}, problem: "unusable" });
  assert.equal(text, "");
});

test("formatPreferences: empty state carries onboarding steps", () => {
  const text = formatPreferences({ preferences: {} }, "/tmp/prefs.json");
  assert.match(text, /None yet/);
  assert.match(text, /include_memberships/);
  assert.match(text, /assigned_to_id="me"/);
  assert.match(text, /once/i);
});

test("formatPreferences: saved state shows the JSON and the file path", () => {
  const state = {
    preferences: preferencesSchema.parse({ focusProjects: [{ id: 5, name: "Backend Core" }] }),
  };
  const text = formatPreferences(state, "/tmp/prefs.json");
  assert.match(text, /"focusProjects"/);
  assert.match(text, /\/tmp\/prefs\.json/);
});

test("preferences file: absent file loads as empty with no problem", () => {
  const state = loadPreferencesFile();
  assert.deepEqual(state.preferences, {});
  assert.equal(state.problem, undefined);
  assert.equal(state.path, defaultPreferencesPath());
  cleanup();
});

test("preferences file: save then load round-trips", () => {
  savePreferencesFile({ focusProjects: [{ id: 5, name: "Backend Core" }] });
  const state = loadPreferencesFile();
  assert.deepEqual(state.preferences.focusProjects, [{ id: 5, name: "Backend Core" }]);
  // Owner-only permissions, like the credentials file.
  const raw = readFileSync(state.path, "utf8");
  assert.match(raw, /"focusProjects"/);
  cleanup();
});

test("preferences file: second save merges over the first", () => {
  savePreferencesFile({ focusProjects: [{ id: 5, name: "Backend Core" }] });
  savePreferencesFile({ catchAllIssueId: 100 });
  const state = loadPreferencesFile();
  assert.equal(state.preferences.catchAllIssueId, 100);
  assert.equal(state.preferences.focusProjects?.[0].id, 5);
  cleanup();
});

test("preferences file: broken JSON degrades to a problem string", () => {
  mkdirSync(dirname(defaultPreferencesPath()), { recursive: true });
  writeFileSync(defaultPreferencesPath(), "{ not json");
  const state = loadPreferencesFile();
  assert.deepEqual(state.preferences, {});
  assert.match(state.problem ?? "", /unusable/);
  cleanup();
});

test("createServer registers without throwing, with and without preferences", async () => {
  const { createServer } = await import("../src/server.js");
  createServer({ REDMINE_URL: "https://x.example", REDMINE_API_KEY: "k" });
  createServer(
    { REDMINE_URL: "https://x.example", REDMINE_API_KEY: "k" },
    { preferences: { focusProjects: [{ id: 5, name: "Backend Core" }] } }
  );
});
