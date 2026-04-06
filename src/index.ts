import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs/promises";
import { optionalAuth } from "./middleware/auth.js";
import authRouter from "./routes/auth.js";
import membersRouter from "./routes/members.js";
import depositsRouter from "./routes/deposits.js";
import galleryRouter from "./routes/gallery.js";
import boardRouter from "./routes/board.js";
import messagesRouter from "./routes/messages.js";
import settingsRouter from "./routes/settings.js";
import rulesRouter from "./routes/rules.js";
import notificationsRouter from "./routes/notifications.js";
import { ensureMembersTable, ensureDepositsTable, ensureGalleryTable, ensureBoardMembersTable, ensureMessagesTable, ensureSiteSettingsTable, ensureRulesTable, ensureNotificationsTable } from "./db/ensureTable.js";
import { ensureInitialAdmin } from "./db/bootstrapAdmin.js";

const app = express();
const port = Number(process.env.PORT) || 8000;

// CORS: allow one or more origins (comma-separated in env). Server must send exactly one origin per response.
const corsOrigins = (process.env.CORS_ORIGIN ?? "http://localhost:3000")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);
app.use(cors({ origin: corsOrigins.length > 0 ? corsOrigins : ["http://localhost:3000"], credentials: true }));
app.use(express.json({ limit: "10mb" }));

// Serve legacy local uploads (for older records that still point to /uploads/....)
const uploadsDir = path.join(process.cwd(), "uploads");
const uploadSubDirs = ["members", "gallery", "board", "logo"];
async function ensureUploadDirs() {
  try {
    await fs.mkdir(uploadsDir, { recursive: true });
    await Promise.all(
      uploadSubDirs.map((sub) =>
        fs.mkdir(path.join(uploadsDir, sub), { recursive: true }),
      ),
    );
  } catch (err) {
    // Directory creation failure should not crash the server in production;
    // log and continue so existing ImageKit-based URLs still work.
    console.error("Failed to ensure upload directories:", err);
  }
}
// Kick off directory creation (no await so startup isn't blocked)
void ensureUploadDirs();
app.use("/uploads", express.static(uploadsDir));

app.use("/api/web/v1/authentication", authRouter);
app.use("/api/web/v1/users", optionalAuth, membersRouter);
app.use("/api/web/v1/deposits", optionalAuth, depositsRouter);
app.use("/api/web/v1/gallery", optionalAuth, galleryRouter);
app.use("/api/web/v1/board", optionalAuth, boardRouter);
app.use("/api/web/v1/messages", messagesRouter);
app.use("/api/web/v1/notifications", notificationsRouter);
app.use("/api/web/v1/settings", settingsRouter);
app.use("/api/web/v1/rules", optionalAuth, rulesRouter);

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

async function initializeSchema() {
  await ensureMembersTable();
  await ensureDepositsTable();
  await ensureGalleryTable();
  await ensureBoardMembersTable();
  await ensureMessagesTable();
  await ensureNotificationsTable();
  await ensureSiteSettingsTable();
  await ensureRulesTable();
}

initializeSchema()
  .then(() => ensureInitialAdmin())
  .then(() => {
    app.listen(port, () => {
      console.log(`IMF Backend running at http://localhost:${port}`);
    });
  })
  .catch((err) => {
    console.error("Startup failed:", err);
    process.exit(1);
  });
