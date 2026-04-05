/**
 * Cloudflare Pages Function: proxy /health to the cadlad-live-sessions Worker.
 * Mirrors the same binding strategy as /api/live/[[catchall]].ts.
 */

interface Env {
  LIVE_SESSION_API?: { fetch(req: Request): Promise<Response> };
  LIVE_SESSION_WORKER_URL?: string;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  if (env.LIVE_SESSION_API) {
    return env.LIVE_SESSION_API.fetch(request);
  }

  if (env.LIVE_SESSION_WORKER_URL) {
    const workerBase = env.LIVE_SESSION_WORKER_URL.replace(/\/$/, "");
    return fetch(`${workerBase}/health`, { headers: request.headers });
  }

  return new Response(
    JSON.stringify({ status: "unconfigured", service: "cadlad-live-sessions" }),
    { status: 503, headers: { "Content-Type": "application/json" } },
  );
};
