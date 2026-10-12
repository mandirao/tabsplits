// Refuses to continue when DATABASE_URL points at the production Supabase
// project. Used by `npm run dev` and `npm run db:push` so local work can't
// touch real receipts by accident.
//
// Set PRODUCTION_SUPABASE_REF in .env to the production project's ref (the
// `<project-ref>` in its URLs; an identifier, not a secret). Deliberate
// production schema pushes: run with ALLOW_PRODUCTION_DB=1.

const url = process.env.DATABASE_URL ?? "";
const prodRef = (process.env.PRODUCTION_SUPABASE_REF ?? "").trim();

if (!url) {
  console.error("[guard] DATABASE_URL is not set. Copy .env.example to .env and use DEVELOPMENT values.");
  process.exit(1);
}

let host = "";
let user = "";
try {
  ({ hostname: host, username: user } = new URL(url));
} catch {
  console.error("[guard] DATABASE_URL is not a valid connection URL.");
  process.exit(1);
}

if (prodRef && (user.includes(prodRef) || host.includes(prodRef)) && process.env.ALLOW_PRODUCTION_DB !== "1") {
  console.error(
    "[guard] DATABASE_URL points at the PRODUCTION Supabase project. Refusing to continue.\n" +
    "        Use the development project's connection string (see docs/environments.md)."
  );
  process.exit(1);
}

if (!prodRef) {
  console.warn("[guard] PRODUCTION_SUPABASE_REF is not set, so the production check is off. See docs/environments.md.");
}
