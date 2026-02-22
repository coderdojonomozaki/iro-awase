import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";

const db = (() => {
  try {
    // NOTE: Vercel is serverless. Filesystem changes to rankings.db will NOT persist
    // across requests or redeploys. For real persistence on Vercel, use a managed
    // database like Vercel Postgres or Neon.
    const dbPath = process.env.NODE_ENV === "production" ? "/tmp/rankings.db" : "rankings.db";
    const database = new Database(dbPath);
    console.log(`Database initialized at ${dbPath}`);
    return database;
  } catch (err) {
    console.error("Failed to initialize database, using in-memory:", err);
    return new Database(":memory:");
  }
})();

// Initialize database
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS rankings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL,
      score INTEGER NOT NULL,
      color_name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log("Table 'rankings' ensured");
} catch (err) {
  console.error("Failed to create table:", err);
}

async function startServer() {
  console.log("Starting server...");
  console.log("NODE_ENV:", process.env.NODE_ENV);
  console.log("Current directory:", process.cwd());

  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Logging middleware
  app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
  });

  // API Routes (defined BEFORE static/vite middleware)
  const rankingsRouter = express.Router();

  rankingsRouter.get("/", (req, res) => {
    try {
      const { color_name } = req.query;
      let rows;
      if (color_name) {
        rows = db.prepare("SELECT * FROM rankings WHERE color_name = ? ORDER BY score DESC LIMIT 10").all(color_name);
      } else {
        rows = db.prepare("SELECT * FROM rankings ORDER BY score DESC LIMIT 10").all();
      }
      res.json(rows);
    } catch (err) {
      console.error("GET /api/rankings error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  rankingsRouter.post("/", (req, res) => {
    try {
      const { username, score, color_name } = req.body;
      if (!username || score === undefined || !color_name) {
        return res.status(400).json({ error: "Missing fields" });
      }
      const info = db.prepare("INSERT INTO rankings (username, score, color_name) VALUES (?, ?, ?)").run(username, score, color_name);
      res.json({ id: info.lastInsertRowid });
    } catch (err) {
      console.error("POST /api/rankings error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.use("/api/rankings", rankingsRouter);

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(process.cwd(), "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(process.cwd(), "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
