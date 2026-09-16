/**
 * Credential resolution for the stdio entry point (Node.js only).
 *
 * Portable plugin manifests cannot carry secrets: the Agent Plugins spec expands
 * only ${PLUGIN_ROOT} and ${PLUGIN_DATA}, and forbids credentials in headers.
 * So a plugin-installed server has no way to receive the user's API key through
 * mcp.json. It reads a JSON config file from the plugin's own data directory
 * instead, which the manifest CAN point at via ${PLUGIN_DATA}.
 *
 * Resolution order (first non-empty value wins, per field):
 *   1. process.env.REDMINE_URL / REDMINE_API_KEY
 *   2. JSON file at process.env.REDMINE_CONFIG_PATH
 *   3. JSON file at the default config path, written by `--init`
 *
 * Step 3 exists so someone installing by hand never has to learn what
 * REDMINE_CONFIG_PATH is; that variable is really for plugin manifests.
 *
 * Not imported by worker.ts — Cloudflare Workers has no filesystem and receives
 * its credentials as Worker secrets.
 */

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { RedmineEnv } from "./services/api.js";

/**
 * A setup problem the user can fix (missing or malformed credentials), as
 * opposed to a bug. Entry points print these without a stack trace.
 */
export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

/**
 * Where `--init` writes credentials and where the server looks when nothing
 * else supplies them. Follows the XDG base directory convention.
 */
export function defaultConfigPath(): string {
  const base = process.env.XDG_CONFIG_HOME?.trim() || join(homedir(), ".config");
  return join(base, "redmine-mcp", "config.json");
}

/** Shape of the JSON config file. Keys mirror the env vars. */
interface RedmineConfigFile {
  REDMINE_URL?: string;
  REDMINE_API_KEY?: string;
}

/**
 * Reads the config file if REDMINE_CONFIG_PATH is set and the file exists.
 * A missing file is not an error — env vars alone are a valid setup. A file
 * that exists but cannot be parsed IS an error, because silently ignoring it
 * would surface later as a confusing "REDMINE_URL is required".
 */
function readConfigFile(path: string): RedmineConfigFile {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw new ConfigError(
      `Cannot read REDMINE_CONFIG_PATH (${path}): ${(error as Error).message}`
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new ConfigError(
      `REDMINE_CONFIG_PATH (${path}) is not valid JSON: ${(error as Error).message}`
    );
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new ConfigError(
      `REDMINE_CONFIG_PATH (${path}) must contain a JSON object with REDMINE_URL and REDMINE_API_KEY.`
    );
  }

  return parsed as RedmineConfigFile;
}

/** Trims and treats whitespace-only values as absent. */
function clean(value: string | undefined): string {
  return value?.trim() ?? "";
}

/**
 * True when a manifest placeholder survived into the value, e.g. a client that
 * does not implement ${PLUGIN_DATA} passed the literal string through. Treating
 * such a value as a real path would produce a misleading "cannot read" error,
 * so callers ignore it and fall back to environment variables.
 */
function hasUnexpandedPlaceholder(value: string): boolean {
  return /\$\{[A-Za-z_][A-Za-z0-9_]*\}/.test(value);
}

/**
 * Resolves Redmine credentials, or throws an error that tells the user both
 * ways to supply them.
 */
export function resolveRedmineEnv(): RedmineEnv {
  const rawConfigPath = clean(process.env.REDMINE_CONFIG_PATH);
  const configPath = hasUnexpandedPlaceholder(rawConfigPath) ? "" : rawConfigPath;

  // An explicit path is authoritative: if it is set but unusable, that is worth
  // reporting rather than silently reading a different file.
  const file = configPath
    ? readConfigFile(configPath)
    : readConfigFile(defaultConfigPath());

  const env: RedmineEnv = {
    REDMINE_URL: clean(process.env.REDMINE_URL) || clean(file.REDMINE_URL),
    REDMINE_API_KEY:
      clean(process.env.REDMINE_API_KEY) || clean(file.REDMINE_API_KEY),
  };

  const missing = (Object.keys(env) as (keyof RedmineEnv)[]).filter(
    (key) => !env[key]
  );

  if (missing.length > 0) {
    throw new ConfigError(
      `Missing Redmine credentials: ${missing.join(", ")}.\n\n` +
        `Run this once to set them up:\n` +
        `  npx @leethais91/redmine-mcp-server --init\n\n` +
        `It asks for your Redmine URL and API key, checks them against the ` +
        `server, and saves them to:\n` +
        `  ${configPath || defaultConfigPath()}\n\n` +
        `Alternatively, set REDMINE_URL and REDMINE_API_KEY as environment ` +
        `variables.`
    );
  }

  return env;
}
