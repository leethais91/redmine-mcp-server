#!/usr/bin/env node
/**
 * Stdio entry point for local Claude Desktop / Claude Code usage.
 * For Cloudflare Workers deployment, see src/worker.ts.
 *
 * Required environment variables:
 *   REDMINE_URL      - Redmine instance URL (e.g., https://redmine.example.com)
 *   REDMINE_API_KEY  - API key (My Account → API access key)
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";

async function main(): Promise<void> {
  const env = {
    REDMINE_URL: process.env.REDMINE_URL ?? "",
    REDMINE_API_KEY: process.env.REDMINE_API_KEY ?? "",
  };

  if (!env.REDMINE_URL) {
    throw new Error("REDMINE_URL environment variable is required.");
  }
  if (!env.REDMINE_API_KEY) {
    throw new Error("REDMINE_API_KEY environment variable is required.");
  }

  const server = createServer(env);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Redmine MCP server running via stdio");
}

main().catch((error) => {
  console.error("Failed to start Redmine MCP server:", error);
  process.exit(1);
});
