/**
 * Cloudflare Pages Function: proxy /api/live/* to the cadlad-live-sessions Worker.
 *
 * Two binding strategies are supported (configure one in the Pages dashboard):
 *
 *   1. Service binding (preferred, zero latency):
 *      Pages dashboard → Settings → Functions → Service bindings
 *      Add binding: variable name = LIVE_SESSION_API, service = cadlad-live-sessions
 *
 *   2. URL-based proxy (simple, any deploy):
 *      Pages dashboard → Settings → Environment variables
 *      Add: LIVE_SESSION_WORKER_URL = https://cadlad-live-sessions.<account>.workers.dev
 */

interface Env {
  /** Service binding to the cadlad-live-sessions Worker (preferred). */
  LIVE_SESSION_API?: { fetch(req: Request): Promise<Response> };
  /** HTTP URL of the Worker, used when the service binding is absent. */
  LIVE_SESSION_WORKER_URL?: string;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  // Strategy 1: service binding — direct Worker-to-Worker call, no extra hop
  if (env.LIVE_SESSION_API) {
    return env.LIVE_SESSION_API.fetch(request);
  }

  // Strategy 2: HTTP proxy via explicit worker URL
  if (env.LIVE_SESSION_WORKER_URL) {
    const workerBase = env.LIVE_SESSION_WORKER_URL.replace(/\/$/, "");
    const url = new URL(request.url);
    const proxyUrl = `${workerBase}${url.pathname}${url.search}`;
    return fetch(proxyUrl, {
      method: request.method,
      headers: request.headers,
      body: request.method !== "GET" && request.method !== "HEAD" ? request.body : undefined,
      // @ts-expect-error — CF-specific option: don't follow redirects across workers
      redirect: "manual",
    });
  }

  return new Response(
    JSON.stringify({
      error: "Live session API not configured",
      code: "NOT_CONFIGURED",
      hint: "Set LIVE_SESSION_API service binding or LIVE_SESSION_WORKER_URL env var in Pages dashboard",
    }),
    { status: 503, headers: { "Content-Type": "application/json" } },
  );
};
