import { figurine } from "../chess-utils.js";

// "1.e4 c5 2.Nf3" from a flat SAN list.
function formatLine(sans) {
  return sans.map((san, i) => (i % 2 === 0 ? `${i / 2 + 1}.` : "") + figurine(san)).join(" ");
}

/**
 * Overview of unresolved conflicts (positions with more than one repertoire
 * move). Clicking one jumps the board there to resolve it.
 *
 * props:
 *   conflicts  – [{ epd, sans:[…competing SANs], line:[…SANs from start] }]
 *   currentEpd – the position currently shown (highlighted)
 *   onJump(epd)
 */
export default function ConflictList({ conflicts, currentEpd, onJump }) {
  return (
    <section className="panel conflict-panel">
      <header className="panel-head">
        <h2>Conflicts</h2>
        <span className="conflict-badge">{conflicts.length}</span>
      </header>
      <p className="conflict-hint">More than one repertoire move here — open each and remove the ones you don't want.</p>
      <ul className="conflict-list">
        {conflicts.map((c) => (
          <li key={c.epd}>
            <button className={`conflict-item${c.epd === currentEpd ? " on" : ""}`} onClick={() => onJump(c.epd)}>
              <span className="cf-line">{c.line.length ? formatLine(c.line) : "start position"}</span>
              <span className="cf-moves">
                {c.sans.map((s) => (
                  <span key={s} className="cf-move">{figurine(s)}</span>
                ))}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
