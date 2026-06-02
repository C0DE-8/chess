const { spawn } = require('child_process');

const STOCKFISH_PATH = process.env.STOCKFISH_PATH;
const ENGINE_TIMEOUT_MS = Number(process.env.STOCKFISH_TIMEOUT_MS || 2500);

const LEVEL_OPTIONS = {
  newbie: { depth: 1, movetime: 120, skill: 0 },
  beginner: { depth: 3, movetime: 180, skill: 3 },
  novice: { depth: 5, movetime: 260, skill: 6 },
  intermediate: { depth: 8, movetime: 420, skill: 10 },
  advanced: { depth: 11, movetime: 650, skill: 15 },
};

function stockfishAvailable() {
  return Boolean(STOCKFISH_PATH);
}

async function bestMove(fen, level = 'beginner') {
  if (!stockfishAvailable()) throw new Error('Stockfish is not configured.');
  const options = LEVEL_OPTIONS[level] || LEVEL_OPTIONS.beginner;
  const lines = [];

  return runStockfish((engine, resolve, reject) => {
    let best = null;

    engine.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      lines.push(text);

      for (const line of text.split(/\r?\n/)) {
        if (line.startsWith('bestmove ')) {
          best = line.split(/\s+/)[1];
          resolve(best && best !== '(none)' ? best : null);
        }
      }
    });

    engine.stdin.write('uci\n');
    engine.stdin.write(`setoption name Skill Level value ${options.skill}\n`);
    engine.stdin.write('isready\n');
    engine.stdin.write(`position fen ${fen}\n`);
    engine.stdin.write(`go depth ${options.depth} movetime ${options.movetime}\n`);

    engine.on('error', reject);
  }, { lines });
}

async function evaluateFen(fen, depth = 8) {
  if (!stockfishAvailable()) throw new Error('Stockfish is not configured.');
  const lines = [];

  return runStockfish((engine, resolve, reject) => {
    let latest = null;
    let best = null;

    engine.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      lines.push(text);

      for (const line of text.split(/\r?\n/)) {
        if (line.includes(' score ')) {
          latest = parseScore(line);
        }
        if (line.startsWith('bestmove ')) {
          best = line.split(/\s+/)[1];
          resolve({ ...latest, bestMove: best && best !== '(none)' ? best : null });
        }
      }
    });

    engine.stdin.write('uci\n');
    engine.stdin.write('isready\n');
    engine.stdin.write(`position fen ${fen}\n`);
    engine.stdin.write(`go depth ${depth}\n`);

    engine.on('error', reject);
  }, { lines });
}

function runStockfish(work, debug = {}) {
  return new Promise((resolve, reject) => {
    const engine = spawn(STOCKFISH_PATH);
    const timeout = setTimeout(() => {
      engine.kill();
      reject(new Error(`Stockfish timed out after ${ENGINE_TIMEOUT_MS}ms`));
    }, ENGINE_TIMEOUT_MS);

    function finish(value, isError = false) {
      clearTimeout(timeout);
      engine.kill();
      if (isError) reject(value);
      else resolve(value);
    }

    engine.on('error', (error) => finish(error, true));
    work(engine, (value) => finish(value), (error) => finish(error, true), debug);
  });
}

function parseScore(line) {
  const cp = line.match(/\bscore cp (-?\d+)/);
  if (cp) return { type: 'cp', value: Number(cp[1]) };

  const mate = line.match(/\bscore mate (-?\d+)/);
  if (mate) return { type: 'mate', value: Number(mate[1]) };

  return null;
}

module.exports = {
  bestMove,
  evaluateFen,
  stockfishAvailable,
};
