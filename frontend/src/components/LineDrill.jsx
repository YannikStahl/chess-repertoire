import { useEffect, useMemo, useState } from "react";
import { Chess } from "chess.js";
import Board from "./Board.jsx";
import { categoryRoot, enumerateLines, epdToFen, figurine, gradeSrs, newSrsItem, setupMoveFor, toEpd } from "../chess-utils.js";

// A line counts as "main" when every stored edge in it is flagged main
// (setup-derived moves carry no flag and don't disqualify a line).
function isMainLine(line) {
  const stored = line.filter((m) => !m.setup);
  return stored.length > 0 && stored.every((m) => m.main);
}

const OPP_DELAY = 600; // ms before the opponent auto-plays
const LINE_DONE_DELAY = 850; // ms to linger on a completed line

// Replay a line (array of move objects) into board plies with positions.
function replay(startFen, line) {
  const chess = new Chess(startFen);
  return line.map((m) => {
    const fenBefore = chess.fen();
    let made;
    try {
      made = chess.move(m.san);
    } catch {
      made = chess.move({ from: m.uci.slice(0, 2), to: m.uci.slice(2, 4), promotion: m.uci.slice(4) || undefined });
    }
    return { san: made.san, from: made.from, to: made.to, fenBefore, fenAfter: chess.fen(), ours: !!m.mine };
  });
}

