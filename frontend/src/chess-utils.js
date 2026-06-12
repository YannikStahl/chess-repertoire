import { Chess } from "chess.js";

export const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
export const START_EPD = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -";

// Transposition key: drop halfmove clock + fullmove number.
export const toEpd = (fen) => fen.split(" ").slice(0, 4).join(" ");
export const epdToFen = (epd) => epd + " 0 1";
export const sideToMove = (epdOrFen) => (epdOrFen.split(" ")[1] === "w" ? "white" : "black");

// Figurine algebraic notation — uppercase letters in SAN are always pieces
// (squares are lowercase), so a straight replacement is safe. Castling "O" excluded.
const FIGURINES = { K: "\u2654", Q: "\u2655", R: "\u2656", B: "\u2657", N: "\u2658" };
export const figurine = (san) => san.replace(/[KQRBN]/g, (c) => FIGURINES[c]);

// --- Categories ---
// A category is inherited: tagging a position puts every position reachable
// from it (following repertoire move edges) into that category too. Returns a
// Map<categoryName, Set<epd>> of effective membership. The visited set per
// category makes transposition cycles safe.
export function categoryMembership(rep) {
  const roots = new Map(); // category -> [epd, …] explicitly tagged
  for (const [epd, node] of Object.entries(rep.positions)) {
    for (const c of node.categories || []) {
      if (!roots.has(c)) roots.set(c, []);
      roots.get(c).push(epd);
    }
  }
  const members = new Map();
  for (const [c, rootEpds] of roots) {
    const seen = new Set();
    const stack = [...rootEpds];
    while (stack.length) {
      const e = stack.pop();
      if (seen.has(e)) continue;
      seen.add(e);
      const node = rep.positions[e];
      for (const m of (node && node.moves) || []) {
        if (m.target && !seen.has(m.target)) stack.push(m.target);
      }
    }
    members.set(c, seen);
  }
  return members;
}

// --- Setups (system openings) ---
// rep.setups = { [category]: ["Nf6","g6","Bg7",…] } — an ordered scheme of your
// moves attached to a category. Wherever it's your turn inside that category and
// no explicit move is stored, the first *legal* listed move is your repertoire
// answer. Explicitly stored moves always win, so exceptions are just normal
// stored lines.
export function setupMoveFromCats(rep, epd, cats) {
  if (sideToMove(epd) !== rep.color) return null;
  const setups = rep.setups || {};
  for (const cat of cats) {
    const sans = setups[cat];
    if (!sans || sans.length === 0) continue;
    const chess = new Chess(epdToFen(epd));
    for (const san of sans) {
      try {
        const made = chess.move(san);
        return { san: made.san, uci: made.from + made.to + (made.promotion || ""), target: toEpd(chess.fen()), mine: true, setup: cat };
      } catch {
        // not legal here (or already played) — try the next listed move
      }
    }
  }
  return null;
}

// Same, but resolving applicable categories via inherited membership.
export function setupMoveFor(rep, epd, categoryMembers) {
  const cats = [];
  for (const c of Object.keys(rep.setups || {})) if (categoryMembers.get(c)?.has(epd)) cats.push(c);
  return cats.length ? setupMoveFromCats(rep, epd, cats) : null;
}

