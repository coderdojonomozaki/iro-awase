import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import { sql } from "@vercel/postgres";

// Database abstraction to handle both SQLite (local) and Postgres (Vercel)
const isPostgres = !!process.env.POSTGRES_URL;

const db = (() => {
  if (isPostgres) {
    console.log("Using Vercel Postgres");
    return null; // We'll use the 'sql' tag from @vercel/postgres
  }
  try {
    const dbPath = "rankings.db";
    const database = new Database(dbPath);
    console.log(`Local SQLite initialized at ${dbPath}`);
    return database;
  } catch (err) {
    console.error("Failed to initialize local database, using in-memory:", err);
    return new Database(":memory:");
  }
})();

// Initialize database table
async function initDb() {
  if (isPostgres) {
    try {
      await sql`
        CREATE TABLE IF NOT EXISTS rankings (
          id SERIAL PRIMARY KEY,
          username TEXT NOT NULL,
          score INTEGER NOT NULL,
          color_name TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `;
      console.log("Postgres table 'rankings' ensured");
    } catch (err) {
      console.error("Failed to create Postgres table:", err);
    }
  } else if (db) {
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
      console.log("SQLite table 'rankings' ensured");
    } catch (err) {
      console.error("Failed to create SQLite table:", err);
    }
  }
}

initDb();

async function startServer() {
  console.log("Starting server...");
  console.log("NODE_ENV:", process.env.NODE_ENV);
  console.log("Current directory:", process.cwd());

  const app = express();
  const PORT = parseInt(process.env.PORT || "3000", 10);

  app.use(express.json());

  // Logging middleware
  app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
  });

  // API Routes (defined BEFORE static/vite middleware)
  const rankingsRouter = express.Router();

  rankingsRouter.get("/", async (req, res) => {
    try {
      const { color_name } = req.query;
      let rows;

      if (isPostgres) {
        if (color_name) {
          const result = await sql`SELECT * FROM rankings WHERE color_name = ${color_name as string} ORDER BY score DESC LIMIT 10`;
          rows = result.rows;
        } else {
          const result = await sql`SELECT * FROM rankings ORDER BY score DESC LIMIT 10`;
          rows = result.rows;
        }
      } else if (db) {
        if (color_name) {
          rows = db.prepare("SELECT * FROM rankings WHERE color_name = ? ORDER BY score DESC LIMIT 10").all(color_name);
        } else {
          rows = db.prepare("SELECT * FROM rankings ORDER BY score DESC LIMIT 10").all();
        }
      }
      res.json(rows);
    } catch (err) {
      console.error("GET /api/rankings error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  rankingsRouter.post("/", async (req, res) => {
    try {
      const { username, score, color_name } = req.body;
      if (!username || score === undefined || !color_name) {
        return res.status(400).json({ error: "Missing fields" });
      }

      if (isPostgres) {
        const result = await sql`
          INSERT INTO rankings (username, score, color_name) 
          VALUES (${username}, ${score}, ${color_name})
          RETURNING id
        `;
        res.json({ id: result.rows[0].id });
      } else if (db) {
        const info = db.prepare("INSERT INTO rankings (username, score, color_name) VALUES (?, ?, ?)").run(username, score, color_name);
        res.json({ id: info.lastInsertRowid });
      }
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
