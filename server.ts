import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";

const db = new Database("rankings.db");

// Initialize database
db.exec(`
  CREATE TABLE IF NOT EXISTS rankings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    score INTEGER NOT NULL,
    color_name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Routes
  app.get("/api/rankings", (req, res) => {
    const rows = db.prepare("SELECT * FROM rankings ORDER BY score DESC LIMIT 10").all();
    res.json(rows);
  });

  app.post("/api/rankings", (req, res) => {
    const { username, score, color_name } = req.body;
    if (!username || score === undefined || !color_name) {
      return res.status(400).json({ error: "Missing fields" });
    }
    const info = db.prepare("INSERT INTO rankings (username, score, color_name) VALUES (?, ?, ?)").run(username, score, color_name);
    res.json({ id: info.lastInsertRowid });
  });

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
