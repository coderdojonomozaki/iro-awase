import express from "express";
import path from "path";
import { neon } from "@neondatabase/serverless";

// Database abstraction to handle both SQLite (local) and Neon (Postgres)
const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
const isNeon = !!databaseUrl;
let db: any = null;

const sql = isNeon ? neon(databaseUrl!) : null;

async function getDb() {
  if (isNeon) return null;
  if (db) return db;
  
  try {
    const { default: Database } = await import("better-sqlite3");
    const dbPath = "rankings.db";
    db = new Database(dbPath);
    console.log(`Local SQLite initialized at ${dbPath}`);
    return db;
  } catch (err) {
    console.error("Failed to initialize local database, using in-memory:", err);
    const { default: Database } = await import("better-sqlite3");
    db = new Database(":memory:");
    return db;
  }
}

// Initialize database table
async function initDb() {
  if (isNeon && sql) {
    console.log("Attempting to initialize Neon Postgres...");
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
      console.log("Neon Postgres table 'rankings' ensured");
    } catch (err) {
      console.error("Failed to create Neon Postgres table:", err);
      console.error("Check if DATABASE_URL is correct and the database is accessible.");
    }
  } else {
    console.log("Neon not configured, using local SQLite.");
    const localDb = await getDb();
    if (localDb) {
      try {
        localDb.exec(`
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
}

async function startServer() {
  console.log("Starting server...");
  console.log("NODE_ENV:", process.env.NODE_ENV);
  
  const app = express();
  const PORT = parseInt(process.env.PORT || "3000", 10);

  app.use(express.json());

  // Ensure DB is initialized
  await initDb();

  // API Routes
  const rankingsRouter = express.Router();

  rankingsRouter.get("/", async (req, res) => {
    try {
      const { color_name } = req.query;
      let rows;

      if (isNeon && sql) {
        if (color_name) {
          rows = await (sql as any)("SELECT * FROM rankings WHERE color_name = $1 ORDER BY score DESC LIMIT 10", [color_name as string]);
        } else {
          rows = await (sql as any)("SELECT * FROM rankings ORDER BY score DESC LIMIT 10");
        }
      } else {
        const localDb = await getDb();
        if (color_name) {
          rows = localDb.prepare("SELECT * FROM rankings WHERE color_name = ? ORDER BY score DESC LIMIT 10").all(color_name);
        } else {
          rows = localDb.prepare("SELECT * FROM rankings ORDER BY score DESC LIMIT 10").all();
        }
      }
      res.json(rows || []);
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

      if (isNeon && sql) {
        const result = await (sql as any)(
          "INSERT INTO rankings (username, score, color_name) VALUES ($1, $2, $3) RETURNING id",
          [username, score, color_name]
        );
        res.json({ id: result[0].id });
      } else {
        const localDb = await getDb();
        const info = localDb.prepare("INSERT INTO rankings (username, score, color_name) VALUES (?, ?, ?)").run(username, score, color_name);
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
    const { createServer: createViteServer } = await import("vite");
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

  if (process.env.VERCEL !== "1") {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  }
  
  return app;
}

const appPromise = startServer().catch(err => {
  console.error("Failed to start server:", err);
});

export default async (req: any, res: any) => {
  const app = await appPromise;
  if (app) {
    app(req, res);
  } else {
    res.status(500).send("Server failed to initialize");
  }
};
