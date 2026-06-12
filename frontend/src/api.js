async function json(res) {
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

export const api = {
  getRepertoire: (color) => fetch(`/api/repertoire/${color}`).then(json),
  saveRepertoire: (color, rep) =>
    fetch(`/api/repertoire/${color}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(rep),
    }).then(json),
  getTraining: () => fetch("/api/training").then(json),
  saveTraining: (t) =>
    fetch("/api/training", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(t),
    }).then(json),
  getGames: () => fetch("/api/games").then(json),
  saveGames: (g) =>
    fetch("/api/games", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(g),
    }).then(json),
  commit: (message) =>
    fetch("/api/git/commit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    }).then(json),
  explorer: (fen) => fetch(`/api/explorer?fen=${encodeURIComponent(fen)}`).then(json),
  findGaps: (color, moves, minGames) => fetch(`/api/gaps/${color}?moves=${moves}&minGames=${minGames}`).then(json),
  cloudEval: (fen, multiPv = 1) =>
    fetch(`/api/eval?fen=${encodeURIComponent(fen)}&multiPv=${multiPv}`).then(json),
  importPgn: (color, pgn) =>
    fetch(`/api/import/${color}`, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: pgn,
    }).then(json),
};
