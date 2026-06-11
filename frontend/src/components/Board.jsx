import { useEffect, useRef } from "react";
import { Chessground } from "chessground";
import { Chess, SQUARES } from "chess.js";
import "chessground/assets/chessground.base.css";
import "chessground/assets/chessground.brown.css";
import "chessground/assets/chessground.cburnett.css";

function legalDests(fen) {
  const dests = new Map();
  let chess;
  try {
    chess = new Chess(fen);
  } catch {
    return dests;
  }
  for (const s of SQUARES) {
    const moves = chess.moves({ square: s, verbose: true });
    if (moves.length) dests.set(s, moves.map((m) => m.to));
  }
  return dests;
}

/**
 * props:
 *  fen          – full FEN of the position to display
 *  orientation  – 'white' | 'black'
 *  lastMove     – [from, to] | null
 *  movableColor – 'white' | 'black' | 'both' | null (null = view only)
 *  shapes       – auto-drawn arrows, e.g. [{ orig, dest, brush }]
 *  onMove(from, to)
 */
export default function Board({ fen, orientation, lastMove, movableColor, shapes, onMove }) {
  const elRef = useRef(null);
  const cgRef = useRef(null);
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;

  useEffect(() => {
    cgRef.current = Chessground(elRef.current, {
      animation: { duration: 180 },
      movable: { free: false, showDests: true },
      // Themed brushes: gold for your repertoire moves, blue for expected replies.
      drawable: {
        enabled: true,
        brushes: {
          mine: { key: "mine", color: "#d4a24e", opacity: 0.9, lineWidth: 11 },
          rep: { key: "rep", color: "#8aa3b4", opacity: 0.9, lineWidth: 11 },
        },
      },
      events: {},
    });
    return () => cgRef.current && cgRef.current.destroy();
  }, []);

  // Arrows are managed independently of the position so updating them never
  // re-renders / re-animates the board.
  useEffect(() => {
    if (cgRef.current) cgRef.current.setAutoShapes(shapes || []);
  }, [shapes]);

  useEffect(() => {
    if (!cgRef.current) return;
    const turn = fen.split(" ")[1] === "w" ? "white" : "black";
    const color = movableColor === "both" ? turn : movableColor;
    cgRef.current.set({
      fen,
      orientation,
      turnColor: turn,
      lastMove: lastMove || undefined,
      check: isCheck(fen),
      movable: {
        free: false,
        color: color || undefined,
        dests: color ? legalDests(fen) : new Map(),
        showDests: true,
        events: {
          after: (from, to) => onMoveRef.current && onMoveRef.current(from, to),
        },
      },
    });
  }, [fen, orientation, lastMove, movableColor]);

  return <div className="board-wrap"><div ref={elRef} className="cg-board-container" /></div>;
}

function isCheck(fen) {
  try {
    return new Chess(fen).inCheck();
  } catch {
    return false;
  }
}
