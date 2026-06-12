import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Chess } from "chess.js";
import Board from "./components/Board.jsx";
import EvalBar from "./components/EvalBar.jsx";
import Panel from "./components/Panel.jsx";
import Explorer from "./components/Explorer.jsx";
import EngineSuggestions from "./components/EngineSuggestions.jsx";
import MoveList from "./components/MoveList.jsx";
import CategoryList from "./components/CategoryList.jsx";
import ConflictList from "./components/ConflictList.jsx";
import GamesView from "./components/GamesView.jsx";
import GapFinder from "./components/GapFinder.jsx";
import Drill from "./components/Drill.jsx";
import { api } from "./api.js";
import { useEngine } from "./useEngine.js";
import { START_FEN, START_EPD, toEpd, sideToMove, categoryMembership, setupMoveFromCats } from "./chess-utils.js";

const EMPTY = []; // stable empty-shapes reference, so toggling off doesn't churn the board

// Move-quality glyphs shown on the board (fills mirror --warn / --danger in styles.css).
const QUALITY_GLYPH = { risky: "?", blunder: "?!" };
const QUALITY_FILL = { risky: "#e0913c", blunder: "#e2574a" };

export default function App() {
  const [color, setColor] = useState("white");
  const [rep, setRep] = useState(null);
  const [training, setTraining] = useState(null);
  const [mode, setMode] = useState("edit");
  const [showArrows, setShowArrows] = useState(true);
  const [showEngine, setShowEngine] = useState(true);
  const [engineSource, setEngineSource] = useState("local"); // "local" (Stockfish) | "cloud" (Lichess)
  const [history, setHistory] = useState([]); // [{san, fen, from, to, uci}] — full line, never auto-truncated
  const [cursor, setCursor] = useState(0); // ply currently shown (0 = start); navigating only moves this, not history
  const [saveState, setSaveState] = useState("saved");
  const [toast, setToast] = useState("");

  const fen = cursor > 0 ? history[cursor - 1].fen : START_FEN;
  const epd = toEpd(fen);
  const lastMove = cursor > 0 ? [history[cursor - 1].from, history[cursor - 1].to] : null;
  const node = rep ? rep.positions[epd] : undefined;

  // Engine analysis of the current edit position (local Stockfish or cloud).
  const engineEv = useEngine(fen, 5, engineSource, showEngine && mode === "edit");

  // The move leading to the current position, if it isn't in the repertoire yet.
  // Derived (not state) so it stays correct while navigating the history.
  const prevFen = cursor > 1 ? history[cursor - 2].fen : START_FEN;
  const pending =
    cursor > 0 && rep && !moveStored(rep, toEpd(prevFen), history[cursor - 1].san) ? { san: history[cursor - 1].san } : null;
  // The move that led here, when it *is* already stored — offer to remove it.
  const lastStored = cursor > 0 && rep && !pending ? history[cursor - 1].san : null;

  // Quality marker for each played move (parallel to history), for the move list.
  const moveQualities = useMemo(() => {
    if (!rep) return EMPTY;
    let prev = START_FEN;
    return history.map((h) => {
      const m = rep.positions[toEpd(prev)]?.moves.find((x) => x.san === h.san);
      prev = h.fen;
      return (m && m.quality) || null;
    });
  }, [rep, history]);

  // Categories accumulated along the played line (tag at START or any ancestor).
  // Line-based rather than membership-based so setups apply even when the board
  // has left the stored graph (e.g. an opponent reply you haven't stored yet).
  const lineCats = useMemo(() => {
    if (!rep) return EMPTY;
    const cats = new Set(rep.positions[START_EPD]?.categories || []);
    for (let i = 0; i < cursor; i++) {
      for (const c of rep.positions[toEpd(history[i].fen)]?.categories || []) cats.add(c);
    }
    return [...cats];
  }, [rep, history, cursor]);

  // The setup's suggested move here, when nothing explicit is stored.
  const setupMove = useMemo(() => {
    if (!rep || lineCats.length === 0) return null;
    if (node && node.moves.some((m) => m.mine)) return null;
    return setupMoveFromCats(rep, epd, lineCats);
  }, [rep, node, epd, lineCats]);

  // Main-line state of the current line's stored edges: none | partial | all.
  const lineMainState = useMemo(() => {
    if (!rep || cursor === 0) return "none";
    let total = 0, main = 0, prev = START_FEN;
    for (let i = 0; i < cursor; i++) {
      const m = rep.positions[toEpd(prev)]?.moves.find((x) => x.san === history[i].san);
      if (m) { total++; if (m.main) main++; }
      prev = history[i].fen;
    }
    return total === 0 ? "none" : main === total ? "all" : main > 0 ? "partial" : "none";
  }, [rep, history, cursor]);

  // Per-ply main flags for the move list (parallel to history).
  const moveMains = useMemo(() => {
    if (!rep) return EMPTY;
    let prev = START_FEN;
    return history.map((h) => {
      const m = rep.positions[toEpd(prev)]?.moves.find((x) => x.san === h.san);
      prev = h.fen;
      return !!(m && m.main);
    });
  }, [rep, history]);

  // The last played move and its stored quality marker (risky / blunder).
  const lastMoveSan = cursor > 0 ? history[cursor - 1].san : null;
  const lastMoveStored = lastMoveSan && rep ? rep.positions[toEpd(prevFen)]?.moves.find((m) => m.san === lastMoveSan) : null;
  const lastQuality = (lastMoveStored && lastMoveStored.quality) || null;

  // Stored moves drawn as arrows: gold for your repertoire moves, blue for
  // expected replies. Gated by the Arrows toggle.
  const arrows = useMemo(
    () =>
      node
        ? node.moves.map((m) => ({ orig: m.uci.slice(0, 2), dest: m.uci.slice(2, 4), brush: m.mine ? "mine" : "rep" }))
        : EMPTY,
    [node]
  );
  // A glyph badge on the square the last move landed on (independent of the arrows toggle).
  const lastTo = cursor > 0 ? history[cursor - 1].to : null;
  const glyphShapes = useMemo(
    () => (lastTo && lastQuality ? [{ orig: lastTo, label: { text: QUALITY_GLYPH[lastQuality], fill: QUALITY_FILL[lastQuality] } }] : EMPTY),
    [lastTo, lastQuality]
  );
  const boardShapes = useMemo(
    () => (showArrows ? arrows : EMPTY).concat(glyphShapes),
    [showArrows, arrows, glyphShapes]
  );

  // --- load data ---
  useEffect(() => {
    api.getRepertoire(color).then(setRep);
    setHistory([]);
    setCursor(0);
  }, [color]);

  useEffect(() => {
    api.getTraining().then(setTraining);
  }, []);

  // --- ← / → navigate the move list (ignored while typing) ---
  useEffect(() => {
    if (mode !== "edit") return;
    function onKey(e) {
      const t = e.target;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.key === "ArrowLeft") {
        setCursor((c) => Math.max(0, c - 1));
        e.preventDefault();
      } else if (e.key === "ArrowRight") {
        setCursor((c) => Math.min(history.length, c + 1));
        e.preventDefault();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, history.length]);

  // --- debounced autosave ---
  const saveTimer = useRef(null);
  const mutateRep = useCallback(
    (fn) => {
      setRep((prev) => {
        const next = structuredClone(prev);
        fn(next);
        setSaveState("saving");
        clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => {
          api.saveRepertoire(next.color, next).then(() => setSaveState("saved")).catch(() => setSaveState("error"));
        }, 800);
        return next;
      });
    },
    []
  );

  const trainTimer = useRef(null);
  const onGrade = useCallback((key, item) => {
    setTraining((prev) => {
      const next = structuredClone(prev);
      next.items[key] = item;
      clearTimeout(trainTimer.current);
      trainTimer.current = setTimeout(() => api.saveTraining(next).catch(() => {}), 800);
      return next;
    });
  }, []);

  // --- board interaction (edit mode) ---
  function applyMove(moveArg) {
    const chess = new Chess(fen);
    let made;
    try {
      made = chess.move(moveArg);
    } catch {
      return;
    }
    // If this exact move already continues the line from here, just step forward
    // (keeps the rest of the history intact); otherwise it branches.
    const next = history[cursor];
    if (next && next.san === made.san) {
      setCursor(cursor + 1);
      return;
    }
    const entry = { san: made.san, fen: chess.fen(), from: made.from, to: made.to, uci: made.from + made.to + (made.promotion || "") };
    setHistory((h) => [...h.slice(0, cursor), entry]);
    setCursor(cursor + 1);
  }

  // Store the whole line from the start up to the current position, adding any
  // move along the way that isn't in the repertoire yet (not just the last one).
  function storeLine() {
    mutateRep((r) => {
      let prev = START_FEN;
      for (let i = 0; i < cursor; i++) {
        const h = history[i];
        const fromEpd = toEpd(prev);
        const target = toEpd(h.fen);
        const mine = sideToMove(fromEpd) === r.color;
        if (!r.positions[fromEpd]) r.positions[fromEpd] = { annotation: "", moves: [] };
        if (!r.positions[target]) r.positions[target] = { annotation: "", moves: [] };
        const moves = r.positions[fromEpd].moves;
        if (!moves.some((m) => m.san === h.san)) {
          moves.push({ san: h.san, uci: h.uci, target, mine });
          const mineMoves = moves.filter((m) => m.mine);
          if (mine && mineMoves.length > 1) mineMoves.forEach((m) => (m.conflict = true));
        }
        prev = h.fen;
      }
    });
  }

  // Remove a single move (by SAN) from a given position's move list.
  function removeMoveAt(fromEpd, san) {
    mutateRep((r) => {
      const pos = r.positions[fromEpd];
      if (!pos) return;
      const i = pos.moves.findIndex((m) => m.san === san);
      if (i < 0) return;
      pos.moves.splice(i, 1);
      const mineMoves = pos.moves.filter((m) => m.mine);
      if (mineMoves.length <= 1) mineMoves.forEach((m) => delete m.conflict);
      // Sweep away any line that this removal just made unreachable, so it stops
      // appearing in drills and exports.
      pruneOrphans(r);
    });
  }

  // Set or clear a move's quality marker (risky / blunder) at a given position.
  function setMoveQualityAt(fromEpd, san, quality) {
    mutateRep((r) => {
      const pos = r.positions[fromEpd];
      const m = pos && pos.moves.find((x) => x.san === san);
      if (!m) return;
      if (quality) m.quality = quality;
      else delete m.quality;
    });
  }

  // Chips edit moves *from* the current position.
  const setMoveQuality = (san, quality) => setMoveQualityAt(epd, san, quality);

  // Mark the last *played* move (the one that led here). If it isn't stored yet,
  // store the line first so the marker has somewhere to live.
  function setLastMoveQuality(quality) {
    if (cursor === 0) return;
    const fromEpd = toEpd(prevFen);
    if (quality && !moveStored(rep, fromEpd, lastMoveSan)) storeLine();
    setMoveQualityAt(fromEpd, lastMoveSan, quality);
  }

  // Chips show moves *from* the current position.
  const deleteMove = (san) => removeMoveAt(epd, san);
  // The "remove last move" button targets the move that *led to* this position.
  const removeLastMove = () => cursor > 0 && removeMoveAt(toEpd(prevFen), history[cursor - 1].san);

  function annotate(text) {
    mutateRep((r) => {
      if (!r.positions[epd]) r.positions[epd] = { annotation: "", moves: [] };
      r.positions[epd].annotation = text;
    });
  }

  // --- categories (inherited opening tags, used to target drills) ---
  // Categories propagate forward: a position belongs to every category whose
  // tagged root can reach it through repertoire moves. Membership is recomputed
  // from the graph; only the explicit root tags are stored.
  const categoryMembers = useMemo(() => (rep ? categoryMembership(rep) : new Map()), [rep]);
  const allCategories = useMemo(() => [...categoryMembers.keys()].sort((a, b) => a.localeCompare(b)), [categoryMembers]);

  // Categories the current position inherits from an ancestor (i.e. it's a
  // member but not tagged here) — shown but not removable at this node.
  const explicitCats = (node && node.categories) || EMPTY;
  const inheritedCats = allCategories.filter((c) => !explicitCats.includes(c) && categoryMembers.get(c)?.has(epd));

  // Tagging a single position is enough — everything that follows inherits it.
  function addCategory(name) {
    name = name.trim();
    if (!name) return;
    mutateRep((r) => {
      if (!r.positions[epd]) r.positions[epd] = { annotation: "", moves: [] };
      const cats = r.positions[epd].categories || (r.positions[epd].categories = []);
      if (!cats.includes(name)) cats.push(name);
    });
  }

  function removeCategory(name) {
    mutateRep((r) => {
      const pos = r.positions[epd];
      if (!pos || !pos.categories) return;
      pos.categories = pos.categories.filter((c) => c !== name);
      if (pos.categories.length === 0) delete pos.categories;
    });
  }

  // Labels the current position belongs to (explicit here + inherited).
  const activeCats = [...explicitCats, ...inheritedCats];

  // Attach / replace / remove a category's setup (ordered list of my-move SANs).
  function setSetup(category, sans) {
    mutateRep((r) => {
      if (!r.setups) r.setups = {};
      if (sans && sans.length) r.setups[category] = sans;
      else delete r.setups[category];
      if (Object.keys(r.setups).length === 0) delete r.setups;
    });
  }

  // Mark / unmark every stored edge of the current line as main.
  function toggleLineMain() {
    const makeMain = lineMainState !== "all";
    mutateRep((r) => {
      let prev = START_FEN;
      for (let i = 0; i < cursor; i++) {
        const m = r.positions[toEpd(prev)]?.moves.find((x) => x.san === history[i].san);
        if (m) {
          if (makeMain) m.main = true;
          else delete m.main;
        }
        prev = history[i].fen;
      }
    });
  }

  // Unresolved conflicts: positions with more than one repertoire move, with the
  // shortest line from the start for display and jumping.
  const conflicts = useMemo(() => {
    if (!rep) return EMPTY;
    const out = [];
    for (const [e, n] of Object.entries(rep.positions)) {
      const mine = (n.moves || []).filter((m) => m.mine);
      if (mine.length > 1) {
        const path = findLine(rep, (x) => x === e);
        out.push({ epd: e, sans: mine.map((m) => m.san), line: path ? path.map((m) => m.san) : [] });
      }
    }
    return out;
  }, [rep]);

  // Drop the board onto a specific line / position.
  function gotoLine(moves) {
    if (!moves) return;
    const entries = lineToHistory(moves);
    setHistory(entries);
    setCursor(entries.length);
  }
  const jumpToEpd = (targetEpd) => gotoLine(findLine(rep, (e) => e === targetEpd));

  // Jump the board to a label's root: the tagged position nearest the start.
  function jumpToCategory(name) {
    const roots = new Set();
    for (const [e, n] of Object.entries(rep.positions)) if ((n.categories || []).includes(name)) roots.add(e);
    gotoLine(findLine(rep, (e) => roots.has(e)));
  }

  // Navigation only moves the cursor — the full line stays put until Reset.
  function goToPly(i) {
    setCursor(i);
  }

  function resetHistory() {
    setHistory([]);
    setCursor(0);
  }

  // Capture the current board line and store it in the games library.
  async function saveLineAsGame() {
    if (history.length === 0) return;
    setToast("saving game…");
    try {
      const data = await api.getGames();
      data.games.unshift({
        id: `g_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
        white: "",
        black: "",
        year: null,
        event: "",
        result: "*",
        tags: [],
        note: "",
        moves: history.map((h) => ({ san: h.san, uci: h.uci, comment: "" })),
        createdAt: new Date().toISOString(),
      });
      await api.saveGames(data);
      setToast("saved to Games");
    } catch {
      setToast("save failed");
    }
    setTimeout(() => setToast(""), 2500);
  }

  async function commit() {
    setToast("committing…");
    try {
      const r = await api.commit(`repertoire update (${color})`);
      setToast(r.message);
    } catch (e) {
      setToast("commit failed");
    }
    setTimeout(() => setToast(""), 2500);
  }

  async function importPgnFile(file) {
    const text = await file.text();
    setToast("importing…");
    try {
      const r = await api.importPgn(color, text);
      const parts = [`+${r.addedMoves} moves`];
      if (r.chapters) parts.push(`${r.chapters} chapters`);
      if (r.conflicts.length) parts.push(`${r.conflicts.length} conflicts`);
      if (r.skipped && r.skipped.length) parts.push(`${r.skipped.length} skipped`);
      setToast(parts.join(" · "));
      api.getRepertoire(color).then(setRep);
    } catch (e) {
      setToast("import failed: " + e.message);
    }
    setTimeout(() => setToast(""), 4000);
  }

  if (!rep || !training) return <div className="loading">Loading repertoire…</div>;

  return (
    <div className="app">
      <header className="topbar">
        <h1>Chess Opening Repertoire</h1>
        {mode !== "games" && (
          <div className="seg">
            {["white", "black"].map((c) => (
              <button key={c} className={color === c ? "on" : ""} onClick={() => setColor(c)}>
                {c === "white" ? "♙ White" : "♟ Black"}
              </button>
            ))}
          </div>
        )}
        <div className="seg">
          {["edit", "drill", "games"].map((m) => (
            <button key={m} className={mode === m ? "on" : ""} onClick={() => setMode(m)}>
              {m === "edit" ? "Edit" : m === "drill" ? "Drill" : "Games"}
            </button>
          ))}
        </div>
        <div className="topbar-right">
          {mode === "edit" && (
            <button className={`tb-btn${showArrows ? " on" : ""}`} onClick={() => setShowArrows((v) => !v)} title="Show stored moves as arrows on the board">
              Arrows: {showArrows ? "on" : "off"}
            </button>
          )}
          {mode === "edit" && (
            <button className={`tb-btn${showEngine ? " on" : ""}`} onClick={() => setShowEngine((v) => !v)} title="Show the eval bar and engine suggestions">
              Engine: {showEngine ? "on" : "off"}
            </button>
          )}
          {mode === "edit" && showEngine && (
            <button
              className="tb-btn"
              onClick={() => setEngineSource((s) => (s === "local" ? "cloud" : "local"))}
              title="Switch between local Stockfish and Lichess cloud evaluation"
            >
              {engineSource === "local" ? "Stockfish (local)" : "Cloud eval"}
            </button>
          )}
          {toast && <span className="toast">{toast}</span>}
          {mode !== "games" && (
            <>
              <span className={`save save-${saveState}`}>{saveState === "saved" ? "saved" : saveState === "saving" ? "saving…" : "save failed"}</span>
              <label className="tb-btn">
                Import PGN
                <input type="file" accept=".pgn,text/plain" hidden onChange={(e) => e.target.files[0] && importPgnFile(e.target.files[0])} />
              </label>
              <a className="tb-btn" href={`/api/export/${color}`}>Export PGN</a>
            </>
          )}
          <button className="tb-btn" onClick={commit}>Commit</button>
        </div>
      </header>

      {mode === "games" ? (
        <GamesView />
      ) : mode === "drill" ? (
        <main className="main">
          <Drill key={color + (training ? "t" : "")} rep={rep} training={training} categoryMembers={categoryMembers} onGrade={onGrade} />
        </main>
      ) : (
        <main className="main edit-layout">
          <div className="labels-col">
            <CategoryList categories={allCategories} active={activeCats} setups={rep.setups || {}} onSetSetup={setSetup} onJump={jumpToCategory} />
            <GapFinder key={color} color={color} onJump={jumpToEpd} />
          </div>
          <div className="board-col">
            <div className="board-row">
              {showEngine && <EvalBar ev={engineEv} />}
              <Board fen={fen} orientation={color} lastMove={lastMove} movableColor="both" shapes={boardShapes} onMove={(f, t) => applyMove({ from: f, to: t, promotion: "q" })} />
            </div>
          </div>
          <div className="moves-col">
            <MoveList history={history} cursor={cursor} qualities={moveQualities} mains={moveMains} onGoTo={goToPly} onReset={resetHistory} />
            {cursor > 0 && (
              <button className="tb-btn save-line-btn" onClick={toggleLineMain} title="Flag every stored move of this line as a main line">
                {lineMainState === "all" ? "☆ Unmark main line" : "★ Mark line as main"}
              </button>
            )}
            {history.length > 0 && (
              <button className="tb-btn save-line-btn" onClick={saveLineAsGame} title="Store this line in the games library">
                ♟ Save line as game
              </button>
            )}
          </div>
          <div className="side-col">
            {conflicts.length > 0 && <ConflictList conflicts={conflicts} currentEpd={epd} onJump={jumpToEpd} />}
            <Panel
              epd={epd}
              node={node}
              repColor={rep.color}
              pendingMove={pending}
              setupMove={setupMove}
              onAddPending={storeLine}
              lastStored={lastStored}
              onRemoveLast={removeLastMove}
              lastMoveSan={lastMoveSan}
              lastQuality={lastQuality}
              onSetLastQuality={setLastMoveQuality}
              onPlayMove={(m) => applyMove(m.san)}
              onDeleteMove={deleteMove}
              onSetQuality={setMoveQuality}
              onAnnotate={annotate}
              allCategories={allCategories}
              inheritedCategories={inheritedCats}
              onAddCategory={addCategory}
              onRemoveCategory={removeCategory}
            />
            {showEngine && (
              <EngineSuggestions
                fen={fen}
                ev={engineEv}
                source={engineSource}
                onPlaySan={(san) => applyMove(san)}
                inRepertoire={(san) => !!(node && node.moves.some((m) => m.san === san))}
              />
            )}
            <Explorer
              fen={fen}
              onPlaySan={(san) => applyMove(san)}
              inRepertoire={(san) => !!(node && node.moves.some((m) => m.san === san))}
            />
          </div>
        </main>
      )}
    </div>
  );
}

// Mark-and-sweep: delete every position no longer reachable from the start by
// following move edges. Transposition-safe — a position kept alive by any other
// line survives. Mutates the rep in place.
function pruneOrphans(r) {
  const reachable = new Set();
  const stack = [START_EPD];
  while (stack.length) {
    const e = stack.pop();
    if (reachable.has(e)) continue;
    reachable.add(e);
    for (const m of (r.positions[e] && r.positions[e].moves) || []) {
      if (m.target && !reachable.has(m.target)) stack.push(m.target);
    }
  }
  for (const e of Object.keys(r.positions)) {
    if (!reachable.has(e)) delete r.positions[e];
  }
}

// Is there already a repertoire move with this SAN at the given position?
function moveStored(rep, fromEpd, san) {
  const pos = rep.positions[fromEpd];
  return !!(pos && pos.moves.some((m) => m.san === san));
}

// Shortest move sequence from the start to the first position matching `isTarget`,
// walking forward over repertoire move edges. Returns [{san, uci}] or null.
function findLine(rep, isTarget) {
  if (isTarget(START_EPD)) return [];
  const seen = new Set([START_EPD]);
  const prev = new Map(); // epd -> { from, move }
  const queue = [START_EPD];
  while (queue.length) {
    const e = queue.shift();
    for (const m of (rep.positions[e] && rep.positions[e].moves) || []) {
      if (!m.target || seen.has(m.target)) continue;
      seen.add(m.target);
      prev.set(m.target, { from: e, move: m });
      if (isTarget(m.target)) {
        const moves = [];
        for (let cur = m.target; prev.has(cur); cur = prev.get(cur).from) moves.unshift(prev.get(cur).move);
        return moves;
      }
      queue.push(m.target);
    }
  }
  return null;
}

// Replay a move sequence into board history entries the app understands.
function lineToHistory(moves) {
  const chess = new Chess(START_FEN);
  return moves.map((m) => {
    let made;
    try {
      made = chess.move(m.san);
    } catch {
      made = chess.move({ from: m.uci.slice(0, 2), to: m.uci.slice(2, 4), promotion: m.uci.slice(4) || undefined });
    }
    return { san: made.san, fen: chess.fen(), from: made.from, to: made.to, uci: made.from + made.to + (made.promotion || "") };
  });
}
