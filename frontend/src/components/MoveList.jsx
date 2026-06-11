import { useEffect, useRef } from "react";
import { figurine } from "../chess-utils.js";

const GLYPH = { risky: "?", blunder: "?!" };

/**
 * Scrollable move list — one full move (white + black) per row. Clicking a
 * half-move jumps the cursor there; ← / → keys also navigate (handled in App).
 *
 * props:
 *   history    – [{san, ...}]
 *   cursor     – current ply (0 = start, 1 = after white's 1st, …)
 *   qualities  – per-ply quality markers ("risky" | "blunder" | null)
 *   onGoTo(ply)
 *   onReset()
 */
export default function MoveList({ history, cursor, qualities = [], onGoTo, onReset }) {
  const curRef = useRef(null);
  useEffect(() => {
    if (curRef.current) curRef.current.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  const rows = [];
  for (let i = 0; i < history.length; i += 2) {
    rows.push({ num: i / 2 + 1, white: history[i], whitePly: i + 1, black: history[i + 1], blackPly: i + 2 });
  }

  const Cell = ({ entry, ply }) => {
    if (!entry) return <span className="ml-move ml-empty" />;
    const q = qualities[ply - 1];
    return (
      <button ref={cursor === ply ? curRef : null} className={`ml-move${cursor === ply ? " cur" : ""}`} onClick={() => onGoTo(ply)}>
        {figurine(entry.san)}
        {q && <span className={`ml-q q-${q}`}>{GLYPH[q]}</span>}
      </button>
    );
  };

  return (
    <section className="panel movelist-panel">
      <header className="panel-head">
        <h2>Moves</h2>
        {history.length > 0 && (
          <button className="ml-reset" title="Clear the move history" onClick={onReset}>
            ⟲ reset
          </button>
        )}
      </header>
      {history.length === 0 ? (
        <p className="empty">No moves yet — play one on the board.</p>
      ) : (
        <ol className="movelist">
          {rows.map((r) => (
            <li key={r.num} className="ml-row">
              <span className="ml-num">{r.num}.</span>
              <Cell entry={r.white} ply={r.whitePly} />
              <Cell entry={r.black} ply={r.blackPly} />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
