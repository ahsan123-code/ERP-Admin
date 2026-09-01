const path = require('path');
const logger = require('./utils/logger');

// Packaged as a single .exe there is no source tree to resolve .env against, and the
// scheduled task's working directory is not somewhere dotenv would guess. Both cases
// want the same answer: the folder the executable sits in.
require('dotenv').config({ path: path.join(logger.baseDir(), '.env') });

const express = require('express');
const cors    = require('cors');
const fbrRoutes = require('./routes/fbr');
const queue     = require('./services/queue');

const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'https://erp-admin-pearl.vercel.app',
  'https://www.alliedsteel.store',
  'https://alliedsteel.store',
];

function serve() {
  const logFile = logger.attach();
  const app  = express();
  const PORT = process.env.PORT || 4000;

  // Must come before cors(): cors() answers the preflight and ends the response, so a
  // handler registered after it never sees the OPTIONS request.
  //
  // The ERP is served over HTTPS from alliedsteel.store while this agent answers on plain
  // http://localhost. Chrome treats that as a private-network request and asks the target
  // to opt in first, via a preflight carrying Access-Control-Request-Private-Network.
  // cors() knows nothing about that header; without this reply Chrome blocks every call and
  // the Invoicing page reads the fiscal service as offline however healthy it is.
  app.use((req, res, next) => {
    if (req.headers['access-control-request-private-network']) {
      res.setHeader('Access-Control-Allow-Private-Network', 'true');
    }
    next();
  });

  app.use(cors({ origin: ALLOWED_ORIGINS }));
  app.use(express.json());
  app.use('/api/fbr', fbrRoutes);
  app.get('/health', (req, res) => res.json({ status: 'ok' }));

  app.listen(PORT, () => {
    console.log(`FBR agent listening on http://localhost:${PORT}`);
    console.log(`FBR env: ${process.env.FBR_ENV || 'sandbox'}`);
    console.log(`POS ID:  ${require('./config/fbr').POS_ID}`);
    if (logFile) console.log(`Log:     ${logFile}`);
    queue.start();
  });

  // Task Scheduler stops the task by signalling the process. Leaving the interval
  // running through a shutdown is how you get a filing half-written to the database.
  for (const sig of ['SIGINT', 'SIGTERM']) {
    process.on(sig, () => {
      console.log(`Received ${sig} — shutting down.`);
      queue.stop();
      process.exit(0);
    });
  }
}

async function status() {
  const { TASK_NAME, taskExists } = require('./install');
  const axios = require('axios');
  const PORT = process.env.PORT || 4000;

  console.log('');
  console.log(`  Scheduled task '${TASK_NAME}': ${taskExists() ? 'registered' : 'NOT registered'}`);
  try {
    const h = await axios.get(`http://localhost:${PORT}/health`, { timeout: 3000 });
    console.log(`  Agent on port ${PORT}     : ${h.data.status === 'ok' ? 'running' : 'unexpected reply'}`);
  } catch {
    console.log(`  Agent on port ${PORT}     : not answering`);
  }
  try {
    const s = await axios.get(`http://localhost:${PORT}/api/fbr/status`, { timeout: 8000 });
    console.log(`  AJK component (8524)   : ${s.data.online ? 'online' : 'offline'}`);
  } catch {
    console.log('  AJK component (8524)   : could not check');
  }
  try {
    const q = await axios.get(`http://localhost:${PORT}/api/fbr/queue`, { timeout: 8000 });
    const d = q.data || {};
    console.log(`  Invoices waiting       : ${d.configured ? d.pending : 'database not configured'}`);
    if (d.lastRun) console.log(`  Last run               : ${JSON.stringify(d.lastRun)}`);
  } catch {
    console.log('  Invoices waiting       : could not check');
  }
  console.log('');
}

function help() {
  console.log(`
  Allied Steel Center - FBR fiscal agent

    (no arguments)   run the agent
    --install        register it to start with Windows, then check everything works
    --uninstall      remove the scheduled task
    --status         is it registered, running, and how many invoices are waiting
    --help           this
`);
}

async function main() {
  const arg = (process.argv[2] || '').replace(/^-+/, '').toLowerCase();

  switch (arg) {
    case 'install':   process.exitCode = await require('./install').install();   break;
    case 'uninstall': process.exitCode = await require('./install').uninstall(); break;
    case 'status':    await status();                                            break;
    case 'help':      help();                                                    break;
    case '':          serve();                                                   break;
    default:
      console.error(`  Unknown option: ${process.argv[2]}`);
      help();
      process.exitCode = 1;
  }

  // Double-clicked in Explorer, a console window would close before any of this could
  // be read. Anything interactive holds the window open; the agent itself never gets
  // here because serve() does not return.
  if (arg && process.stdout.isTTY) {
    console.log('  Press Enter to close.');
    process.stdin.resume();
    process.stdin.once('data', () => process.exit(process.exitCode || 0));
  }
}

main();
