import { useEffect, useState } from "react";
import { api } from "../api.js";
import { figurine } from "../chess-utils.js";

export default function Explorer({ fen, onPlaySan, inRepertoire }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(false);
    const t = setTimeout(() => {
      api
        .explorer(fen)
        .then((d) => !cancelled && setData(d))
        .catch(() => !cancelled && setError(true));
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [fen, reload]);

  // The proxy reports an upstream problem as { unavailable: true, status }.
  const unavailable = error || (data && data.unavailable);
  const total = data && !data.unavailable ? data.white + data.draws + data.black : 0;

  return (
    <section className="panel explorer">
      <header className="panel-head">
        <h2>Masters database</h2>
        {total > 0 && <span className="muted">{total.toLocaleString()} games</span>}
        {unavailable && (
          <button className="ml-reset" title="Try again" onClick={() => setReload((n) => n + 1)}>
            ⟲ retry
          </button>
        )}
      </header>
      {unavailable && (
        <p className="empty">
          {data && data.status === 0
            ? "Can’t reach Lichess — check your connection."
            : data && (data.status === 401 || data.status === 403)
            ? "Lichess now requires a (free) API token for the opening explorer. Create one at lichess.org/account/oauth/token (no scopes needed) and start the backend with LICHESS_TOKEN=<token>."
            : `Masters database is temporarily unavailable${data && data.status ? ` (Lichess returned ${data.status})` : ""}. It will reappear automatically.`}
        </p>
      )}
      {!unavailable && data && data.moves && data.moves.length === 0 && (
        <p className="empty">No master games from here — you're out of book.</p>
      )}
      {!unavailable && data && data.moves && data.moves.length > 0 && (
        <table className="explorer-table">
          <tbody>
            {data.moves.map((m) => {
              const n = m.white + m.draws + m.black;
              const w = (m.white / n) * 100;
              const d = (m.draws / n) * 100;
              return (
                <tr key={m.san} className={inRepertoire(m.san) ? "in-rep" : ""} onClick={() => onPlaySan(m.san)}>
                  <td className="ex-move">{figurine(m.san)}</td>
                  <td className="ex-games">{n.toLocaleString()}</td>
                  <td className="ex-bar">
                    <div className="score-bar">
                      <div className="sb-w" style={{ width: `${w}%` }} />
                      <div className="sb-d" style={{ width: `${d}%` }} />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