// Find stored "mine" edges that are pure setup-following: the move equals the
// setup's choice at that position, and nothing downstream contains anything
// worth keeping (annotations, category tags, exceptions, quality/main flags,
// conflicts). Returns [{ epd, san }] — safe to remove and prune.
export function findRedundantSetupEdges(rep) {
  if (!rep.setups || Object.keys(rep.setups).length === 0) return [];

  // Inherited categories per position (union over all stored paths).
  const cats = new Map([[START_EPD, new Set(rep.positions[START_EPD]?.categories || [])]]);
  const queue = [START_EPD];
  while (queue.length) {
    const epd = queue.shift();
    const cur = cats.get(epd);
    for (const m of rep.positions[epd]?.moves || []) {
      if (!m.target || !rep.positions[m.target]) continue;
      const merged = new Set(cur);
      for (const c of rep.positions[m.target].categories || []) merged.add(c);
      const existing = cats.get(m.target);
      if (!existing) {
        cats.set(m.target, merged);
        queue.push(m.target);
      } else {
        let grew = false;
        for (const c of merged) if (!existing.has(c)) { existing.add(c); grew = true; }
        if (grew) queue.push(m.target);
      }
    }
  }

  const boringMemo = new Map();
  function boring(epd, stack) {
    if (!rep.positions[epd]) return true; // off-graph
    if (stack.has(epd)) return true; // transposition cycle within this check
    if (boringMemo.has(epd)) return boringMemo.get(epd);
    const node = rep.positions[epd];
    let ok = !node.annotation && !(node.categories || []).length;
    if (ok) {
      stack.add(epd);
      const ours = sideToMove(epd) === rep.color;
      for (const m of node.moves || []) {
        if (m.quality || m.main || m.conflict) { ok = false; break; }
        if (ours && m.mine) {
          const f = setupMoveFromCats(rep, epd, [...(cats.get(epd) || [])]);
          if (!f || f.san !== m.san) { ok = false; break; } // exception — keep
        }
        if (!boring(m.target, stack)) { ok = false; break; }
      }
      stack.delete(epd);
    }
    boringMemo.set(epd, ok);
    return ok;
  }

  const out = [];
  for (const [epd, cset] of cats) {
    if (sideToMove(epd) !== rep.color) continue;
    const node = rep.positions[epd];
    if (!node) continue;
    const mine = (node.moves || []).filter((m) => m.mine);
    if (mine.length !== 1) continue; // conflicted positions: resolve manually
    const m = mine[0];
    if (m.quality || m.main || m.conflict) continue;
    const f = setupMoveFromCats(rep, epd, [...cset]);
    if (!f || f.san !== m.san) continue;
    if (!boring(m.target, new Set())) continue;
    out.push({ epd, san: m.san });
  }
  return out;
}

// The starting position to drill for a category: the explicitly tagged position
// nearest the start (or the game start when no category is selected).
export function categoryRoot(rep, category) {
  if (!category) return START_EPD;
  const seen = new Set([START_EPD]);
  const queue = [START_EPD];
  while (queue.length) {
    const e = queue.shift();
    const node = rep.positions[e];
    if (node && (node.categories || []).includes(category)) return e;
    for (const m of (node && node.moves) || []) {
      if (m.target && !seen.has(m.target)) {
        seen.add(m.target);
        queue.push(m.target);
      }
    }
  }
  return START_EPD;
}

// Every root-to-leaf line from `startEpd`: at our turn we follow our repertoire
// moves, at the opponent's turn we follow their expected replies. Each line is an
// array of move objects. Cycles (transpositions) end a line; `maxLines` caps the
// combinatorial fan-out on large trees.
export function enumerateLines(rep, startEpd, color, maxLines = 1000, fallback = null) {
  const lines = [];
  const path = [];
  const onPath = new Set([startEpd]);
  const childrenOf = (epd) => {
    const node = rep.positions[epd];
    const ours = sideToMove(epd) === color;
    const stored = ((node && node.moves) || []).filter((m) => (ours ? m.mine : !m.mine));
    // At our turn with nothing stored, a setup (fallback) move continues the line.
    if (ours && stored.length === 0 && fallback) {
      const f = fallback(epd);
      if (f) return [f];
    }
    return stored;
  };
  const dfs = (epd) => {
    if (lines.length >= maxLines) return;
    const kids = childrenOf(epd);
    if (kids.length === 0) {
      if (path.length) lines.push(path.slice());
      return;
    }
    for (const m of kids) {
      if (onPath.has(m.target)) {
        if (path.length) lines.push(path.slice());
        continue;
      }
      onPath.add(m.target);
      path.push(m);
      dfs(m.target);
      path.pop();
      onPath.delete(m.target);
    }
  };
  dfs(startEpd);
  return lines;
}

// --- Spaced repetition (simplified SM-2) ---
const today = () => new Date().toISOString().slice(0, 10);

export const newSrsItem = () => ({ ease: 2.5, interval: 0, due: today(), reps: 0, lapses: 0 });

export const isDue = (item) => item.due <= today();

export function gradeSrs(item, correct) {
  const next = { ...item };
  if (correct) {
    next.reps += 1;
    next.interval = next.interval === 0 ? 1 : next.interval === 1 ? 3 : Math.round(next.interval * next.ease);
    next.ease = Math.min(3.0, next.ease + 0.05);
  } else {
    next.lapses += 1;
    next.interval = 0;
    next.ease = Math.max(1.3, next.ease - 0.2);
  }
  const d = new Date();
  d.setDate(d.getDate() + next.interval);
  next.due = d.toISOString().slice(0, 10);
  return next;
}
