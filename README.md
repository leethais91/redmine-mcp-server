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

## Mode 1 — Claude Desktop (Stdio)

### Install

```bash
git clone <repo-url>
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
