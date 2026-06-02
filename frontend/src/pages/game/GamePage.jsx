import { useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { API_URL, getToken } from '../../api/client';
import { abortBotGame, analyzeGame, closeGame, createBotGame, createGame, getGame, joinGame, resignGame } from '../../api/gamesApi';
import ChessBoard from '../../ui/game/ChessBoard';
import styles from './GamePage.module.css';

const botLevels = [
  { value: 'newbie', label: 'Newbie' },
  { value: 'beginner', label: 'Beginner' },
  { value: 'novice', label: 'Novice' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
];

const botLevelLabels = Object.fromEntries(botLevels.map((level) => [level.value, level.label]));

function playerColor(game, userId) {
  if (!game) return null;
  if (game.white_player_id === userId) return 'white';
  if (game.black_player_id === userId) return 'black';
  return null;
}

function turnColor(fen) {
  return fen?.split(' ')[1] === 'b' ? 'black' : 'white';
}

function playerName(game, color) {
  if (!game) return color === 'white' ? 'White' : 'Black';
  return color === 'white' ? game.white_name || 'White' : game.black_name || 'Waiting';
}

function playerId(game, color) {
  if (!game) return null;
  return color === 'white' ? game.white_player_id : game.black_player_id;
}

function isBotRecord(game) {
  return Boolean(game?.black_player_id == null && String(game?.result_reason || '').startsWith('bot:'));
}

function botLevelLabel(game) {
  const level = String(game?.result_reason || '').replace('bot:', '');
  return botLevelLabels[level] || 'Bot';
}

export default function GamePage({ user, games, refresh }) {
  const [selectedId, setSelectedId] = useState(games[0]?.id || '');
  const [game, setGame] = useState(null);
  const [message, setMessage] = useState('');
  const [botLevel, setBotLevel] = useState('beginner');
  const [isBotThinking, setIsBotThinking] = useState(false);
  const [analysis, setAnalysis] = useState([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const socketRef = useRef(null);

  const userColor = useMemo(() => playerColor(game, user.id), [game, user.id]);
  const lastMove = useMemo(() => game?.moves?.at(-1) || null, [game?.moves]);
  const isBotGame = isBotRecord(game);
  const canCloseGame = Boolean(game?.status === 'open' && game.created_by === user.id && !game.black_player_id);
  const canResignGame = Boolean(game?.status === 'active' && userColor && !isBotGame);
  const canAbortBotGame = Boolean(game?.status === 'active' && isBotGame && game.white_player_id === user.id);
  const orientation = userColor === 'black' ? 'black' : 'white';
  const topColor = orientation === 'black' ? 'white' : 'black';
  const bottomColor = orientation === 'black' ? 'black' : 'white';
  const isPlayable = Boolean(
    game?.status === 'active'
    && user.status === 'active'
    && userColor
    && turnColor(game.current_fen) === userColor,
  );

  useEffect(() => {
    if (!selectedId && games[0]?.id) {
      queueMicrotask(() => setSelectedId(games[0].id));
    }
  }, [games, selectedId]);

  useEffect(() => {
    if (!selectedId) return;
    setAnalysis([]);
    getGame(selectedId).then((data) => setGame(data.game)).catch(() => setGame(null));
  }, [selectedId]);

  useEffect(() => {
    if (!selectedId || !getToken()) return undefined;
    const socket = io(API_URL, { auth: { token: getToken() } });
    socketRef.current = socket;
    socket.emit('game:join', { gameId: selectedId }, (response) => {
      if (response?.game) setGame(response.game);
    });
    socket.on('game:updated', ({ game: updated, pendingBotMove }) => {
      setGame(updated);
      setIsBotThinking(Boolean(pendingBotMove));
      refresh();
    });
    socket.on('game:bot-error', ({ message: errorMessage }) => {
      setIsBotThinking(false);
      setMessage(errorMessage || 'Bot move failed.');
    });
    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [refresh, selectedId]);

  async function handleCreateGame() {
    const data = await createGame();
    setSelectedId(data.id);
    refresh();
  }

  async function handleCreateBotGame() {
    const data = await createBotGame(botLevel);
    setSelectedId(data.id);
    setMessage(`Bot game started at ${botLevel} level.`);
    refresh();
  }

  async function handleJoinGame(id) {
    await joinGame(id);
    setSelectedId(id);
    refresh();
  }

  async function handleCloseGame() {
    if (!game) return;
    await handleCloseOpenGame(game.id);
  }

  async function handleCloseOpenGame(id) {
    await closeGame(id);
    setMessage('Game closed.');
    if (String(id) === String(game?.id)) {
      setGame({ ...game, status: 'cancelled', result: 'abandoned', result_reason: 'closed_by_creator' });
    }
    refresh();
  }

  async function handleResignGame() {
    if (!game) return;
    const data = await resignGame(game.id);
    setMessage('You resigned the game.');
    if (data.game) setGame(data.game);
    refresh();
  }

  async function handleAbortBotGame() {
    if (!game) return;
    await abortBotGame(game.id);
    setMessage('Bot game aborted.');
    setGame({ ...game, status: 'cancelled', result: 'abandoned', result_reason: 'bot_aborted' });
    refresh();
  }

  function handleBoardMove(move) {
    setMessage('');
    setIsBotThinking(isBotGame);
    socketRef.current?.emit('game:move', { gameId: selectedId, ...move }, (response) => {
      setMessage(response.ok ? 'Move saved.' : response.message);
      if (!response.ok) setIsBotThinking(false);
      if (response.game) setGame(response.game);
    });
  }

  async function handleAnalyzeGame() {
    if (!game) return;
    setIsAnalyzing(true);
    setMessage('');
    try {
      const data = await analyzeGame(game.id);
      setAnalysis(data.analysis || []);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setIsAnalyzing(false);
    }
  }

  return (
    <section className={styles.workspace}>
      <div className={styles.gameLayout}>
        <div className={styles.playArea}>
          <div className={styles.playerBar}>
            <span className={styles.avatar}>{topColor === 'white' ? '♙' : '♟'}</span>
            <div>
              <strong>{playerName(game, topColor)}</strong>
              <small>{topColor} {playerId(game, topColor) === user.id ? 'you' : isBotGame && topColor === 'black' ? botLevelLabel(game) : ''}</small>
            </div>
          </div>

          <ChessBoard
            fen={game?.current_fen}
            userColor={userColor}
            orientation={orientation}
            isPlayable={isPlayable}
            lastMove={lastMove}
            onMove={handleBoardMove}
          />

          <div className={styles.playerBar}>
            <span className={styles.avatar}>{bottomColor === 'white' ? '♙' : '♟'}</span>
            <div>
              <strong>{playerName(game, bottomColor)}</strong>
              <small>{bottomColor} {playerId(game, bottomColor) === user.id ? 'you' : isBotGame && bottomColor === 'black' ? botLevelLabel(game) : ''}</small>
            </div>
          </div>
        </div>

        <aside className={styles.sidePanel}>
          <div className={styles.panelHead}>
            <div>
              <h2>Live Game</h2>
              <p>{game ? `Game #${game.id} · ${game.status}` : 'Select or create a game'}</p>
            </div>
            <button className={styles.primary} onClick={handleCreateGame} disabled={user.status !== 'active'} type="button">New</button>
          </div>

          {user.status !== 'active' && <p className={styles.notice}>Your account must be approved before you can play.</p>}
          <p className={styles.turnText}>
            {game ? `${userColor || 'Spectator'} view. ${isPlayable ? 'Your move: click a piece.' : `Waiting for ${turnColor(game.current_fen)}.`}` : 'Choose an open game.'}
          </p>
          {message && <p className={styles.notice}>{message}</p>}
          {isBotThinking && <p className={styles.thinking}>Stockfish is thinking...</p>}

          <div className={styles.botPanel}>
            <label>
              Bot level
              <select value={botLevel} onChange={(event) => setBotLevel(event.target.value)}>
                {botLevels.map((level) => <option key={level.value} value={level.value}>{level.label}</option>)}
              </select>
            </label>
            <button className={styles.secondary} onClick={handleCreateBotGame} disabled={user.status !== 'active'} type="button">Play bot</button>
          </div>

          {game && (
            <div className={styles.actionPanel}>
              {canCloseGame && <button onClick={handleCloseGame} type="button">Close open game</button>}
              {canResignGame && <button onClick={handleResignGame} type="button">Resign</button>}
              {canAbortBotGame && <button onClick={handleAbortBotGame} type="button">Abort bot game</button>}
            </div>
          )}

          <div className={styles.movePanel}>
            <div className={styles.movePanelHead}>
              <h3>Moves</h3>
              <button onClick={handleAnalyzeGame} disabled={!game?.moves?.length || isAnalyzing} type="button">
                {isAnalyzing ? 'Analyzing' : 'Analyze'}
              </button>
            </div>
            <ol className={styles.moves}>
              {(game?.moves || []).map((item) => (
                <li className={item.id === lastMove?.id ? styles.latestMove : ''} key={item.id}>
                  <span>{item.move_number}.</span>
                  {item.san}
                </li>
              ))}
            </ol>
          </div>

          {analysis.length > 0 && (
            <div className={styles.analysisPanel}>
              <h3>Stockfish Analysis</h3>
              <ol>
                {analysis.map((item) => (
                  <li key={item.moveId}>
                    <span>{item.moveNumber}. {item.san}</span>
                    <strong>{formatEvaluation(item.evaluation)}</strong>
                  </li>
                ))}
              </ol>
            </div>
          )}

          <div className={styles.gameList}>
            <h3>Club Games</h3>
            {games.map((item) => {
              const botGame = isBotRecord(item);
              const isSelected = String(item.id) === String(selectedId);
              const canJoin = item.status === 'open' && item.white_player_id !== user.id;
              const canClose = item.status === 'open' && item.created_by === user.id && !item.black_player_id;

              return (
                <div className={isSelected ? `${styles.gameRowWrap} ${styles.active}` : styles.gameRowWrap} key={item.id}>
                  <button className={styles.gameRow} onClick={() => setSelectedId(item.id)} type="button">
                    <span>#{item.id} {item.white_name || 'Open'} vs {item.black_name || 'Waiting'}</span>
                    <small>{item.status}{botGame ? ` · ${botLevelLabel(item)}` : ''}</small>
                  </button>
                  {(canJoin || canClose) && (
                    <div className={styles.gameRowActions}>
                      {canJoin && <button onClick={() => handleJoinGame(item.id)} type="button">Join</button>}
                      {canClose && <button onClick={() => handleCloseOpenGame(item.id)} type="button">Close</button>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </aside>
      </div>
    </section>
  );
}

function formatEvaluation(evaluation) {
  if (!evaluation) return 'No score';
  if (evaluation.type === 'mate') return `Mate ${evaluation.value}`;
  if (evaluation.type === 'cp') return `${evaluation.value > 0 ? '+' : ''}${(evaluation.value / 100).toFixed(2)}`;
  return 'No score';
}