// Play whole lines from the category's starting position: the opponent's expected
// replies are auto-played; you must recall your moves. A mistake reveals the
// correct move, plays it, and you continue from there.
export default function LineDrill({ rep, training, category, categoryMembers, onGrade }) {
  const startEpd = useMemo(() => categoryRoot(rep, category), [rep, category]);
  const startFen = epdToFen(startEpd);

  const [round, setRound] = useState(0);
  const [mainOnly, setMainOnly] = useState(false);
  const lines = useMemo(() => {
    let ls = enumerateLines(rep, startEpd, rep.color, 1000, (e) => setupMoveFor(rep, e, categoryMembers));
    for (let i = ls.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [ls[i], ls[j]] = [ls[j], ls[i]];
    }
    if (mainOnly) ls = ls.filter(isMainLine);
    else ls.sort((a, b) => isMainLine(b) - isMainLine(a)); // main lines first
    return ls;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rep, startEpd, round, mainOnly, categoryMembers]);

  const [lineIdx, setLineIdx] = useState(0);
  const [step, setStep] = useState(0);
  const [wrong, setWrong] = useState(false);
  const [score, setScore] = useState({ right: 0, wrong: 0 });
  const [lineMistakes, setLineMistakes] = useState(0);

  const plies = useMemo(() => (lines[lineIdx] ? replay(startFen, lines[lineIdx]) : []), [lines, lineIdx, startFen]);
  const done = lineIdx >= lines.length;
  const cur = plies[step];
  const fen = step > 0 ? plies[step - 1].fenAfter : startFen;
  const lastMove = step > 0 ? [plies[step - 1].from, plies[step - 1].to] : null;
  // It's our move (board is live) whenever the current ply is ours — including
  // while we're being shown the correct move and must replay it.
  const awaitingMe = !done && !!cur && cur.ours;

  // Drive the line forward: auto-play opponent moves and roll over to the next
  // line when one finishes. Our moves (first try or replaying after a mistake)
  // wait for input.
  useEffect(() => {
    if (done || plies.length === 0) return;
    if (step >= plies.length) {
      const t = setTimeout(nextLine, LINE_DONE_DELAY);
      return () => clearTimeout(t);
    }
    if (!plies[step].ours) {
      const t = setTimeout(() => setStep((s) => s + 1), OPP_DELAY);
      return () => clearTimeout(t);
    }
    // our turn → wait for input
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, lineIdx, plies, done]);

  function nextLine() {
    setLineIdx((i) => i + 1);
    setStep(0);
    setWrong(false);
    setLineMistakes(0);
  }

  function restart() {
    setRound((r) => r + 1);
    setLineIdx(0);
    setStep(0);
    setWrong(false);
    setLineMistakes(0);
    setScore({ right: 0, wrong: 0 });
  }

  function toggleMainOnly() {
    setMainOnly((v) => !v);
    setLineIdx(0);
    setStep(0);
    setWrong(false);
    setLineMistakes(0);
    setScore({ right: 0, wrong: 0 });
  }

  const mainToggle = (
    <button className={`tb-btn ml-only${mainOnly ? " on" : ""}`} title="Drill only lines marked as main" onClick={toggleMainOnly}>
      ★ main only
    </button>
  );

  function handleMove(from, to) {
    if (!awaitingMe) return;
    const chess = new Chess(cur.fenBefore);
    let made;
    try {
      made = chess.move({ from, to, promotion: "q" });
    } catch {
      return;
    }
    if (made.san === cur.san) {
      // Correct. Only grade/score on a clean first try; replaying after the
      // answer was shown just lets you proceed.
      if (!wrong) {
        const key = `${rep.color}:${toEpd(cur.fenBefore)}`;
        setScore((s) => ({ ...s, right: s.right + 1 }));
        onGrade(key, gradeSrs(training.items[key] || newSrsItem(), true));
      }
      setWrong(false);
      setStep((s) => s + 1);
    } else if (!wrong) {
      // First wrong attempt: count it once, then reveal and wait for the replay.
      const key = `${rep.color}:${toEpd(cur.fenBefore)}`;
      setScore((s) => ({ ...s, wrong: s.wrong + 1 }));
      setLineMistakes((m) => m + 1);
      onGrade(key, gradeSrs(training.items[key] || newSrsItem(), false));
      setWrong(true);
    }
    // else: already revealing — ignore anything but the correct move.
  }

  const shapes = wrong && cur ? [{ orig: cur.from, dest: cur.to, brush: "mine" }] : undefined;
  const playedSans = plies.slice(0, step).map((p) => figurine(p.san)).join(" ");
  const annotation = cur && rep.positions[toEpd(cur.fenBefore)] ? rep.positions[toEpd(cur.fenBefore)].annotation : "";

  if (lines.length === 0) {
    return (
      <div className="drill-layout">
        <Board fen={startFen} orientation={rep.color} movableColor={null} lastMove={null} />
        <section className="panel drill-card">
          <header className="panel-head">
            <h2>Lines</h2>
            {mainToggle}
          </header>
          <p className="muted">
            {mainOnly
              ? "No main lines here — mark a line as main in the editor, or turn the filter off."
              : `No lines to play from here${category ? ` in “${category}”` : ""}. Add some moves first.`}
          </p>
        </section>
      </div>
    );
  }

  return (
    <div className="drill-layout">
      <Board fen={fen} orientation={rep.color} movableColor={awaitingMe ? rep.color : null} lastMove={lastMove} shapes={shapes} onMove={handleMove} />
      <section className={`panel drill-card${wrong ? " drill-wrong" : ""}`}>
        <header className="panel-head">
          <h2>Lines</h2>
          {!done && (
            <span className="muted">
              line {lineIdx + 1} / {lines.length}{isMainLine(lines[lineIdx]) ? " ★" : ""} · ✓ {score.right} ✗ {score.wrong}
            </span>
          )}
          {mainToggle}
        </header>

        {done ? (
          <>
            <p className="drill-prompt ok">All lines complete ✓</p>
            <p className="muted">{score.right} correct, {score.wrong} missed across {lines.length} lines.</p>
            <button className="add-move" onClick={restart}>Drill again</button>
          </>
        ) : (
          <>
            {wrong ? (
              <p className="drill-prompt bad">✗ Not quite — now play {figurine(cur.san)} to continue.</p>
            ) : awaitingMe ? (
              <p className="drill-prompt">Your move — recall the line.</p>
            ) : step >= plies.length ? (
              <p className="drill-prompt ok">{lineMistakes === 0 ? "Line complete ✓" : "Line complete"}</p>
            ) : (
              <p className="drill-prompt muted">…</p>
            )}
            {wrong && annotation && <p className="drill-note">{annotation}</p>}
            {playedSans && <p className="drill-line-moves">{playedSans}</p>}
          </>
        )}
      </section>
    </div>
  );
}
