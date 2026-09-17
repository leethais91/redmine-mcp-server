/**
 * McpServer factory for the stdio entry point (index.ts).
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { RedmineEnv } from "./services/api.js";
import { registerIssueTools } from "./tools/issues.js";
import { registerProjectTools } from "./tools/projects.js";
import { registerTimeEntryTools } from "./tools/time_entries.js";
import { registerLookupTools } from "./tools/lookups.js";
import { registerAttachmentTools } from "./tools/attachments.js";

export function createServer(env: RedmineEnv): McpServer {
  const server = new McpServer({
    name: "redmine-mcp-server",
    version: "1.4.0",
  });

  registerIssueTools(server, env);
  registerProjectTools(server, env);
  registerTimeEntryTools(server, env);
  registerLookupTools(server, env);
  registerAttachmentTools(server, env);

  return server;
}
