import { Chess } from "chess.js";
import { figurine } from "../chess-utils.js";

/**
 * Top engine lines for the current position. Presentational: takes a normalized
 * eval `ev` (from useEngine) with pv scores from White's perspective. Clicking a
 * line plays its first move.
 *
 * props:
 *   fen, ev, source ("local" | "cloud")
 *   onPlaySan(san), inRepertoire(san)
 */
export default function EngineSuggestions({ fen, ev, source, onPlaySan, inRepertoire }) {
  const lines = ev && ev.available && ev.pvs ? ev.pvs.map((pv) => describe(pv, fen)).filter(Boolean) : [];

  return (
    <section className="panel">
      <header className="panel-head">
        <h2>Engine</h2>
        {ev && ev.available ? (
          <span className="muted">{source === "local" ? "Stockfish 18 · " : "cloud · "}depth {ev.depth}</span>
        ) : (
          <span className="muted">{source === "local" ? "Stockfish 18 (local)" : "cloud"}</span>
        )}
      </header>
      {lines.length === 0 && <p className="empty">{statusMessage(ev, source)}</p>}
      {lines.length > 0 && (
        <table className="explorer-table">
          <tbody>
            {lines.map((line, i) => (
              <tr key={i} className={inRepertoire(line.firstSan) ? "in-rep" : ""} onClick={() => onPlaySan(line.firstSan)}>
                <td className={`eng-score ${line.cls}`}>{line.score}</td>
                <td className="eng-line">{line.sans.map(figurine).join(" ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function statusMessage(ev, source) {
  if (source === "local") {
    if (!ev || ev.status === "loading" || ev.status === "idle") return "Starting Stockfish 18 (downloads ~7 MB once)…";
    if (ev.status === "error") return "Local engine failed to load. Switch to Cloud eval in the toolbar.";
    return "Analyzing…";
  }
  if (ev && ev.loading) return "Fetching cloud analysis…";
  if (ev && ev.error) return "Engine unreachable (offline?)";
  return "No cloud analysis for this position.";
}

// Convert one PV into a display row. cp/mate are already from White's view.
function describe(pv, fen) {
  if (!pv.moves) return null;
  const chess = new Chess(fen);
  const sans = [];
  for (const uci of pv.moves.split(" ").slice(0, 6)) {
    let mv;
    try {
      mv = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.slice(4) || undefined });
    } catch {
      break;
    }
    if (!mv) break;
    sans.push(mv.san);
  }
  if (sans.length === 0) return null;

  let score, cls;
  if (pv.mate !== undefined) {
    score = `M${Math.abs(pv.mate)}`;
    cls = pv.mate > 0 ? "pos" : "neg";
  } else {
    const sign = pv.cp >= 0 ? "+" : "−";
    score = sign + Math.abs(pv.cp / 100).toFixed(2);
    cls = pv.cp >= 0 ? "pos" : "neg";
  }
  return { score, cls, sans, firstSan: sans[0] };
}
