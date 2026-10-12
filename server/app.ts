import express, { type Request, Response, NextFunction } from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { type Server } from "http";
import { registerRoutes } from "./routes";
import { log } from "./log";
import { pool } from "./db";
import { getSessionSecret, redactPath } from "./requestSecurity";

declare module 'http' {
  interface IncomingMessage {
    rawBody: unknown
  }
}

declare module 'express-session' {
  interface SessionData {
    userId: string;
    userEmail: string;
    userName: string;
  }
}

// Builds the Express app with all API routes registered but without any
// static/vite serving or listening — shared by the local server entry
// (server/index.ts) and the Vercel serverless entry (api/index.ts).
export async function createApp(): Promise<{ app: express.Express; server: Server }> {
  const app = express();

  // Trust the hosting platform's reverse proxy so secure cookies work in production
  app.set("trust proxy", 1);

  app.use(express.json({
    limit: '10mb',
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    }
  }));
  app.use(express.urlencoded({ extended: false, limit: '10mb' }));

  const PgSession = connectPgSimple(session);
  app.use(session({
    store: new PgSession({
      pool,
      createTableIfMissing: true,
    }),
    secret: getSessionSecret(),
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      sameSite: process.env.NODE_ENV === "production" ? "strict" : "lax",
    },
  }));

  // Request log: method, path, status, and duration only. Response bodies are
  // never logged — they carry receipt contents, names, phone numbers, and share
  // tokens. Share tokens in the path are redacted for the same reason.
  app.use((req, res, next) => {
    const start = Date.now();
    const path = req.path;

    res.on("finish", () => {
      if (path.startsWith("/api")) {
        const duration = Date.now() - start;
        log(`${req.method} ${redactPath(path)} ${res.statusCode} in ${duration}ms`);
      }
    });

    next();
  });

  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error(err);
    res.status(status).json({ message });
  });

  return { app, server };
}
