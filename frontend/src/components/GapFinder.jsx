import { useMemo, useState } from "react";
import { api } from "../api.js";
import { figurine } from "../chess-utils.js";

const SORTS = {
  depth: { label: "Move number", fn: (a, b) => a.line.length - b.line.length || (b.freq ?? -1) - (a.freq ?? -1) },
  freq: { label: "Popularity %", fn: (a, b) => (b.freq ?? -1) - (a.freq ?? -1) },
  games: { label: "Games", fn: (a, b) => (b.games ?? -1) - (a.games ?? -1) },
};

const EMPTY_GAPS = [];

function formatLine(sans) {
  return sans.map((san, i) => (i % 2 === 0 ? `${i / 2 + 1}.` : "") + figurine(san)).join(" ");
}

/**
 * On-demand scan for repertoire gaps: frequent opponent moves (>10% in the
 * masters DB) you have no stored reply for. Clicking a result jumps there.
 *
 * props: color, onJump(epd)
 */
export default function GapFinder({ color, onJump }) {
  const [moves, setMoves] = useState(8);
  const [minGames, setMinGames] = useState(10);
  const [sort, setSort] = useState("depth");
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(false);

  const sorted = useMemo(
    () => (result && result.gaps ? [...result.gaps].sort(SORTS[sort].fn) : EMPTY_GAPS),
    [result, sort]
  );

  async function scan() {
    setScanning(true);
    setError(false);
    setResult(null);
    try {
      setResult(await api.findGaps(color, moves, Math.max(0, minGames || 0)));
    } catch {
      setError(true);
    }
    setScanning(false);
  }

  return (
    <section className="panel gap-panel">
      <header className="panel-head">
        <h2>Gaps</h2>
        {result && !result.unavailable && <span className="muted">{result.gaps.length}</span>}
      </header>
      <p className="conflict-hint">Opponent moves over 10% in the masters DB that you have no reply for, plus lines that end with you to play. Moves with fewer than the cutoff number of games are ignored as sidelines.</p>
      <div className="gap-controls">
        <label className="gap-depth">
          Depth
          <select value={moves} onChange={(e) => setMoves(+e.target.value)} disabled={scanning}>
            {Array.from({ length: 16 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>{m} {m === 1 ? "move" : "moves"}</option>
            ))}
          </select>
        </label>
        <label className="gap-depth">
          Min games
          <input
            className="gap-mingames"
            type="number"
            min="0"
            value={minGames}
            onChange={(e) => setMinGames(e.target.value === "" ? "" : +e.target.value)}
            disabled={scanning}
          />
        </label>
        <label className="gap-depth">
          Sort
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            {Object.entries(SORTS).map(([k, s]) => (
              <option key={k} value={k}>{s.label}</option>
            ))}
          </select>
        </label>
        <button className="cat-btn" onClick={scan} disabled={scanning}>
          {scanning ? "Scanning…" : "Scan"}
        </button>
      </div>

      {error && <p className="empty add-game-error">Scan failed.</p>}
      {result && result.unavailable && (
        <p className="empty">Masters database unavailable — if this persists, set LICHESS_TOKEN on the backend (Lichess now requires login for the explorer).</p>
      )}
      {result && !result.unavailable && result.gaps.length === 0 && (
        <p className="empty">No gaps found in the first {moves} moves. 🎉</p>
      )}
      {sorted.length > 0 && (
        <ul className="gap-list">
          {sorted.map((g, i) => (
            <li key={i}>
              <button className="conflict-item" onClick={() => onJump(g.epd)} title="Jump to this position">
                <span className="cf-line">{g.line.length ? formatLine(g.line) : "start"}</span>
                {g.type === "mine" ? (
                  <span className="gap-move-row">
                    <span className="cf-move gap-mine">your move?</span>
                  </span>
                ) : (
                  <span className="gap-move-row">
                    <span className="cf-move">{figurine(g.move)}</span>
                    <span className="gap-freq">{g.freq}% · {g.games.toLocaleString()}g</span>
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
