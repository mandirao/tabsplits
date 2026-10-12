import { test } from "node:test";
import assert from "node:assert/strict";
import { getSessionSecret, redactPath } from "./requestSecurity";

test("production refuses to start without SESSION_SECRET", () => {
  assert.throws(() => getSessionSecret({ NODE_ENV: "production" }), /SESSION_SECRET must be set/);
  assert.throws(() => getSessionSecret({ VERCEL: "1" }), /SESSION_SECRET must be set/);
});

test("configured secret is used; local dev gets a throwaway default", () => {
  assert.equal(getSessionSecret({ NODE_ENV: "production", SESSION_SECRET: "s3cret" }), "s3cret");
  assert.equal(getSessionSecret({ NODE_ENV: "development" }), "local-dev-only-session-secret");
});

test("share tokens are redacted from logged paths", () => {
  assert.equal(redactPath("/api/share/0b6c3c1e-1234-4abc-9def-001122334455"), "/api/share/:token");
  assert.equal(redactPath("/api/receipts/abc/items"), "/api/receipts/abc/items");
});
