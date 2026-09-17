/**
 * Redmine API service using native fetch (compatible with Cloudflare Workers and Node.js).
 */

export interface RedmineEnv {
  REDMINE_URL: string;
  REDMINE_API_KEY: string;
  /**
   * What to tell the user when credentials are missing. Entry points know how
   * their users are meant to set things up — a terminal command on Node, Worker
   * secrets on Cloudflare — and this layer only knows that nothing arrived.
   * Optional: without it, callers get the plain message below.
   */
  SETUP_HINT?: string;
}

/**
 * Credentials were never supplied. Carries a ready-to-read explanation, so
 * handleApiError passes the message through untouched instead of decorating it.
 */
class NotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotConfiguredError";
  }
}

class RedmineApiError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "RedmineApiError";
  }
}

export async function makeApiRequest<T>(
  env: RedmineEnv,
  endpoint: string,
  method: "GET" | "POST" | "PUT" | "DELETE" = "GET",
  data?: Record<string, unknown>,
  params?: Record<string, unknown>
): Promise<T> {
  // The server starts without credentials on purpose, so every call has to
  // check. This is the only place a user hears about it, so it carries the
  // whole setup story rather than naming the variable that happens to be empty.
  const missing = (["REDMINE_URL", "REDMINE_API_KEY"] as const).filter(
    (key) => !env[key]
  );
  if (missing.length > 0) {
    throw new NotConfiguredError(
      env.SETUP_HINT ??
        `Redmine is not configured: ${missing.join(" and ")} ${
          missing.length > 1 ? "are" : "is"
        } missing.`
    );
  }

  const baseURL = env.REDMINE_URL.replace(/\/+$/, "");
  let url = `${baseURL}${endpoint}`;

  if (params && Object.keys(params).length > 0) {
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value != null) searchParams.append(key, String(value));
    }
    url += `?${searchParams.toString()}`;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30_000);

  const init: RequestInit = {
    method,
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "X-Redmine-API-Key": env.REDMINE_API_KEY,
    },
    signal: controller.signal,
  };

  if (data != null) {
    init.body = JSON.stringify(data);
  }

  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error("Request timed out after 30 seconds.");
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }

  // 204 No Content (e.g. PUT responses from Redmine)
  if (response.status === 204) {
    return {} as T;
  }

  if (!response.ok) {
    let errorMessage: string | null = null;
    try {
      const body = await response.json() as { errors?: string[] };
      if (body?.errors && Array.isArray(body.errors)) {
        errorMessage = body.errors.join(", ");
      }
    } catch {
      // ignore parse errors
    }
    throw new RedmineApiError(response.status, errorMessage ?? `HTTP ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export function handleApiError(error: unknown): string {
  if (error instanceof NotConfiguredError) {
    return error.message;
  }
  if (error instanceof RedmineApiError) {
    switch (error.status) {
      case 401: return "Error: Authentication failed. Check your REDMINE_API_KEY.";
      case 403: return "Error: Permission denied. Your API key lacks access to this resource.";
      case 404: return "Error: Resource not found. Check the ID or identifier.";
      case 422: return `Error: Validation failed. ${error.message}`;
      case 429: return "Error: Rate limit exceeded. Wait before retrying.";
      default: return `Error: Redmine API returned status ${error.status}. ${error.message}`;
    }
  }
  return `Error: ${error instanceof Error ? error.message : String(error)}`;
}
