// Local Stockfish (SF11, single-threaded WASM) running in a Web Worker.
// One shared worker analyses the current position; requests supersede each
// other (we stop the running search before starting the next). UCI scores are
// from the side to move; callers convert to White's perspective.

const WORKER_URL = "/engine/stockfish.js";

let worker = null;
let status = "idle"; // idle | loading | ready | error
let ready = false;
let searching = false;
let acceptInfo = false;
let activeCb = null;
let pending = null; // { fen, multiPv, cb }
const statusSubs = new Set();

function setStatus(s) {
  if (s === status) return;
  status = s;
  for (const fn of statusSubs) fn(s);
}

function ensureWorker() {
  if (worker || status === "error") return;
  try {
    worker = new Worker(WORKER_URL);
  } catch {
    setStatus("error");
    return;
  }
  worker.onmessage = (e) => handleLine(typeof e.data === "string" ? e.data : (e.data && e.data.data) || "");
  worker.onerror = () => setStatus("error");
  setStatus("loading");
  post("uci");
}

function post(cmd) {
  if (worker) worker.postMessage(cmd);
}

function handleLine(line) {
  if (typeof line !== "string") return;
  if (line === "uciok") {
    post("setoption name Hash value 64");
    post("isready");
  } else if (line === "readyok") {
    if (!ready) {
      ready = true;
      setStatus("ready");
    }
    drain();
  } else if (line.startsWith("bestmove")) {
    searching = false;
    acceptInfo = false;
    activeCb = null;
    drain();
  } else if (acceptInfo && activeCb && line.startsWith("info ") && line.includes(" pv ")) {
    const info = parseInfo(line);
    if (info) activeCb(info);
  }
}

function drain() {
  if (!ready || searching || !pending) return;
  const { fen, multiPv, cb } = pending;
  pending = null;
  searching = true;
  activeCb = cb;
  post(`setoption name MultiPV value ${multiPv}`);
  post(`position fen ${fen}`);
  post("go depth 24");
  acceptInfo = true;
}

function parseInfo(line) {
  const t = line.split(/\s+/);
  let depth, multipv = 1, cp, mate, pv;
  for (let k = 0; k < t.length; k++) {
    const w = t[k];
    if (w === "depth") depth = +t[k + 1];
    else if (w === "multipv") multipv = +t[k + 1];
    else if (w === "score") {
      if (t[k + 1] === "cp") cp = +t[k + 2];
      else if (t[k + 1] === "mate") mate = +t[k + 2];
    } else if (w === "pv") {
      pv = t.slice(k + 1).join(" ");
      break;
    }
  }
  if (pv === undefined || depth === undefined) return null;
  return { depth, multipv, cp, mate, pv };
}

export const engine = {
  getStatus: () => status,
  subscribeStatus(fn) {
    statusSubs.add(fn);
    return () => statusSubs.delete(fn);
  },
  // Analyse `fen`, streaming info via `onInfo({depth, multipv, cp, mate, pv})`.
  setRequest(fen, multiPv, onInfo) {
    ensureWorker();
    pending = { fen, multiPv, cb: onInfo };
    if (searching) {
      acceptInfo = false; // ignore the tail of the search we're cancelling
      post("stop");
    } else {
      drain();
    }
  },
  cancel() {
    pending = null;
    activeCb = null;
    if (searching) {
      acceptInfo = false;
      post("stop");
    }
  },
};
