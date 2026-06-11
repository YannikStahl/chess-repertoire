import express from "express";
import { promises as fs } from "fs";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import { exportPgn } from "./pgn.js";
import { importPgn } from "./pgnImport.js";

const run = promisify(exec);

const DATA_DIR = process.env.DATA_DIR || path.resolve("./data");
const PUBLIC_DIR = process.env.PUBLIC_DIR || null;
const PORT = process.env.PORT || 3001;

const START_EPD = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -";
const COLORS = ["white", "black"];

const emptyRepertoire = (color) => ({
  version: 1,
  color,
  positions: { [START_EPD]: { annotation: "", moves: [] } },
});
const emptyTraining = () => ({ version: 1, items: {} });

function repPath(color) {
  return path.join(DATA_DIR, `repertoire-${color}.json`);
}
const trainingPath = () => path.join(DATA_DIR, "training.json");

async function ensureFile(file, fallback) {
  try {
    await fs.access(file);
  } catch {
    await writeJson(file, fallback);
  }
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, "utf8"));
}

// Write to a temp file then rename, so a crash mid-write never corrupts data.
async function writeJson(file, data) {
  const tmp = file + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(data, null, 2) + "\n", "utf8");
  await fs.rename(tmp, file);
}

async function ensureData() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  for (const c of COLORS) await ensureFile(repPath(c), emptyRepertoire(c));
  await ensureFile(trainingPath(), emptyTraining());
  // Initialize a git repo for the data directory if one doesn't exist yet.
  try {
    await fs.access(path.join(DATA_DIR, ".git"));
  } catch {
    try {
      await run("git init", { cwd: DATA_DIR });
      await run('git config user.name "Repertoire"', { cwd: DATA_DIR });
      await run('git config user.email "repertoire@local"', { cwd: DATA_DIR });
      await run('git add -A && git commit -m "initial repertoire"', { cwd: DATA_DIR });
    } catch (e) {
      console.warn("git init skipped:", e.message);
    }
  }
}

const app = express();
app.use(express.json({ limit: "20mb" }));
app.use(express.text({ type: ["application/x-chess-pgn", "text/plain"], limit: "20mb" }));

function validColor(req, res) {
  const { color } = req.params;
  if (!COLORS.includes(color)) {
    res.status(400).json({ error: "color must be white or black" });
    return null;
  }
  return color;
}

app.get("/api/repertoire/:color", async (req, res) => {
  const color = validColor(req, res);
  if (!color) return;
  res.json(await readJson(repPath(color)));
});

app.put("/api/repertoire/:color", async (req, res) => {
  const color = validColor(req, res);
  if (!color) return;
  await writeJson(repPath(color), req.body);
  res.json({ ok: true });
});

app.get("/api/training", async (_req, res) => res.json(await readJson(trainingPath())));

app.put("/api/training", async (req, res) => {
  await writeJson(trainingPath(), req.body);
  res.json({ ok: true });
});

app.post("/api/git/commit", async (req, res) => {
  const message = (req.body && req.body.message) || `repertoire update ${new Date().toISOString()}`;
  try {
    await run(`git add -A && git commit -m ${JSON.stringify(message)}`, { cwd: DATA_DIR });
    res.json({ ok: true, message: "Committed" });
  } catch (e) {
    if (/nothing to commit/i.test(e.stdout || "") || /nothing to commit/i.test(e.message)) {
      res.json({ ok: true, message: "Nothing to commit" });
    } else {
      res.status(500).json({ ok: false, error: e.message });
    }
  }
});

// --- Lichess proxies (free, no auth). Proxied so the browser avoids CORS
// issues and so rate limiting / caching can be added in one place later. ---
const explorerCache = new Map();

app.get("/api/explorer", async (req, res) => {
  const fen = req.query.fen;
  if (!fen) return res.status(400).json({ error: "fen required" });
  if (explorerCache.has(fen)) return res.json(explorerCache.get(fen));
  try {
    const url = `https://explorer.lichess.ovh/masters?fen=${encodeURIComponent(fen)}&moves=8&topGames=0`;
    const r = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: { "User-Agent": "chess-repertoire (personal opening tool)" },
    });
    if (!r.ok) {
      // Lichess is reachable but refused the request (e.g. 401/429/503 during a
      // masters-explorer outage). Report it as unavailable rather than failing —
      // don't cache, so it recovers automatically once the service is back.
      return res.json({ unavailable: true, status: r.status });
    }
    const data = await r.json();
    explorerCache.set(fen, data);
    res.json(data);
  } catch (e) {
    // Network/DNS/timeout: couldn't reach Lichess at all.
    res.json({ unavailable: true, status: 0, error: e.message });
  }
});

app.get("/api/eval", async (req, res) => {
  const fen = req.query.fen;
  if (!fen) return res.status(400).json({ error: "fen required" });
  const multiPv = Math.min(5, Math.max(1, parseInt(req.query.multiPv, 10) || 1));
  try {
    const url = `https://lichess.org/api/cloud-eval?fen=${encodeURIComponent(fen)}&multiPv=${multiPv}`;
    const r = await fetch(url);
    if (r.status === 404) return res.json({ available: false });
    if (!r.ok) return res.status(r.status).json({ error: "eval unavailable" });
    const data = await r.json();
    res.json({ available: true, ...data });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

app.get("/api/export/:color", async (req, res) => {
  const color = validColor(req, res);
  if (!color) return;
  const rep = await readJson(repPath(color));
  const pgn = exportPgn(rep);
  res.setHeader("Content-Type", "application/x-chess-pgn");
  res.setHeader("Content-Disposition", `attachment; filename="repertoire-${color}.pgn"`);
  res.send(pgn);
});

app.post("/api/import/:color", async (req, res) => {
  const color = validColor(req, res);
  if (!color) return;
  const pgnText = typeof req.body === "string" ? req.body : req.body && req.body.pgn;
  if (!pgnText) return res.status(400).json({ error: "PGN text required" });
  const rep = await readJson(repPath(color));
  try {
    const report = importPgn(rep, pgnText);
    await writeJson(repPath(color), rep);
    res.json({ ok: true, ...report });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

if (PUBLIC_DIR) {
  app.use(express.static(PUBLIC_DIR));
  app.get("*", (_req, res) => res.sendFile(path.join(PUBLIC_DIR, "index.html")));
}

await ensureData();
app.listen(PORT, () => console.log(`Repertoire backend on http://localhost:${PORT}, data in ${DATA_DIR}`));
