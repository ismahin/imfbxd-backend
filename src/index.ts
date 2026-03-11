import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import { optionalAuth } from "./middleware/auth.js";
import authRouter from "./routes/auth.js";
import membersRouter from "./routes/members.js";
import depositsRouter from "./routes/deposits.js";
import galleryRouter from "./routes/gallery.js";
import boardRouter from "./routes/board.js";
import messagesRouter from "./routes/messages.js";
import settingsRouter from "./routes/settings.js";
import { ensureMembersTable, ensureDepositsTable, ensureGalleryTable, ensureBoardMembersTable, ensureMessagesTable, ensureSiteSettingsTable } from "./db/ensureTable.js";
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

// Serve uploaded profile pictures (e.g. /uploads/members/xxx.jpg)
const uploadsDir = path.join(process.cwd(), "uploads");
app.use("/uploads", express.static(uploadsDir));

app.use("/api/web/v1/authentication", authRouter);
app.use("/api/web/v1/users", optionalAuth, membersRouter);
app.use("/api/web/v1/deposits", optionalAuth, depositsRouter);
app.use("/api/web/v1/gallery", optionalAuth, galleryRouter);
app.use("/api/web/v1/board", optionalAuth, boardRouter);
app.use("/api/web/v1/messages", messagesRouter);
app.use("/api/web/v1/settings", settingsRouter);

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

Promise.all([ensureMembersTable(), ensureDepositsTable(), ensureGalleryTable(), ensureBoardMembersTable(), ensureMessagesTable(), ensureSiteSettingsTable()])
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
