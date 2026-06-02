import { useMemo, useState } from 'react';
import { Chess } from 'chess.js';
import styles from './ChessBoard.module.css';

const pieces = {
  p: '♟',
  r: '♜',
  n: '♞',
  b: '♝',
  q: '♛',
  k: '♚',
  P: '♟',
  R: '♜',
  N: '♞',
  B: '♝',
  Q: '♛',
  K: '♚',
};

function fenSquares(fen) {
  const board = [];
  const rows = fen.split(' ')[0].split('/');
  rows.forEach((row) => {
    row.split('').forEach((char) => {
      const empty = Number(char);
      if (empty) {
        for (let i = 0; i < empty; i += 1) board.push(null);
      } else {
        board.push(char);
      }
    });
  });
  return board;
}

function squareName(index) {
  const file = 'abcdefgh'[index % 8];
  const rank = 8 - Math.floor(index / 8);
  return `${file}${rank}`;
}

function isOwnPiece(piece, userColor) {
  if (!piece || !userColor) return false;
  return userColor === 'white' ? piece === piece.toUpperCase() : piece === piece.toLowerCase();
}

function promotionForMove(piece, to) {
  if (!piece || piece.toLowerCase() !== 'p') return undefined;
  const rank = to[1];
  return rank === '1' || rank === '8' ? 'q' : undefined;
}

function pieceClass(piece) {
  if (!piece) return '';
  return piece === piece.toUpperCase() ? styles.whitePiece : styles.blackPiece;
}

function boardIndexes(orientation) {
  const indexes = Array.from({ length: 64 }, (_, index) => index);
  return orientation === 'black' ? indexes.reverse() : indexes;
}

export default function ChessBoard({ fen, userColor, isPlayable, orientation = 'white', onMove }) {
  const [selected, setSelected] = useState(null);
  const boardFen = fen || '8/8/8/8/8/8/8/8 w - - 0 1';
  const squares = useMemo(() => fenSquares(boardFen), [boardFen]);
  const renderedIndexes = useMemo(() => boardIndexes(orientation), [orientation]);
  const legalMoves = useMemo(() => {
    if (!selected || !isPlayable) return [];
    try {
      const chess = new Chess(boardFen);
      return chess.moves({ square: selected, verbose: true });
    } catch {
      return [];
    }
  }, [boardFen, isPlayable, selected]);
  const legalTargets = new Set(legalMoves.map((move) => move.to));

  function handleSquareClick(index) {
    if (!isPlayable) return;
    const square = squareName(index);
    const piece = squares[index];

    if (selected && legalTargets.has(square)) {
      const selectedIndex = Array.from({ length: 64 }).findIndex((_, itemIndex) => squareName(itemIndex) === selected);
      onMove({ from: selected, to: square, promotion: promotionForMove(squares[selectedIndex], square) || 'q' });
      setSelected(null);
      return;
    }

    if (isOwnPiece(piece, userColor)) {
      setSelected(square);
      return;
    }

    setSelected(null);
  }

  return (
    <div className={styles.board} aria-label="Chess board">
      {renderedIndexes.map((index, renderIndex) => {
        const piece = squares[index];
        const square = squareName(index);
        const renderFile = renderIndex % 8;
        const renderRank = Math.floor(renderIndex / 8);
        const classNames = [
          (Math.floor(index / 8) + index) % 2 ? styles.dark : styles.light,
          selected === square ? styles.selected : '',
          legalTargets.has(square) ? styles.legal : '',
        ].filter(Boolean).join(' ');

        return (
          <button
            className={classNames}
            data-file={renderRank === 7 ? square[0] : ''}
            data-rank={renderFile === 0 ? square[1] : ''}
            key={square}
            onClick={() => handleSquareClick(index)}
            type="button"
          >
            <span className={`${styles.piece} ${pieceClass(piece)}`}>{piece ? pieces[piece] : ''}</span>
          </button>
        );
      })}
    </div>
  );
}
