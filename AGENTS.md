# AGENTS.md

Context for AI agents working on this repository.

## What this is

An MCP server exposing 20 Redmine tools (issues, time entries, projects, lookups).
One tool implementation, four distribution surfaces:

| Surface | Entry point | Consumed by |
|---|---|---|
| npm binary | `dist/index.js` via `bin.redmine-mcp-server` | any client through `npx` |
| Agent Plugins v1 | `plugin.json` + `mcp.json` | Cursor, Copilot, VS Code, ChatGPT, Kiro |
| Claude Code plugin | `.claude-plugin/plugin.json` + `.mcp.json` | Claude Code |
| Codex plugin | `.codex-plugin/plugin.json` + `.mcp.json` | Codex |
| Cloudflare Worker | `src/worker.ts` | remote HTTP clients |

## Layout

```
src/
  server.ts        createServer(env) — registers all tools; shared by both entry points
  index.ts         stdio entry point (Node)
  worker.ts        Cloudflare Worker entry point (Streamable HTTP, POST /mcp)
  config.ts        credential resolution — Node only, never import from worker.ts
  services/api.ts  Redmine REST client over native fetch; owns RedmineEnv
  tools/           issues, projects, time_entries, lookups
skills/redmine/    portable Agent Skill shipped with the plugin
```

## Rules that are easy to get wrong

**`config.ts` and `init.ts` are Node-only.** They use `node:fs`, and `init.ts` also
uses stdin. Cloudflare Workers has neither, so `worker.ts` takes credentials from
Worker secrets and must never import either module.

**Nothing may be written to stdout or stderr on a successful start.** stdout is the
JSON-RPC channel, and clients log every stderr line at error level — Claude Code
counts them as failures and can mark a healthy server as failed
(anthropics/claude-code#17653, closed as not planned). A startup banner is not
harmless here. `init.ts` writes to stdout freely because `--init` never speaks the
protocol.

**Prompt input goes through the line queue in `init.ts`.** Calling `rl.question`
per prompt drops input: readline keeps consuming the stream between prompts, so on
a piped stdin the second answer arrives with no question pending and is discarded.

**Three plugin manifests, two MCP files.** Codex does not read Agent Plugins v1: it
requires `.codex-plugin/plugin.json` and rejects a plugin without it. Its manifest
has the same shape as Claude Code's, and both point at `./.mcp.json`, so those two
share one file. Agent Plugins clients read `mcp.json` instead, which cannot be the
same file: Claude Code expands `${CLAUDE_PLUGIN_DATA}` and passes `${PLUGIN_DATA}`
through literally, while Agent Plugins clients do the opposite.

`.mcp.json` carries both dialects in one object — `env` with a placeholder for
Claude Code, `env_vars` as an inherit-allowlist for Codex. Each client ignores the
other's field; this was verified against Claude Code 2.1.273 and Codex 0.154.0.

**Version lives in five places.** `package.json`, `server.json`, the three plugin
manifests, and the `McpServer` constructor in `src/server.ts`. Bump together.

**Credentials never travel in a manifest.** The Agent Plugins spec expands only two
placeholders and forbids credentials in `headers`, so the server resolves them at
runtime: environment variables, then `REDMINE_CONFIG_PATH`, then the default config
path written by `--init`. A path still containing an unexpanded `${...}` is ignored
on purpose — see `hasUnexpandedPlaceholder` in `config.ts`. An explicitly set
`REDMINE_CONFIG_PATH` is authoritative: if it is unreadable or malformed that is an
error, not a reason to quietly fall through to the default file.

Elicitation is deliberately not used. `elicitation/create` is deprecated (SEP-2577)
in favour of multi round-trip requests (SEP-2322), the spec requires URL mode rather
than a form for API keys, and client support is uneven.

**Worker auth fails closed.** `MCP_AUTH_TOKEN` is required; a missing secret returns
500 rather than serving unauthenticated traffic. Do not reintroduce a public mode.

**Skill tool names are unprefixed.** Clients namespace differently
(`mcp__plugin_redmine_redmine__*` in Claude Code, other schemes elsewhere), so
`skills/redmine/SKILL.md` refers to bare names like `redmine_list_issues`.

## Commands

```bash
npm run build        # tsc, then chmod +x on the binary
npm start            # run the stdio server
npm run worker:dev   # run the Worker locally
npm pack --dry-run   # inspect what would be published
```

There is no test suite yet. Verify changes by running the stdio server with
credentials and exercising the affected tool.
