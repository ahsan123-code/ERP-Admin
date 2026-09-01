const fs   = require('fs');
const path = require('path');

/**
 * Tees console output to logs/agent.log.
 *
 * The agent runs as a scheduled task with no console attached, so without this
 * everything it says — including why a filing was rejected — goes nowhere. Task
 * Scheduler can only tell you the process exited, never what it was complaining
 * about. Writing the file from inside the process also means the .exe needs no
 * cmd.exe wrapper to capture its own output.
 */

const MAX_BYTES = 5 * 1024 * 1024;

function attach(dir) {
  const logDir = dir || path.join(baseDir(), 'logs');
  const file   = path.join(logDir, 'agent.log');

  try {
    fs.mkdirSync(logDir, { recursive: true });
    rotateIfLarge(file);
  } catch (err) {
    console.error(`[log] could not open ${file}: ${err.message}`);
    return null;
  }

  const stream = fs.createWriteStream(file, { flags: 'a' });
  // A logger that throws takes the agent down with it, which is the opposite of
  // what it is for. A disk that fills up should cost you the log, nothing else.
  stream.on('error', () => {});

  for (const level of ['log', 'warn', 'error']) {
    const original = console[level].bind(console);
    console[level] = (...args) => {
      original(...args);
      const line = args
        .map(a => (typeof a === 'string' ? a : safeStringify(a)))
        .join(' ');
      stream.write(`${new Date().toISOString()} [${level}] ${line}\n`);
    };
  }

  return file;
}

function safeStringify(value) {
  try { return JSON.stringify(value); } catch { return String(value); }
}

function rotateIfLarge(file) {
  try {
    if (fs.statSync(file).size > MAX_BYTES) {
      fs.renameSync(file, `${file}.1`);
    }
  } catch {
    // No file yet, which is the normal first run.
  }
}

/**
 * Where the agent's own files live. Packaged as a single .exe there is no
 * __dirname on disk to speak of, so everything hangs off the executable.
 */
function baseDir() {
  return isPackaged() ? path.dirname(process.execPath) : path.join(__dirname, '..');
}

function isPackaged() {
  try {
    return require('node:sea').isSea();
  } catch {
    return false;
  }
}

module.exports = { attach, baseDir, isPackaged };
