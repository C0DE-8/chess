const { Chess } = require('chess.js');
const { query } = require('../config/database');
const { bestMove } = require('./stockfish');
const { getStockfishEnabled } = require('./settings');

const BOT_LEVELS = ['newbie', 'beginner', 'novice', 'intermediate', 'advanced'];
const BOT_LEVEL_LABELS = {
  newbie: 'Newbie Bot',
  beginner: 'Beginner Bot',
  novice: 'Novice Bot',
  intermediate: 'Intermediate Bot',
  advanced: 'Advanced Bot',
};

function normalizeBotLevel(level) {
  return BOT_LEVELS.includes(level) ? level : 'beginner';
}

function isBotGame(game) {
  return Boolean(game && game.black_player_id == null && String(game.result_reason || '').startsWith('bot:'));
}

function botLevel(game) {
  if (!isBotGame(game)) return null;
  return normalizeBotLevel(String(game.result_reason).slice(4));
}

function botName(game) {
  const level = botLevel(game);
  if (level) return BOT_LEVEL_LABELS[level];
  if (game?.black_player_id == null && game?.status === 'completed') return 'Chess Bot';
  if (game?.black_player_id == null && game?.result_reason === 'bot_aborted') return 'Chess Bot';
  return null;
}

async function chooseBotMove(chess, level) {
  const moves = chess.moves({ verbose: true });
  if (!moves.length) return null;

  const engineMove = await chooseStockfishMove(chess, level, moves);
  if (engineMove) return engineMove;

  if (level === 'newbie') return randomMove(moves);

  const scored = moves.map((move) => ({ move, score: scoreMove(chess, move, level) }));
  scored.sort((a, b) => b.score - a.score);

  if (level === 'beginner') return pickFromTop(scored, Math.min(8, scored.length));
  if (level === 'novice') return pickFromTop(scored, Math.min(5, scored.length));
  if (level === 'intermediate') return pickFromTop(scored, Math.min(3, scored.length));
  return scored[0].move;
}

async function chooseStockfishMove(chess, level, moves) {
  try {
    const stockfishEnabled = await getStockfishEnabled();
    if (!stockfishEnabled) return null;

    const uciMove = await bestMove(chess.fen(), level);
    if (!uciMove) return null;

    const from = uciMove.slice(0, 2);
    const to = uciMove.slice(2, 4);
    const promotion = uciMove[4];

    return moves.find((move) => (
      move.from === from
      && move.to === to
      && (!promotion || move.promotion === promotion)
    )) || null;
  } catch {
    return null;
  }
}

async function applyBotMoveIfNeeded(gameId) {
  const games = await query('SELECT * FROM games WHERE id = ?', [gameId]);
  const game = games[0];
  if (!game || game.status !== 'active' || !isBotGame(game)) return null;

  const chess = new Chess(game.current_fen);
  if (chess.turn() !== 'b' || chess.isGameOver()) return null;

  const move = await chooseBotMove(chess, botLevel(game));
  if (!move) return null;

  chess.move(move);
  const fen = chess.fen();
  const pgn = chess.pgn();
  const countRows = await query('SELECT COUNT(*) AS move_count FROM game_moves WHERE game_id = ?', [gameId]);
  const moveNumber = Number(countRows[0]?.move_count || 0) + 1;

  await query(
    `INSERT INTO game_moves
     (game_id, player_id, move_number, from_square, to_square, promotion, san, fen_after)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [gameId, game.created_by, moveNumber, move.from, move.to, move.promotion || null, move.san, fen],
  );
  await query('UPDATE games SET current_fen = ?, pgn = ? WHERE id = ?', [fen, pgn, gameId]);

  return { move, chess };
}

function scoreMove(chess, move, level) {
  const pieceValues = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
  let score = Math.random();

  if (move.captured) score += pieceValues[move.captured] * valueWeight(level);
  if (move.promotion) score += 8;
  if (move.flags.includes('c')) score += 1.5;

  const clone = new Chess(chess.fen());
  clone.move(move);
  if (clone.isCheckmate()) score += 100;
  else if (clone.inCheck()) score += level === 'beginner' ? 0.8 : 2.5;

  if (level === 'advanced') {
    const replyCount = clone.moves().length;
    score -= replyCount * 0.02;
  }

  return score;
}

function valueWeight(level) {
  if (level === 'beginner') return 1.2;
  if (level === 'novice') return 1.8;
  if (level === 'intermediate') return 2.4;
  return 3;
}

function randomMove(moves) {
  return moves[Math.floor(Math.random() * moves.length)];
}

function pickFromTop(scored, count) {
  return randomMove(scored.slice(0, count)).move;
}

module.exports = {
  BOT_LEVELS,
  BOT_LEVEL_LABELS,
  applyBotMoveIfNeeded,
  botLevel,
  botName,
  isBotGame,
  normalizeBotLevel,
};
