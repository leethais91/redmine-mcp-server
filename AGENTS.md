# AGENTS.md

Context for AI agents working on this repository.

## What this is

An MCP server exposing 22 Redmine tools (issues, time entries, projects,
attachments, lookups). Node stdio only — one tool implementation, four
distribution surfaces:

| Surface | Entry point | Consumed by |
|---|---|---|
| npm binary | `dist/index.js` via `bin.redmine-mcp-server` | any client through `npx` |
| Agent Plugins v1 | `plugin.json` + `mcp.json` | Cursor, Copilot, VS Code, ChatGPT, Kiro |
| Claude Code plugin | `.claude-plugin/` + `.mcp.json` | Claude Code |
| Codex plugin | `.codex-plugin/` + `.agents/plugins/` + `.mcp.json` | Codex |

## Layout

```
src/
  server.ts          createServer(env) — registers all tools
  index.ts           stdio entry point
  config.ts          credential resolution
  services/api.ts    Redmine REST client over native fetch; owns RedmineEnv
  services/files.ts  local reads for uploads, confined writes for downloads
  tools/             issues, projects, time_entries, lookups, attachments
skills/redmine/      portable Agent Skill shipped with the plugin
```

## Rules that are easy to get wrong

**`services/api.ts` has one request core, three wrappers.** `request()` owns the
credential check, URL assembly, the timeout, and turning a non-2xx into a
`RedmineApiError`; `makeApiRequest` reads JSON on top of it, `uploadBytes` and
`downloadBytes` move bytes. Add transport concerns to `request()`, not to a wrapper.

**Attachments are two Redmine calls, never one.** `POST /uploads.json?filename=`
stages bytes and returns a token that is not an attachment yet; binding it needs a
second `PUT /issues/:id.json` with `uploads: [{token, filename}]`. Unbound tokens
are pruned after about a day, so the two calls stay in one tool.

**Never download from the `content_url` in an attachment response.** Redmine
composes it from its own host setting, which is routinely wrong behind a reverse
proxy. Build the path from the configured base URL instead. Binary downloads also
pass `redirect: "manual"`: Redmine answers an unauthenticated download with a 302
to the login page, and a followed redirect yields 200 with HTML — a corrupt file
that reads as success.

**Downloads never take a destination path.** A filename from Redmine is
attacker-controlled text, so `services/files.ts` writes only into
`REDMINE_DOWNLOAD_DIR` (or a temp default) and strips the name to a basename.
Reading an arbitrary path for an upload is fine — the calling agent already has its
own file-read tools, so it is no escalation.

**Nothing may be written to stdout or stderr on a successful start.** stdout is the
JSON-RPC channel, and clients log every stderr line at error level — Claude Code
counts them as failures and can mark a healthy server as failed
(anthropics/claude-code#17653, closed as not planned). A startup banner is not
harmless here. `init.ts` writes to stdout freely because `--init` never speaks the
protocol.

**Prompt input goes through the line queue in `init.ts`.** Calling `rl.question`
per prompt drops input: readline keeps consuming the stream between prompts, so on
a piped stdin the second answer arrives with no question pending and is discarded.

**The repository is its own marketplace.** A plugin manifest alone only supports
`--plugin-dir`; installing by name needs a marketplace listing the plugin, so
`.claude-plugin/marketplace.json` and `.agents/plugins/marketplace.json` both point
at `./` — the plugin sits at the repository root rather than under `plugins/`. Keep
the plugin name and version in step with the manifests.

**Three plugin manifests, two MCP files.** Codex does not read Agent Plugins v1: it
requires `.codex-plugin/plugin.json` and rejects a plugin without it. Its manifest
has the same shape as Claude Code's, and both point at `./.mcp.json`, so those two
share one file. Agent Plugins clients read `mcp.json` instead, which cannot be the
same file: Claude Code expands `${CLAUDE_PLUGIN_DATA}` and passes `${PLUGIN_DATA}`
through literally, while Agent Plugins clients do the opposite.

`.mcp.json` carries both dialects in one object — `env` with placeholders for
Claude Code, `env_vars` as an inherit-allowlist for Codex. Each client ignores the
other's field; this was verified against Claude Code 2.1.273 and Codex 0.154.0.

**Version lives in five places.** `package.json`, `server.json`, the three plugin
manifests, and the `McpServer` constructor in `src/server.ts`. Bump together.

**Credentials reach the server one of two ways, and only one is portable.** The
Agent Plugins spec expands only two placeholders and forbids credentials in
`headers`, so for every client except Claude Code the server resolves them at
runtime: environment variables, then `REDMINE_CONFIG_PATH`, then the default config
path written by `--init`.

Claude Code is the exception. `userConfig` in `.claude-plugin/plugin.json` declares
the two fields, Claude Code prompts for them when the plugin is enabled, keeps the
one marked `sensitive` in the OS keychain, and substitutes them into `.mcp.json` as
`${user_config.redmine_url}` / `${user_config.redmine_api_key}`. Both fields are
optional on purpose: someone who already ran `--init`, or who sets the environment
variables, must be able to skip the prompt and keep working.

That is why every value is filtered through `hasUnexpandedPlaceholder` in
`config.ts`, not just the config path. One `.mcp.json` serves several clients, so a
client that does not implement the other's dialect passes `${...}` through as a
literal; treating one as real would send a nonsense URL to Redmine or write files
into a directory named after the placeholder.

`REDMINE_CONFIG_PATH` treats absent and broken differently, and the distinction is
load-bearing. Pointing at a file that does not exist means "look elsewhere", because
clients set this variable to their own plugin data directory before anything has
written there; without the fallback, `--init` would report success and change
nothing that the plugin can see. A file that exists but cannot be read or parsed
still raises, so a corrupt config is never silently replaced by a different one.

**Missing credentials must not stop the server.** `loadRedmineEnv` reports what is
missing instead of throwing, `index.ts` starts the server anyway, and
`makeApiRequest` fails each call with the setup instructions carried on
`RedmineEnv.SETUP_HINT`. A process that exits shows up in a client as "server
failed", with the explanation in a log the user never opens; a server that starts
and answers with instructions puts them in front of the person who can act on them.
The instructions deliberately steer users away from pasting an API key into the
conversation, where it would land in the transcript.

Elicitation is deliberately not used. `elicitation/create` is deprecated (SEP-2577)
in favour of multi round-trip requests (SEP-2322), the spec requires URL mode rather
than a form for API keys, and client support is uneven.

**Skill tool names are unprefixed.** Clients namespace differently
(`mcp__plugin_redmine_redmine__*` in Claude Code, other schemes elsewhere), so
`skills/redmine/SKILL.md` refers to bare names like `redmine_list_issues`.

## Commands

```bash
npm run build        # tsc, then chmod +x on the binary
npm start            # run the stdio server
npm start -- --init  # interactive setup; add --url/--api-key/--config-path to skip prompts
npm pack --dry-run   # inspect what would be published
```

There is no test suite yet. Verify changes by running the stdio server with
credentials and exercising the affected tool. For credential handling, also check
the degraded path: start the server with `XDG_CONFIG_HOME` pointing at an empty
directory and no `REDMINE_*` variables, then call any tool — it must stay up,
advertise all 22 tools, and answer with the setup instructions.

For attachments, verify against a real instance in both directions: upload a small
file to a scratch issue, read it back with `redmine_get_issue` and
`include="attachments"`, download it, and compare the bytes on disk with the
`filesize` Redmine reported. A download that silently produced an HTML login page
is the failure this catches.
