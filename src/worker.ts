/**
 * Cloudflare Workers entry point for the Redmine MCP server.
 *
 * Implements the MCP Streamable HTTP transport protocol over a stateless
 * fetch handler. Each request creates a fresh server+transport pair,
 * processes the JSON-RPC message(s), and returns the result as JSON.
 *
 * Secrets to configure via `wrangler secret put` (all REQUIRED):
 *   REDMINE_URL       - e.g. https://redmine.example.com
 *   REDMINE_API_KEY   - Redmine API key
 *   MCP_AUTH_TOKEN    - Bearer token guarding the endpoint (no public mode)
 */

import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import { createServer } from "./server.js";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Env {
  REDMINE_URL: string;
  REDMINE_API_KEY: string;
  MCP_AUTH_TOKEN: string;
}

// ─── CORS ─────────────────────────────────────────────────────────────────────

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Mcp-Session-Id",
  "Access-Control-Max-Age": "86400",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

// ─── Worker Transport ─────────────────────────────────────────────────────────

/**
 * Minimal MCP Transport for Cloudflare Workers.
 * Processes one JSON-RPC message at a time and captures the server's response
 * via a Promise, enabling a clean request-response cycle inside a fetch handler.
 */
class WorkerTransport implements Transport {
  onmessage?: (msg: JSONRPCMessage) => void;
  onclose?: () => void;
  onerror?: (err: Error) => void;

  private readonly pending = new Map<
    string | number,
    (msg: JSONRPCMessage) => void
  >();

  async start(): Promise<void> {}

  async close(): Promise<void> {
    this.onclose?.();
  }

  async send(msg: JSONRPCMessage): Promise<void> {
    // The server calls send() with the response. Resolve the matching promise.
    if ("id" in msg && msg.id != null) {
      const resolve = this.pending.get(msg.id as string | number);
      if (resolve) {
        this.pending.delete(msg.id as string | number);
        resolve(msg);
      }
    }
  }

  /**
   * Feed a JSON-RPC request to the server and wait for its response.
   * Returns null for notifications (id-less messages) since no response is sent.
   */
  processMessage(msg: JSONRPCMessage): Promise<JSONRPCMessage> | null {
    if ("id" in msg && msg.id != null) {
      return new Promise<JSONRPCMessage>((resolve) => {
        this.pending.set(msg.id as string | number, resolve);
        this.onmessage?.(msg);
      });
    }
    // Notification — fire and forget
    this.onmessage?.(msg);
    return null;
  }
}

// ─── MCP Request Handler ──────────────────────────────────────────────────────

async function handleMcpRequest(request: Request, env: Env): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ jsonrpc: "2.0", error: { code: -32700, message: "Parse error" }, id: null }, 400);
  }

  const transport = new WorkerTransport();
  const server = createServer(env);
  await server.connect(transport);

  const isBatch = Array.isArray(body);
  const messages: JSONRPCMessage[] = isBatch
    ? (body as JSONRPCMessage[])
    : [body as JSONRPCMessage];

  const responses: JSONRPCMessage[] = [];
  for (const msg of messages) {
    const responsePromise = transport.processMessage(msg);
    if (responsePromise) {
      responses.push(await responsePromise);
    }
  }

  const result = isBatch ? responses : responses[0] ?? null;
  return jsonResponse(result);
}

// ─── Worker Entry Point ───────────────────────────────────────────────────────

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // Bearer token auth — REQUIRED. Misconfiguration fails closed.
    if (!env.MCP_AUTH_TOKEN) {
      return jsonResponse(
        { error: "Server misconfigured: MCP_AUTH_TOKEN secret is not set." },
        500
      );
    }
    const auth = request.headers.get("Authorization");
    if (auth !== `Bearer ${env.MCP_AUTH_TOKEN}`) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    // Health check
    if (pathname === "/health" && request.method === "GET") {
      return jsonResponse({ status: "ok", server: "redmine-mcp-server" });
    }

    // MCP Streamable HTTP transport endpoint
    if (pathname === "/mcp" && request.method === "POST") {
      return handleMcpRequest(request, env);
    }

    return new Response("Not Found", { status: 404, headers: CORS_HEADERS });
  },
};
