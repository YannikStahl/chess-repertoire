import { useEffect, useState } from "react";
import { api } from "./api.js";
import { engine } from "./engine.js";

const IDLE = { available: false, depth: 0, pvs: [] };

// Local Stockfish analysis of `fen` (null = paused). Returns a normalized eval
// { available, depth, pvs:[{cp?,mate?,moves}], status } with scores from
// White's perspective, matching the cloud-eval shape.
function useLocalEngine(fen, multiPv) {
  const [ev, setEv] = useState({ ...IDLE, status: engine.getStatus() });

  useEffect(() => engine.subscribeStatus((s) => setEv((p) => ({ ...p, status: s }))), []);

  useEffect(() => {
    if (!fen) {
      setEv((p) => ({ ...IDLE, status: p.status }));
      return;
    }
    const whiteToMove = fen.split(" ")[1] === "w";
    const acc = new Map();
    engine.setRequest(fen, multiPv, (info) => {
      if (info.multipv === 1) acc.clear(); // start of a fresh depth iteration
      const cp = info.cp != null ? (whiteToMove ? info.cp : -info.cp) : undefined;
      const mate = info.mate != null ? (whiteToMove ? info.mate : -info.mate) : undefined;
      acc.set(info.multipv, { cp, mate, moves: info.pv });
      const pvs = [...acc.keys()].sort((a, b) => a - b).map((k) => acc.get(k));
      setEv({ available: true, depth: info.depth, pvs, status: "ready" });
    });
    return () => engine.cancel();
  }, [fen, multiPv]);

  return ev;
}

// Lichess cloud eval of `fen` (null = paused), normalized to the same shape.
function useCloudEval(fen, multiPv) {
  const [ev, setEv] = useState(IDLE);

  useEffect(() => {
    if (!fen) {
      setEv(IDLE);
      return;
    }
    let cancelled = false;
    setEv({ ...IDLE, loading: true });
    const t = setTimeout(() => {
      api
        .cloudEval(fen, multiPv)
        .then((d) => !cancelled && setEv({ available: !!d.available, depth: d.depth || 0, pvs: d.pvs || [], unavailable: !d.available }))
        .catch(() => !cancelled && setEv({ ...IDLE, error: true }));
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [fen, multiPv]);

  return ev;
}

// Unified engine hook. Both sources are mounted; only the selected one runs
// (the other is paused with a null fen), so switching is instant.
export function useEngine(fen, multiPv, source, enabled) {
  const local = useLocalEngine(enabled && source === "local" ? fen : null, multiPv);
  const cloud = useCloudEval(enabled && source === "cloud" ? fen : null, multiPv);
  return source === "local" ? local : cloud;
}
