#!/usr/bin/env node
/**
 * Stdio entry point for local MCP clients (Claude Desktop, Claude Code, Codex).
 * For Cloudflare Workers deployment, see src/worker.ts.
 *
 * Run with --init for interactive setup. Otherwise credentials come from
 * environment variables or a JSON config file — see src/config.ts:
 *   REDMINE_URL      - Redmine instance URL (e.g., https://redmine.example.com)
 *   REDMINE_API_KEY  - API key (My Account → API access key)
 *
 * Nothing is written to stdout except the protocol itself, and nothing is
 * written to stderr on success: clients treat any stderr line as an error and
 * can mark a healthy server as failed because of a startup banner.
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";
import { resolveRedmineEnv, ConfigError } from "./config.js";
import { runInit } from "./init.js";

async function main(): Promise<void> {
  if (process.argv.slice(2).includes("--init")) {
    await runInit();
    return;
  }

  const env = resolveRedmineEnv();
  const server = createServer(env);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  // Setup problems get a clean, actionable message; real bugs keep their stack.
  if (error instanceof ConfigError) {
    console.error(error.message);
  } else {
    console.error("Failed to start Redmine MCP server:", error);
  }
  process.exit(1);
});
