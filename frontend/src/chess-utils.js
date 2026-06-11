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
export function enumerateLines(rep, startEpd, color, maxLines = 1000) {
  const lines = [];
  const path = [];
  const onPath = new Set([startEpd]);
  const childrenOf = (epd) => {
    const node = rep.positions[epd];
    if (!node) return [];
    const ours = sideToMove(epd) === color;
    return (node.moves || []).filter((m) => (ours ? m.mine : !m.mine));
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
