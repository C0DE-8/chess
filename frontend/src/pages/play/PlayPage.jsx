import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import { useNavigate, useParams } from 'react-router-dom';
import { io } from 'socket.io-client';
import { SOCKET_TRANSPORTS, SOCKET_URL, getToken } from '../../api/client';
import { abortBotGame, analyzeGame, closeGame, getGame, joinGame, resignGame } from '../../api/gamesApi';
import { useToast } from '../../components/ToastProvider';
import ChessBoard from '../../ui/game/ChessBoard';
import styles from './PlayPage.module.css';

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

export default function PlayPage({ user, games, refresh }) {
  const navigate = useNavigate();
  const { gameId } = useParams();
  const selectedId = gameId || '';
  const [game, setGame] = useState(null);
  const [message, setMessage] = useState('');
  const [isBotThinking, setIsBotThinking] = useState(false);
  const [analysis, setAnalysis] = useState([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [dismissedWinnerGameId, setDismissedWinnerGameId] = useState(null);
  const socketRef = useRef(null);
  const lastSocketGameRef = useRef(null);
  const { notify } = useToast();
  const selectedListGame = useMemo(
    () => games.find((item) => String(item.id) === String(selectedId)),
    [games, selectedId],
  );

  const userColor = useMemo(() => playerColor(game, user.id), [game, user.id]);
  const lastMove = useMemo(() => game?.moves?.at(-1) || null, [game?.moves]);
  const isBotGame = isBotRecord(game);
  const canCloseGame = Boolean(game?.status === 'open' && game.created_by === user.id && !game.black_player_id);
  const canResignGame = Boolean(game?.status === 'active' && userColor && !isBotGame);
  const canAbortBotGame = Boolean(game?.status === 'active' && isBotGame && game.white_player_id === user.id);
  const canJoinSelectedGame = Boolean(
    !game
    && selectedListGame?.status === 'open'
    && selectedListGame.white_player_id !== user.id,
  );
  const orientation = userColor === 'black' ? 'black' : 'white';
  const topColor = orientation === 'black' ? 'white' : 'black';
  const bottomColor = orientation === 'black' ? 'black' : 'white';
  const isPlayable = Boolean(
    game?.status === 'active'
    && user.status === 'active'
    && userColor
    && turnColor(game.current_fen) === userColor,
  );
  const gameAlert = useMemo(() => buildGameAlert(game), [game]);
  const showWinnerModal = Boolean(game?.status === 'completed' && dismissedWinnerGameId !== game.id);

  const applySocketGameUpdate = useCallback(({ game: updated, pendingBotMove, movedBy, movedByName, san }, { notifyMove = true } = {}) => {
    if (!updated) return;
    const lastMove = updated.moves?.at(-1);
    const eventKey = `${updated.id}:${updated.status}:${lastMove?.id || 'none'}:${pendingBotMove ? 'bot' : 'ready'}`;

    if (lastSocketGameRef.current === eventKey) return;
    lastSocketGameRef.current = eventKey;

    setGame((current) => {
      if (current?.status !== 'completed' && updated.status === 'completed') {
        notify?.('Game completed and moved to history.', 'success');
        queueMicrotask(() => refresh());
      }
      return updated;
    });

    if (notifyMove && movedBy !== undefined && movedBy !== user.id) {
      notify?.(`${movedByName || 'Opponent'} played ${san || 'a move'}.`, 'info');
    }

    setIsBotThinking(Boolean(pendingBotMove));
  }, [notify, refresh, user.id]);

  useEffect(() => {
    if (!selectedId) return;
    getGame(selectedId)
      .then((data) => {
        setAnalysis([]);
        setDismissedWinnerGameId(null);
        setGame(data.game);
      })
      .catch(() => {
        setAnalysis([]);
        setDismissedWinnerGameId(null);
        setGame(null);
      });
  }, [selectedId]);

  useEffect(() => {
    if (!selectedId || !getToken()) return undefined;
    const socket = io(SOCKET_URL, {
      auth: { token: getToken() },
      transports: SOCKET_TRANSPORTS,
      tryAllTransports: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 500,
      reconnectionDelayMax: 5000,
      timeout: 10000,
    });
    socketRef.current = socket;

    function joinCurrentGame() {
      socket.emit('game:join', { gameId: selectedId }, (response) => {
        if (response?.game) applySocketGameUpdate({ game: response.game }, { notifyMove: false });
        if (!response?.ok && response?.message) setMessage(response.message);
      });
    }

    function handleVisibilityChange() {
      if (document.visibilityState !== 'visible') return;
      if (!socket.connected) {
        socket.connect();
        return;
      }
      joinCurrentGame();
    }

    socket.on('connect', () => {
      console.info('[socket] connected', { id: socket.id, url: SOCKET_URL, transport: socket.io.engine.transport.name, configuredTransports: SOCKET_TRANSPORTS, gameId: selectedId });
      joinCurrentGame();
    });
    socket.io.on('reconnect', (attempt) => {
      console.info('[socket] reconnected', { id: socket.id, attempt, gameId: selectedId });
      socket.emit('socket:client-reconnect', { gameId: selectedId, attempt });
      joinCurrentGame();
    });
    socket.io.on('reconnect_attempt', (attempt) => {
      console.info('[socket] reconnect attempt', { attempt, gameId: selectedId });
    });
    socket.on('disconnect', (reason) => {
      console.info('[socket] disconnected', { reason, gameId: selectedId });
    });
    socket.on('connect_error', (error) => {
      console.info('[socket] connect error', { message: error.message, url: SOCKET_URL, configuredTransports: SOCKET_TRANSPORTS, gameId: selectedId });
    });
    socket.on('game:state', (payload) => applySocketGameUpdate(payload, { notifyMove: false }));
    socket.on('game:move-applied', (payload) => applySocketGameUpdate(payload));
    socket.on('game:bot-error', ({ message: errorMessage }) => {
      setIsBotThinking(false);
      setMessage(errorMessage || 'Bot move failed.');
    });
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [applySocketGameUpdate, selectedId]);

  async function handleJoinGame(id) {
    try {
      await joinGame(id);
      navigate(`/play/${id}`);
      socketRef.current?.emit('game:join', { gameId: id }, (response) => {
        if (response?.game) applySocketGameUpdate({ game: response.game }, { notifyMove: false });
      });
      setMessage('Game joined.');
      notify?.('Game joined.', 'success');
      refresh();
    } catch (error) {
      setMessage(error.message);
      notify?.(error.message, 'error');
    }
  }

  async function handleCloseGame() {
    if (!game) return;
    await handleCloseOpenGame(game.id);
  }

  async function handleCloseOpenGame(id) {
    try {
      await closeGame(id);
      setMessage('Game closed.');
      notify?.('Game closed.', 'success');
      if (String(id) === String(game?.id)) {
        setGame({ ...game, status: 'cancelled', result: 'abandoned', result_reason: 'closed_by_creator' });
      }
      refresh();
    } catch (error) {
      setMessage(error.message);
      notify?.(error.message, 'error');
    }
  }

  async function handleResignGame() {
    if (!game) return;
    try {
      const data = await resignGame(game.id);
      setMessage('You resigned the game.');
      notify?.('Game completed by resignation.', 'success');
      if (data.game) setGame(data.game);
      refresh();
    } catch (error) {
      setMessage(error.message);
      notify?.(error.message, 'error');
    }
  }

  async function handleAbortBotGame() {
    if (!game) return;
    try {
      await abortBotGame(game.id);
      setMessage('Bot game aborted.');
      notify?.('Bot game aborted.', 'success');
      setGame({ ...game, status: 'cancelled', result: 'abandoned', result_reason: 'bot_aborted' });
      refresh();
    } catch (error) {
      setMessage(error.message);
      notify?.(error.message, 'error');
    }
  }

  function handleBoardMove(move) {
    setMessage('');
    const previousGame = game;

    try {
      const chess = new Chess(game.current_fen);
      const played = chess.move({ from: move.from, to: move.to, promotion: move.promotion || undefined });
      if (played) {
        const optimisticMove = {
          id: `pending-${Date.now()}`,
          move_number: (game.moves?.length || 0) + 1,
          from_square: played.from,
          to_square: played.to,
          promotion: played.promotion || null,
          san: played.san,
          fen_after: chess.fen(),
          player_id: user.id,
          player_name: user.name,
        };

        setGame({
          ...game,
          current_fen: chess.fen(),
          pgn: chess.pgn(),
          moves: [...(game.moves || []), optimisticMove],
        });
      }
    } catch {
      // The server remains the source of truth for illegal or stale moves.
    }

    setIsBotThinking(isBotGame);
    socketRef.current?.emit('game:move', { gameId: selectedId, ...move }, (response) => {
      setMessage(response.ok ? 'Move saved.' : response.message);
      if (!response.ok) {
        setIsBotThinking(false);
        if (previousGame) setGame(previousGame);
        notify?.(response.message || 'Move failed.', 'error');
      }
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
      notify?.('Analysis complete.', 'success');
    } catch (error) {
      setMessage(error.message);
      notify?.(error.message, 'error');
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
            {isBotThinking && isBotGame && topColor === 'black' && (
              <span className={styles.thinkingBubble}>Bot is thinking</span>
            )}
          </div>

          {gameAlert && (
            <div className={`${styles.statusAlert} ${styles[gameAlert.type] || ''}`}>
              <strong>{gameAlert.title}</strong>
              <span>{gameAlert.body}</span>
            </div>
          )}

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
            {isBotThinking && isBotGame && bottomColor === 'black' && (
              <span className={styles.thinkingBubble}>Bot is thinking</span>
            )}
          </div>

          {showWinnerModal && (
            <div className={styles.winnerOverlay} role="dialog" aria-modal="true" aria-labelledby="winner-title">
              <div className={styles.winnerModal}>
                <p>{game.result_reason || 'Game complete'}</p>
                <h3 id="winner-title">{winnerText(game)}</h3>
                <span>{game.white_name || 'White'} vs {game.black_name || 'Black'}</span>
                <button onClick={() => setDismissedWinnerGameId(game.id)} type="button">Close</button>
              </div>
            </div>
          )}
        </div>

        <aside className={styles.sidePanel}>
          <div className={styles.panelHead}>
            <div>
              <h2>Live Game</h2>
              <p>{game ? `Game #${game.id} · ${game.status}` : selectedListGame ? `Game #${selectedListGame.id} · ${selectedListGame.status}` : 'Choose or create a game from Games'}</p>
            </div>
            <button className={styles.primary} onClick={() => navigate('/game')} type="button">Games</button>
          </div>

          {user.status !== 'active' && <p className={styles.notice}>Your account must be approved before you can play.</p>}
          <p className={styles.turnText}>
            {game ? `${userColor || 'Spectator'} view. ${isPlayable ? 'Your move: click a piece.' : `Waiting for ${turnColor(game.current_fen)}.`}` : selectedListGame ? `${selectedListGame.white_name || 'White'} vs ${selectedListGame.black_name || 'Waiting'}. Join this open game to play.` : 'Open Games, then choose a game to play.'}
          </p>
          {message && <p className={styles.notice}>{message}</p>}

          {game && (
            <div className={styles.actionPanel}>
              {canCloseGame && <button onClick={handleCloseGame} type="button">Close open game</button>}
              {canResignGame && <button onClick={handleResignGame} type="button">Resign</button>}
              {canAbortBotGame && <button onClick={handleAbortBotGame} type="button">Abort bot game</button>}
            </div>
          )}

          {canJoinSelectedGame && (
            <div className={styles.actionPanel}>
              <button onClick={() => handleJoinGame(selectedListGame.id)} type="button">Join game</button>
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

function buildGameAlert(game) {
  if (!game?.current_fen) return null;
  if (game.status === 'completed') {
    const isCheckmateFinish = game.result_reason === 'checkmate';
    return {
      type: game.result === 'draw' ? 'drawAlert' : 'mateAlert',
      title: game.result === 'draw' ? 'Draw' : isCheckmateFinish ? 'Checkmate' : 'Game over',
      body: winnerText(game),
    };
  }
  if (game.status === 'cancelled') {
    return { type: 'drawAlert', title: 'Game closed', body: game.result_reason || 'This game is no longer active.' };
  }

  try {
    const chess = new Chess(game.current_fen);
    if (chess.isCheckmate()) return { type: 'mateAlert', title: 'Checkmate', body: winnerText(game) };
    if (chess.isStalemate()) return { type: 'drawAlert', title: 'Stalemate', body: 'No legal moves. The game is drawn.' };
    if (chess.isDraw()) return { type: 'drawAlert', title: 'Draw', body: 'The position is drawn.' };
    if (chess.inCheck()) return { type: 'checkAlert', title: 'Check', body: `${turnColor(game.current_fen)} is in check.` };
  } catch {
    return null;
  }
  return null;
}

function winnerText(game) {
  if (!game) return 'Game complete';
  if (game.result === 'draw') return 'The game ended in a draw.';
  if (game.result === 'white_win') return `${game.white_name || 'White'} wins.`;
  if (game.result === 'black_win') return `${game.black_name || 'Black'} wins.`;
  if (game.result === 'abandoned') return 'The game was closed.';
  return 'Game complete.';
}
