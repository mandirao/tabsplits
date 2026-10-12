import type { Express, Request, Response, NextFunction } from "express";
import { randomUUID } from "crypto";
import { StorageClient } from "@supabase/storage-js";
import { storage } from "./storage";
import { authorizeObjectAccess, ownedUploadPrefix } from "./objectAccess";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10MB
const ALLOWED_CONTENT_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);
const SIGNED_URL_TTL_SECONDS = 300;

function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

// Receipt images live in a private Supabase Storage bucket. Uploads use
// short-lived signed upload URLs (client PUTs the file directly to Supabase);
// reads are authorized here (see objectAccess.ts) and then redirect to a
// short-lived signed download URL. New uploads are stored under
// `uploads/<userId>/<uuid>`; legacy `uploads/<uuid>` paths remain readable
// through the receipt that references them.
const BUCKET = "receipts";

function getStorage() {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  }
  return new StorageClient(`${url}/storage/v1`, {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
  });
}

export function registerObjectStorageRoutes(app: Express): void {
  // Request a signed URL for a direct-to-storage upload.
  // The client sends JSON metadata only, then PUTs the file to uploadURL.
  app.post("/api/uploads/request-url", requireAuth, async (req, res) => {
    try {
      const { name, size, contentType } = req.body;
      if (!name) {
        return res.status(400).json({ error: "Missing required field: name" });
      }
      if (contentType && !ALLOWED_CONTENT_TYPES.has(contentType)) {
        return res.status(400).json({ error: "Unsupported file type" });
      }
      if (size && size > MAX_UPLOAD_BYTES) {
        return res.status(400).json({ error: "File too large" });
      }

      const objectPath = `${ownedUploadPrefix(req.session.userId!)}${randomUUID()}`;
      const { data, error } = await getStorage()
        .from(BUCKET)
        .createSignedUploadUrl(objectPath);
      if (error || !data) {
        throw error ?? new Error("No signed URL returned");
      }

      res.json({
        uploadURL: data.signedUrl,
        objectPath: `/objects/${objectPath}`,
        metadata: { name, size, contentType },
      });
    } catch (error) {
      console.error("Error generating upload URL:", error);
      res.status(500).json({ error: "Failed to generate upload URL" });
    }
  });

  // Serve an uploaded object to its owner, or to a share-link viewer of the
  // receipt it's attached to (`?share=<token>`), via a signed download URL.
  app.get("/objects/:objectPath(*)", async (req, res) => {
    try {
      const decision = await authorizeObjectAccess(
        { objectPath: req.params.objectPath, userId: req.session.userId, shareToken: req.query.share },
        {
          findReceiptByShareToken: token => storage.getReceiptByShareToken(token),
          userHasReceiptWithImage: (userId, imageUrl) => storage.userHasReceiptWithImage(userId, imageUrl),
        },
      );
      res.set("Cache-Control", "private, no-store");
      if (decision === "unauthenticated") {
        return res.status(401).json({ error: "Unauthorized" });
      }
      if (decision !== "allow") {
        // Same response for "doesn't exist" and "not yours" so paths can't be probed.
        return res.status(404).json({ error: "Object not found" });
      }

      const { data, error } = await getStorage()
        .from(BUCKET)
        .createSignedUrl(req.params.objectPath, SIGNED_URL_TTL_SECONDS);
      if (error || !data) {
        return res.status(404).json({ error: "Object not found" });
      }
      res.redirect(302, data.signedUrl);
    } catch (error) {
      console.error("Error serving object:", error);
      res.status(500).json({ error: "Failed to serve object" });
    }
  });
}
