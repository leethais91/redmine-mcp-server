# Redmine MCP Server

> 🇻🇳 Phiên bản tiếng Việt: [README.vi.md](./README.vi.md)

A [Model Context Protocol](https://modelcontextprotocol.io) server that lets Claude (Desktop, Code, claude.ai, OpenClaw) drive a Redmine instance directly — list and search issues, create or update tickets, log time, and look up projects, users, statuses, and custom fields, all in natural language.

**Highlights**
- 🛠️ **24 tools** across issues, projects, time tracking, attachments, lookups, and per-user preferences
- 📎 **Attachments both ways** — upload a local file or image to an issue, download one back to disk, and view image attachments inline
- 🎯 **Personalizes itself** — one-time onboarding saves your focus projects and defaults, injected into tool descriptions so agents stop asking which project you mean
- ⚡ **Stateless & lightweight** — native `fetch`, zod-validated inputs, markdown-formatted output tuned for LLMs
- 🔑 **Credentials stay out of client config** — `--init` stores them once, every client reuses them

**Requirements**

- Node.js 18+ (uses native `fetch`)
- A Redmine instance with API access enabled

---

## Available tools

### Issues
| Tool | Description |
|---|---|
| `redmine_list_issues` | List/search issues with rich filtering |
| `redmine_get_issue` | Fetch a single issue (with history & comments) |
| `redmine_create_issue` | Create a new issue |
| `redmine_update_issue` | Update an issue (status, assignee, etc.) |
| `redmine_add_note` | Add a comment to an issue |

### Projects
| Tool | Description |
|---|---|
| `redmine_list_projects` | List all projects |
| `redmine_get_project` | Fetch project details |
| `redmine_list_versions` | List a project's versions/milestones |

### Time tracking
| Tool | Description |
|---|---|
| `redmine_list_time_entries` | View logged time |
| `redmine_create_time_entry` | Log work time |
| `redmine_update_time_entry` | Edit a time entry |
| `redmine_delete_time_entry` | Delete a time entry |

### Lookups
| Tool | Description |
|---|---|
| `redmine_list_statuses` | Issue statuses |
| `redmine_list_trackers` | Trackers (Bug, Feature, Task...) |
| `redmine_list_priorities` | Priority levels |
| `redmine_list_users` | Users |
| `redmine_get_current_user` | Current user info |
| `redmine_list_custom_fields` | Custom fields |
| `redmine_list_memberships` | Project members and their roles |
| `redmine_list_activities` | Time-entry activities (Design, Dev, etc.) |

### Attachments
| Tool | Description |
|---|---|
| `redmine_upload_attachment` | Attach a local file or base64 content to an issue |
| `redmine_download_attachment` | Download an attachment; images come back viewable |

Attachment IDs come from `redmine_get_issue` with `include="attachments"`.

### Preferences
| Tool | Description |
|---|---|
| `redmine_get_my_context` | Read saved preferences; carries one-time onboarding instructions when empty |
| `redmine_save_preferences` | Save focus projects, defaults, teammates, and timesheet expectations (IDs validated against Redmine first) |

---

## Personalization

On a busy Redmine instance you are a member of a few projects but can see dozens. The
server fixes the "which project do you mean?" loop with a one-time onboarding:

1. On the first session, tool descriptions tell the agent that no preferences are saved.
2. The agent suggests candidates — projects from your memberships plus recent issues
   assigned to you — and asks **once** which you actually work on.
3. It saves them with `redmine_save_preferences`. From the next session on, your focus
   projects and defaults ride along inside the tool descriptions themselves: zero extra
   tool calls, no repeated asking — the saved file is the memory, not the agent.

Saved fields: `focusProjects`, `defaultProjectId`, `defaultTrackerId`,
`defaultActivityId`, `catchAllIssueId` (successor of the `REDMINE_MGMT_ISSUE_ID` env
var, which still works as a fallback), `teammates` assignee shortcuts,
`timesheet` expectations, and `contentLanguage`.

Everything lives in one owner-only file shared by every client on the machine:
`~/.config/redmine-mcp/preferences.json` (or `$XDG_CONFIG_HOME/redmine-mcp/preferences.json`).
Review it with `redmine_get_my_context`, hand-edit it, or just tell the agent what to
change — it re-saves with `redmine_save_preferences`.

---

## Get a Redmine API key

Sign in to Redmine → **My Account** (top right) → **API access key** → **Show**

---

## Install as a plugin

The repository ships as a plugin for both plugin standards, so most clients can
install it in one step. Both manifests start the same npm package over stdio.

| Client | How |
|---|---|
| Cursor, ChatGPT, Kiro | install from the repository URL |
| VS Code | **Chat: Install Plugin From Source**, or the `@agentPlugins` marketplace |
| GitHub Copilot | install from the repository URL (IDE or CLI) |
| Claude Code | `claude plugin marketplace add leethais91/redmine-mcp-server` then `claude plugin install redmine@leethais91` |
| Codex | `codex plugin marketplace add leethais91/redmine-mcp-server` then `codex plugin add redmine@leethais91` |

Installing this way brings the MCP server and the Redmine skill together — there is
nothing to fetch separately. To try it without installing, run
`claude --plugin-dir .` from a checkout, which loads both for that session only.

Codex resolves `@latest` to a fixed version when the plugin is installed, so run
`codex plugin add` again after a new release to pick it up.

Manifests: `plugin.json` + `mcp.json` follow the [Agent Plugins](https://agent-plugins.org)
v1 spec. Claude Code and Codex each need their own manifest — `.claude-plugin/plugin.json`
and `.codex-plugin/plugin.json` — but both read the same `.mcp.json`, which declares
the server in a form both accept.

Agent Plugins needs a separate `mcp.json` because the standards expand different
placeholders: Claude Code substitutes `${CLAUDE_PLUGIN_DATA}` and passes
`${PLUGIN_DATA}` through untouched.

> **A freshly published version may not install.** npm's `min-release-age`
> supply-chain setting refuses packages younger than the configured window, with
> `ENOVERSIONS: No versions available`. Either wait out the window or install with
> `--min-release-age=0`.

### Credentials

**Claude Code** asks for them while installing the plugin — fill in the Redmine URL
and API key at the prompt and you are done. The key is stored in your OS keychain,
never in a file in the repository. Change them later with `/config`.

**Everywhere else**, run setup once:

```bash
npx @leethais91/redmine-mcp-server --init
```

It asks for your Redmine URL and API key, verifies them against the server before
saving, and writes `~/.config/redmine-mcp/config.json` with owner-only permissions.
A wrong key is reported immediately rather than on your first tool call.

To script it — in a Dockerfile, in CI, or from a coding agent — pass the values
instead of answering prompts:

```bash
npx @leethais91/redmine-mcp-server --init \
  --url https://redmine.example.com --api-key <key>
```

Both forms check the credentials before writing anything.

If you skip setup, the server still starts and every tool answers with these
instructions, so nothing fails silently.

The server resolves credentials in this order:

1. `REDMINE_URL` and `REDMINE_API_KEY` environment variables
2. a JSON file at `REDMINE_CONFIG_PATH`, when that file exists — how plugin
   manifests point at their own data directory
3. `~/.config/redmine-mcp/config.json` (or `$XDG_CONFIG_HOME/redmine-mcp/config.json`)

Step 2 falling through when the file is absent is what makes `--init` work for a
plugin install too: the client sets `REDMINE_CONFIG_PATH` to its own data directory,
nothing has written there, and the file from `--init` is used instead.

So `--init` covers a manual install, while `REDMINE_CONFIG_PATH` stays available for
clients that keep per-plugin data. Claude Code points it at
`~/.claude/plugins/data/redmine/config.json`, and also supplies the two variables
directly from what it collected at install time; Codex has no such placeholder and
inherits the two environment variables from your shell via the `env_vars` allowlist
in `.mcp.json`. Any of the paths works on its own.

---

## Manual setup (Claude Desktop, Codex, any stdio client)

### Install

No install step is needed — `npx` fetches the published package on first run. To
work from a checkout instead:

```bash
git clone https://github.com/leethais91/redmine-mcp-server.git
cd redmine-mcp-server
npm install
npm run build
```

### Configure

Add to `claude_desktop_config.json`:
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "redmine": {
      "command": "npx",
      "args": ["-y", "@leethais91/redmine-mcp-server@latest"],
      "env": {
        "REDMINE_URL": "https://redmine.example.com",
        "REDMINE_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

From a local checkout, point at the build output instead:

```json
{
  "mcpServers": {
    "redmine": {
      "command": "node",
      "args": ["/absolute/path/to/redmine-mcp-server/dist/index.js"],
      "env": {
        "REDMINE_URL": "https://redmine.example.com",
        "REDMINE_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

Restart Claude Desktop. The MCP server will appear in the tools list.

---

### Where downloads go

`redmine_download_attachment` writes files it saves into one directory, decided
by configuration rather than by the tool call — no tool takes a destination
path. It defaults to `redmine-mcp` under the system temp directory, which does
not survive a reboot. Set `REDMINE_DOWNLOAD_DIR` to keep them somewhere durable:

```bash
REDMINE_DOWNLOAD_DIR=~/Downloads/redmine
```

Image attachments are returned as viewable images instead, so they usually never
touch the disk. Pass `mode: "file"` to save one anyway.

---

## Development

```bash
# Run local stdio (dev mode)
npm run dev

# Build TypeScript
npm run build
```

---

## Usage examples

Once configured, you can ask Claude things like:

- "List all open issues in project X"
- "Create a new bug: login broken on mobile"
- "Mark issue #123 as done"
- "Log 2 hours against issue #456 today"
- "Who has the most issues assigned?"
- "Attach ~/Desktop/crash.log to issue #123"
- "Show me the screenshot attached to issue #456"
