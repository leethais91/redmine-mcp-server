#!/usr/bin/env node
/**
 * Stdio entry point for local Claude Desktop / Claude Code usage.
 * For Cloudflare Workers deployment, see src/worker.ts.
 *
 * Credentials come from environment variables, or from a JSON file pointed at
 * by REDMINE_CONFIG_PATH — see src/config.ts for the resolution order:
 *   REDMINE_URL      - Redmine instance URL (e.g., https://redmine.example.com)
 *   REDMINE_API_KEY  - API key (My Account → API access key)
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";
import { resolveRedmineEnv, ConfigError } from "./config.js";

async function main(): Promise<void> {
  const env = resolveRedmineEnv();

  const server = createServer(env);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Redmine MCP server running via stdio");
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
