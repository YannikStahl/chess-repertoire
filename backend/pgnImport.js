// Import PGN (with nested variations, multi-chapter studies, and custom start
// positions) and merge it into a repertoire graph.
//
// Import is a graph merge, not a parse: for every move we either create a new
// edge or find it already present. If the imported PGN recommends a *different*
// move than the repertoire at a position where it's our turn, neither move is
// discarded — both edges are kept and flagged `conflict` for manual resolution.
//
// Lichess studies export every chapter as a separate game, often with a
// `[FEN]` header (the chapter's starting position) and move-quality glyphs
// (e.g. `exd5!`, `Nc3??`). We split per game, honour each game's start FEN,
// and read glyphs into the move `quality` field. A move annotated as weak
// (anything with `?`) is not treated as one of *your* repertoire moves, so
// importing a study full of annotated sidelines doesn't create conflict spam.

import { Chess } from "chess.js";

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

const toEpd = (fen) => fen.split(" ").slice(0, 4).join(" ");

// Split a (possibly multi-game) PGN into individual games. A new game begins
// at a header line that follows movetext.
function splitGames(pgn) {
  const games = [];
  let headers = [];
  let moves = [];
  let sawMoves = false;
  const flush = () => {
    if (headers.length || moves.some((l) => l.trim())) games.push({ headers, moves });
    headers = [];
    moves = [];
    sawMoves = false;
  };
  for (const line of pgn.split(/\r?\n/)) {
    if (/^\s*\[/.test(line)) {
      if (sawMoves) flush();
      headers.push(line);
    } else {
      if (line.trim()) sawMoves = true;
      moves.push(line);
    }
  }
  flush();
  return games;
}

function header(headers, name) {
  const re = new RegExp(`^\\s*\\[${name}\\s+"([^"]*)"\\]`, "i");
  for (const h of headers) {
    const m = h.match(re);
    if (m) return m[1];
  }
  return null;
}

// Tokenizer: strip comments / NAGs / move numbers / results; keep SAN tokens
// (with any trailing !/? glyph) and variation parentheses. Comments are removed
// first, so parentheses or move-like text inside `{…}` never reach the parser.
function tokenize(movetext) {
  const noComments = movetext.replace(/\{[^}]*\}/g, " ").replace(/;[^\n]*/g, " ");
  const raw = noComments.replace(/([()])/g, " $1 ").split(/\s+/).filter(Boolean);
  const skip = /^(\$\d+|\d+\.+|1-0|0-1|1\/2-1\/2|\*)$/;
  return raw.filter((t) => !skip.test(t)).map((t) => t.replace(/^\d+\.+/, "")).filter(Boolean);
}

// Separate a SAN token from its trailing annotation glyph (!, ?, !?, ??, …).
// Maps the glyph to a quality marker and whether the move is a weak sideline.
function readGlyph(token) {
  const g = (token.match(/[!?]+$/) || [""])[0];
  const san = g ? token.slice(0, -g.length) : token;
  let quality = null;
  if (g.includes("??")) quality = "blunder";
  else if (g.includes("?")) quality = "risky";
  return { san, quality, weak: g.includes("?") };
}

export function importPgn(rep, pgnText) {
  const report = { addedMoves: 0, newPositions: 0, conflicts: [], chapters: 0, skipped: [] };

  function ensureNode(epd) {
    if (!rep.positions[epd]) {
      rep.positions[epd] = { annotation: "", moves: [] };
      report.newPositions++;
    }
    return rep.positions[epd];
  }

  function addEdge(fromEpd, move) {
    const node = ensureNode(fromEpd);
    const existing = node.moves.find((m) => m.san === move.san);
    if (existing) {
      if (move.quality && !existing.quality) existing.quality = move.quality;
      return existing;
    }
    node.moves.push(move);
    report.addedMoves++;
    if (move.mine) {
      const otherMine = node.moves.filter((m) => m.mine && m.san !== move.san);
      if (otherMine.length > 0) {
        for (const m of node.moves.filter((x) => x.mine)) m.conflict = true;
        report.conflicts.push({ epd: fromEpd, moves: node.moves.filter((m) => m.mine).map((m) => m.san) });
      }
    }
    return move;
  }

  // Replay one game's tokens, recursing into variations. `i` is local per game.
  function parseGame(startFen, tokens) {
    let i = 0;
    function parseSequence(fen) {
      const chess = new Chess(fen);
      let prevFen = fen; // position before the most recent move (variation anchor)
      while (i < tokens.length) {
        const tok = tokens[i];
        if (tok === "(") {
          i++;
          parseSequence(prevFen); // variation replaces the last move
        } else if (tok === ")") {
          i++;
          return;
        } else {
          i++;
          const { san, quality, weak } = readGlyph(tok);
          let made;
          try {
            prevFen = chess.fen();
            made = chess.move(san);
          } catch {
            throw new Error(`Illegal or unreadable move "${tok}" at ${prevFen}`);
          }
          const fromEpd = toEpd(prevFen);
          const targetEpd = toEpd(chess.fen());
          const moverIsMe = (made.color === "w" ? "white" : "black") === rep.color;
          ensureNode(targetEpd);
          const move = {
            san: made.san,
            uci: made.from + made.to + (made.promotion || ""),
            target: targetEpd,
            mine: moverIsMe && !weak,
          };
          if (quality) move.quality = quality;
          addEdge(fromEpd, move);
        }
      }
    }
    parseSequence(startFen);
  }

  for (const g of splitGames(pgnText)) {
    const tokens = tokenize(g.moves.join("\n"));
    if (tokens.length === 0) continue; // header-only / empty chapter
    report.chapters++;
    const startFen = header(g.headers, "FEN") || START_FEN;
    try {
      parseGame(startFen, tokens);
    } catch (e) {
      // Skip an unreadable chapter (e.g. a non-standard variant or bad FEN)
      // but keep importing the rest.
      const name = header(g.headers, "ChapterName") || header(g.headers, "Event") || `chapter ${report.chapters}`;
      report.skipped.push({ chapter: name, error: e.message });
    }
  }

  if (report.chapters === 0) throw new Error("No games found in PGN");
  return report;
}
