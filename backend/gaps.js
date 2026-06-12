// Gap finder: breadth-first over the repertoire tree, flagging frequent opponent
// moves (>threshold in the masters DB) whose resulting position you have no
// answer for, plus lines that end with you to play.
//
// Setup-aware: rep.setups = { [category]: ["Nf6","g6",…] }. Categories propagate
// along the search (a node carries every category tagged on it or an ancestor),
// and at your turn with nothing stored the first legal setup move counts as your
// answer — so system-opening territory isn't flagged, and the scan continues
// through it.

import { Chess } from "chess.js";

const START_EPD = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -";
const sideToMove = (epd) => (epd.split(" ")[1] === "w" ? "white" : "black");
const epdToFen = (epd) => epd + " 0 1";
const toEpd = (fen) => fen.split(" ").slice(0, 4).join(" ");

const STOP_STATUSES = new Set([401, 403, 429, 500, 502, 503, 0]);

// First legal move from any applicable category setup, or null.
function setupMoveAt(rep, epd, cats) {
  const setups = rep.setups || {};
  for (const cat of cats) {
    const sans = setups[cat];
    if (!sans || sans.length === 0) continue;
    const chess = new Chess(epdToFen(epd));
    for (const san of sans) {
      try {
        const made = chess.move(san);
        return { san: made.san, target: toEpd(chess.fen()) };
      } catch {
        // illegal / already played here — try the next listed move
      }
    }
  }
  return null;
}

export async function findGaps(rep, color, { maxPlies = 16, threshold = 0.1, minGames = 10, maxQueries = 250, masters }) {
  const gaps = [];
  const visited = new Set([START_EPD]);
  let scanned = 0;
  let unavailable = false;

  const catsFor = (parentCats, epd) => {
    const tagged = (rep.positions[epd] && rep.positions[epd].categories) || [];
    if (tagged.length === 0) return parentCats;
    const s = new Set(parentCats);
    for (const c of tagged) s.add(c);
    return s;
  };

  const queue = [{ epd: START_EPD, line: [], depth: 0, cats: catsFor(new Set(), START_EPD) }];
  const enqueue = (epd, line, depth, parentCats) => {
    if (visited.has(epd)) return;
    visited.add(epd);
    queue.push({ epd, line, depth, cats: catsFor(parentCats, epd) });
  };

  while (queue.length) {
    const node = queue.shift();
    if (node.depth >= maxPlies) continue;

    const moves = (rep.positions[node.epd] && rep.positions[node.epd].moves) || [];

    if (sideToMove(node.epd) === color) {
      const stored = moves.filter((m) => m.mine);
      if (stored.length > 0) {
        for (const m of stored) if (m.target) enqueue(m.target, [...node.line, m.san], node.depth + 1, node.cats);
      } else {
        const f = setupMoveAt(rep, node.epd, node.cats);
        if (f) enqueue(f.target, [...node.line, f.san], node.depth + 1, node.cats);
        // Incomplete line: it's our move and neither an explicit move nor a
        // setup provides one. (depth > 0 skips an empty fresh repertoire.)
        else if (node.depth > 0) gaps.push({ epd: node.epd, line: node.line, move: null, type: "mine", freq: null, games: null });
      }
      continue;
    }

    // Opponent's turn: expand stored replies, then check the masters DB.
    for (const m of moves.filter((m) => !m.mine)) {
      if (m.target) enqueue(m.target, [...node.line, m.san], node.depth + 1, node.cats);
    }
    if (unavailable || scanned >= maxQueries) continue;
    scanned++;
    let stats;
    try {
      stats = await masters(epdToFen(node.epd));
    } catch (e) {
      if (STOP_STATUSES.has(e.status)) unavailable = true; // upstream down — stop querying
      continue;
    }
    const total = (stats.white || 0) + (stats.draws || 0) + (stats.black || 0);
    if (total === 0 || !Array.isArray(stats.moves)) continue;
    for (const mm of stats.moves) {
      const games = (mm.white || 0) + (mm.draws || 0) + (mm.black || 0);
      const freq = games / total;
      // Sideline filter: rare in absolute terms (< minGames) is not a gap.
      if (games < minGames || freq <= threshold) continue;
      if (moves.some((x) => x.san === mm.san)) continue; // stored reply — expanded above
      // Frequent move with no stored reply edge: is the resulting position
      // still answered (explicit move there via transposition, or a setup)?
      let target;
      try {
        const ch = new Chess(epdToFen(node.epd));
        ch.move(mm.san);
        target = toEpd(ch.fen());
      } catch {
        continue;
      }
      const targetCats = catsFor(node.cats, target);
      const answered =
        ((rep.positions[target] && rep.positions[target].moves) || []).some((m) => m.mine) ||
        !!setupMoveAt(rep, target, targetCats);
      if (answered) enqueue(target, [...node.line, mm.san], node.depth + 1, node.cats);
      else gaps.push({ epd: node.epd, line: node.line, move: mm.san, type: "reply", freq: Math.round(freq * 1000) / 10, games });
    }
  }

  // Default order: shallowest first, then most frequent (UI offers re-sorting).
  gaps.sort((a, b) => a.line.length - b.line.length || (b.freq ?? 0) - (a.freq ?? 0));
  return { gaps, scanned, unavailable };
}
