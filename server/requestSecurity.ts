// Small security helpers used by server/app.ts. No DB imports, so they're unit-testable.

export function redactPath(path: string): string {
  return path.replace(/^\/api\/share\/[^/]+/, "/api/share/:token");
}

// Deployed environments (Vercel preview/production, or NODE_ENV=production)
// must provide SESSION_SECRET; a known fallback would let anyone forge
// session cookies. Local development keeps a throwaway default.
export function getSessionSecret(env: NodeJS.ProcessEnv = process.env): string {
  if (env.SESSION_SECRET) return env.SESSION_SECRET;
  if (env.NODE_ENV === "production" || env.VERCEL) {
    throw new Error("SESSION_SECRET must be set in production. Refusing to start with a fallback secret.");
  }
  return "local-dev-only-session-secret";
}
