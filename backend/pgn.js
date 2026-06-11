// Export a repertoire graph as a single PGN game with recursive variations.
//
// The graph is a DAG (transpositions), but PGN is a tree, so we pick a
// spanning tree: each position is fully expanded the first time the walk
// reaches it; later arrivals emit a `{ transposes }` comment and stop.

const START_EPD = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -";

export function exportPgn(rep) {
  const positions = rep.positions || {};
  const visited = new Set();

  // ply 0 = white's first move. needNumber forces "N..." for a black move
  // at the start of a variation or after a parenthesized interruption.
  function walk(epd, ply, needNumber) {
    const node = positions[epd];
    if (!node || !node.moves || node.moves.length === 0) return [];
    if (visited.has(epd)) return ["{ transposes }"];
    visited.add(epd);

    const tokens = [];
    const whiteToMove = ply % 2 === 0;
    const moveNo = Math.floor(ply / 2) + 1;
    const [main, ...alts] = node.moves;

    if (whiteToMove) tokens.push(`${moveNo}.`);
    else if (needNumber) tokens.push(`${moveNo}...`);
    tokens.push(main.san);

    for (const alt of alts) {
      const inner = [whiteToMove ? `${moveNo}.` : `${moveNo}...`, alt.san, ...walk(alt.target, ply + 1, true)];
      tokens.push("(" + inner.join(" ") + ")");
    }

    tokens.push(...walk(main.target, ply + 1, alts.length > 0));
    return tokens;
  }

  const body = walk(START_EPD, 0, false);
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, ".");
  const header = [
    `[Event "Repertoire (${rep.color})"]`,
    `[Site "local"]`,
    `[Date "${date}"]`,
    `[White "${rep.color === "white" ? "Me" : "Opponent"}"]`,
    `[Black "${rep.color === "black" ? "Me" : "Opponent"}"]`,
    `[Result "*"]`,
  ].join("\n");

  return header + "\n\n" + wrap(body.concat("*").join(" ")) + "\n";
}

// PGN export format asks for lines of at most 80 characters.
function wrap(text, width = 80) {
  const words = text.split(" ");
  const lines = [];
  let line = "";
  for (const w of words) {
    if (line && line.length + 1 + w.length > width) {
      lines.push(line);
      line = w;
    } else {
      line = line ? line + " " + w : w;
    }
  }
  if (line) lines.push(line);
  return lines.join("\n");
}
