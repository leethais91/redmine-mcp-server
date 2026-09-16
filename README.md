# Redmine MCP Server

> 🇻🇳 Phiên bản tiếng Việt: [README.vi.md](./README.vi.md)

A [Model Context Protocol](https://modelcontextprotocol.io) server that lets Claude (Desktop, Code, claude.ai, OpenClaw) drive a Redmine instance directly — list and search issues, create or update tickets, log time, and look up projects, users, statuses, and custom fields, all in natural language.

**Highlights**
- 🛠️ **20 tools** across issues, projects, time tracking, and lookups
- 🔁 **Two transports, one core** — same `createServer()` runs as local stdio and as a Cloudflare Worker
- 🔐 **Auth fails closed** on the Worker (mandatory `MCP_AUTH_TOKEN` Bearer guard, no public mode)
- ⚡ **Stateless & lightweight** — native `fetch`, zod-validated inputs, markdown-formatted output tuned for LLMs
- 🆓 **Free to host** — fits inside the Cloudflare Workers free tier

**Pick a mode**

| Mode | Best for | Latency | Always-on | Multi-device |
|---|---|---|---|---|
| **Stdio** (`src/index.ts`) | Claude Desktop only | In-process, ~0ms | While app runs | One machine |
| **Cloudflare Workers** (`src/worker.ts`) | Claude Code, claude.ai (web + mobile), OpenClaw | ~50–200ms | Yes | Yes |

You can run both side by side — they share the tool implementations in `src/server.ts`.

**Requirements**

- Node.js 18+ (uses native `fetch`, works in Node 18+ and Cloudflare Workers)
- A Redmine instance with API access enabled
- For Workers mode: a free [Cloudflare](https://cloudflare.com) account

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

Run setup once:

```bash
npx @leethais91/redmine-mcp-server --init
```

It asks for your Redmine URL and API key, verifies them against the server before
saving, and writes `~/.config/redmine-mcp/config.json` with owner-only permissions.
A wrong key is reported immediately rather than on your first tool call.

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
`~/.claude/plugins/data/redmine/config.json`; Codex has no such placeholder and
inherits the two environment variables from your shell via the `env_vars` allowlist
in `.mcp.json`. Any of the three paths works on its own.

---

## Mode 1 — Claude Desktop (Stdio)

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

## Mode 2 — Cloudflare Workers (Remote HTTP)

For **Claude Code**, **claude.ai**, **OpenClaw** — nothing runs on your local machine.

### Step 1 — Install dependencies

```bash
npm install
```

### Step 2 — Log in to Cloudflare

```bash
npx wrangler login
```

A browser will open for authentication.

### Step 3 — Set secrets

```bash
npx wrangler secret put REDMINE_URL
# Enter: https://redmine.example.com

npx wrangler secret put REDMINE_API_KEY
# Enter: your-api-key

npx wrangler secret put MCP_AUTH_TOKEN
# Enter: any string used to guard the endpoint (e.g. my-secret-token-123)
```

> Generate a strong random token with:
> ```bash
> openssl rand -base64 32
> ```
> Copy the output and paste it when `wrangler secret put MCP_AUTH_TOKEN` prompts. Save it somewhere safe — you'll need it to configure clients.

> `MCP_AUTH_TOKEN` is **required**. If unset, every request returns `500 Server misconfigured`. The endpoint does not support a public mode — this MCP server is designed for personal use.

### Step 4 — Deploy

```bash
npm run worker:deploy
```

After deploy you'll see a URL like:
```
https://redmine-mcp-server.<subdomain>.workers.dev
```

### Step 5 — Configure your client

**Claude Code** — run:

```bash
# Add for the current project (local scope)
claude mcp add cc-redmine --transport http https://redmine-mcp-server.<subdomain>.workers.dev/mcp --header "Authorization: Bearer your-mcp-auth-token"

# Or add globally (available in every project)
claude mcp add cc-redmine --transport http https://redmine-mcp-server.<subdomain>.workers.dev/mcp --header "Authorization: Bearer your-mcp-auth-token" --scope user
```

**Claude.ai** — go to **Settings → Integrations → Add custom integration**:
- URL: `https://redmine-mcp-server.<subdomain>.workers.dev/mcp`
- Header: `Authorization: Bearer your-mcp-auth-token`

**OpenClaw** — add an MCP server with the same URL and header.

### Test after deploy

```bash
# Health check
curl https://redmine-mcp-server.<subdomain>.workers.dev/health \
  -H "Authorization: Bearer your-mcp-auth-token"

# List tools
curl https://redmine-mcp-server.<subdomain>.workers.dev/mcp \
  -H "Authorization: Bearer your-mcp-auth-token" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

---

## Development

```bash
# Run local stdio (dev mode)
npm run dev

# Run Workers locally (env vars must be in .dev.vars)
npm run worker:dev

# Build TypeScript
npm run build
```

**`.dev.vars`** file (used by `worker:dev`, do not commit):
```
REDMINE_URL=https://redmine.example.com
REDMINE_API_KEY=your-api-key
MCP_AUTH_TOKEN=dev-token
```

---

## Usage examples

Once configured, you can ask Claude things like:

- "List all open issues in project X"
- "Create a new bug: login broken on mobile"
- "Mark issue #123 as done"
- "Log 2 hours against issue #456 today"
- "Who has the most issues assigned?"
