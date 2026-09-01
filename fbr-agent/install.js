const fs   = require('fs');
const os   = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const axios = require('axios');
const { baseDir, isPackaged } = require('./utils/logger');

/**
 * Registers the agent with Task Scheduler so it comes back on its own.
 *
 * Lives in the agent rather than only in install.ps1 because the packaged .exe has
 * to be able to set itself up: the shop PC is not expected to have Node, PowerShell
 * execution policy set, or anyone present who knows what either of those are.
 */

const TASK_NAME = 'AlliedSteelFbrAgent';
const PORT      = parseInt(process.env.PORT || '4000', 10);

const c = {
  cyan:  s => `\x1b[36m${s}\x1b[0m`,
  green: s => `\x1b[32m${s}\x1b[0m`,
  amber: s => `\x1b[33m${s}\x1b[0m`,
  red:   s => `\x1b[31m${s}\x1b[0m`,
};
const say  = m => console.log(`  ${m}`);
const ok   = m => console.log(`  ${c.green('[ ok ]')} ${m}`);
const warn = m => console.log(`  ${c.amber('[warn]')} ${m}`);
const bad  = m => console.log(`  ${c.red('[fail]')} ${m}`);

function isElevated() {
  try {
    execFileSync('net', ['session'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Task XML rather than schtasks flags, because the flags cannot express the two
 * things this task actually needs: a second trigger, and restart-on-failure.
 *
 * Two triggers is the point. A boot trigger alone looks right and mostly works, but
 * Windows Fast Startup turns a nightly shutdown into a hibernate, and a machine that
 * resumes instead of booting may never fire BootTrigger. The shop switches this PC off
 * every evening, so that is the normal case here, not an edge one. The logon trigger
 * catches it; IgnoreNew keeps the pair from starting two agents on a real cold boot.
 */
function taskXml(command, args, workingDir) {
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Description>Relays ERP invoices to the AJK-IRD fiscal component on this machine, and files any raised while it was switched off.</Description>
  </RegistrationInfo>
  <Triggers>
    <BootTrigger>
      <Enabled>true</Enabled>
      <Delay>PT30S</Delay>
    </BootTrigger>
    <LogonTrigger>
      <Enabled>true</Enabled>
      <Delay>PT15S</Delay>
    </LogonTrigger>
  </Triggers>
  <Principals>
    <Principal id="Author">
      <UserId>S-1-5-18</UserId>
      <RunLevel>HighestAvailable</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <AllowHardTerminate>true</AllowHardTerminate>
    <StartWhenAvailable>true</StartWhenAvailable>
    <RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable>
    <IdleSettings>
      <StopOnIdleEnd>false</StopOnIdleEnd>
      <RestartOnIdle>false</RestartOnIdle>
    </IdleSettings>
    <AllowStartOnDemand>true</AllowStartOnDemand>
    <Enabled>true</Enabled>
    <Hidden>false</Hidden>
    <RunOnlyIfIdle>false</RunOnlyIfIdle>
    <WakeToRun>false</WakeToRun>
    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>
    <Priority>7</Priority>
    <RestartOnFailure>
      <Interval>PT1M</Interval>
      <Count>999</Count>
    </RestartOnFailure>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>${esc(command)}</Command>
      ${args ? `<Arguments>${esc(args)}</Arguments>` : ''}
      <WorkingDirectory>${esc(workingDir)}</WorkingDirectory>
    </Exec>
  </Actions>
</Task>`;
}

function schtasks(args, quiet = false) {
  return execFileSync('schtasks', args, { stdio: quiet ? 'pipe' : 'inherit', encoding: 'utf8' });
}

function taskExists() {
  try {
    execFileSync('schtasks', ['/Query', '/TN', TASK_NAME], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function get(url, opts = {}) {
  return axios.get(url, { timeout: 5000, ...opts });
}

async function install() {
  const dir = baseDir();

  console.log('');
  console.log(c.cyan('  Allied Steel Center - FBR fiscal agent'));
  console.log(c.cyan('  ======================================'));
  console.log('');

  if (os.platform() !== 'win32') { bad('This installer only runs on Windows.'); return 1; }
  if (!isElevated()) {
    bad('Administrator rights are required.');
    say('Right-click this file and choose "Run as administrator", then try again.');
    return 1;
  }

  // --- .env -------------------------------------------------------------------------
  const envFile    = path.join(dir, '.env');
  const envExample = path.join(dir, '.env.example');
  if (fs.existsSync(envFile)) {
    ok('.env already present - left untouched.');
  } else if (fs.existsSync(envExample)) {
    fs.copyFileSync(envExample, envFile);
    ok('Created .env from .env.example.');
    warn('If the fiscal component installed here is the SANDBOX build, set FBR_ENV=sandbox.');
  } else {
    warn('No .env or .env.example found - the agent will run on its built-in defaults.');
  }

  // --- register ---------------------------------------------------------------------
  // Packaged, the task runs the .exe directly. From source it has to go through
  // whichever node is on PATH, pointed at index.js.
  const command = process.execPath;
  const args    = isPackaged() ? '' : `"${path.join(dir, 'index.js')}"`;

  const xmlPath = path.join(os.tmpdir(), `${TASK_NAME}.xml`);
  // schtasks /XML reads UTF-16; handing it UTF-8 fails with an unhelpful parse error.
  fs.writeFileSync(xmlPath, '﻿' + taskXml(command, args, dir), 'utf16le');

  try {
    if (taskExists()) {
      try { schtasks(['/End', '/TN', TASK_NAME], true); } catch { /* not running */ }
      say('Replacing the existing task.');
    }
    schtasks(['/Create', '/TN', TASK_NAME, '/XML', xmlPath, '/F'], true);
    ok(`Registered '${TASK_NAME}' - starts at boot AND at log on.`);
  } catch (err) {
    bad(`Could not register the scheduled task: ${err.message}`);
    return 1;
  } finally {
    try { fs.unlinkSync(xmlPath); } catch { /* best effort */ }
  }

  try {
    schtasks(['/Run', '/TN', TASK_NAME], true);
    say('Starting the agent...');
  } catch (err) {
    warn(`Could not start the task now: ${err.message}`);
  }

  // --- verify -----------------------------------------------------------------------
  let up = false;
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 1000));
    try {
      const r = await get(`http://localhost:${PORT}/health`);
      if (r.data && r.data.status === 'ok') { up = true; break; }
    } catch { /* still starting */ }
  }
  if (!up) {
    bad(`The agent did not answer on port ${PORT}.`);
    say(`Check the log: ${path.join(dir, 'logs', 'agent.log')}`);
    return 1;
  }
  ok(`Agent answering on http://localhost:${PORT}`);

  try {
    const s = await get(`http://localhost:${PORT}/api/fbr/status`, { timeout: 10000 });
    if (s.data && s.data.online) {
      ok('AJK fiscal component is online (port 8524).');
    } else {
      warn('AJK fiscal component did NOT answer on port 8524.');
      say('Install it from the AJK-IRD portal, then check:');
      say('    curl http://localhost:8524/api/IMSFiscal/Get');
    }
  } catch (err) {
    warn(`Could not read /api/fbr/status: ${err.message}`);
  }

  try {
    const q = await get(`http://localhost:${PORT}/api/fbr/queue`, { timeout: 10000 });
    const d = q.data || {};
    if (!d.configured) {
      warn('SUPABASE_URL / SUPABASE_KEY are not set in .env.');
      say('Invoices raised while this PC is off will NOT be filed automatically.');
    } else if (d.pending != null) {
      ok(`Auto-filing on - ${d.pending} invoice(s) waiting, checked every ${d.intervalMinutes} min.`);
    } else {
      ok('Auto-filing on.');
    }
  } catch (err) {
    warn(`Could not read the queue: ${err.message}`);
  }

  // Chrome refuses an HTTPS page -> localhost call unless the agent opts in. Ask exactly
  // what the browser asks, so a missing header is caught here and not by a blank screen.
  try {
    const pre = await axios({
      method: 'OPTIONS',
      url: `http://localhost:${PORT}/api/fbr/submit`,
      timeout: 5000,
      headers: {
        'Origin':                                 'https://www.alliedsteel.store',
        'Access-Control-Request-Method':          'POST',
        'Access-Control-Request-Private-Network': 'true',
      },
      validateStatus: () => true,
    });
    if (pre.headers['access-control-allow-private-network'] === 'true') {
      ok('Chrome private-network preflight allowed.');
    } else {
      warn('Private-network header missing - Chrome will block the ERP from reaching this agent.');
    }
  } catch (err) {
    warn(`Preflight check failed: ${err.message}`);
  }

  console.log('');
  console.log(c.cyan('  Done. Open https://www.alliedsteel.store on THIS machine and check'));
  console.log(c.cyan('  that Invoicing shows the FBR service as online.'));
  console.log('');
  say(`log     : ${path.join(dir, 'logs', 'agent.log')}`);
  say(`stop    : schtasks /End /TN ${TASK_NAME}`);
  say(`start   : schtasks /Run /TN ${TASK_NAME}`);
  say('remove  : run this again with --uninstall');
  console.log('');
  return 0;
}

async function uninstall() {
  console.log('');
  if (!isElevated()) { bad('Administrator rights are required.'); return 1; }
  if (!taskExists()) { say(`No task named '${TASK_NAME}' was registered.`); return 0; }
  try { schtasks(['/End', '/TN', TASK_NAME], true); } catch { /* not running */ }
  schtasks(['/Delete', '/TN', TASK_NAME, '/F'], true);
  ok(`Removed scheduled task '${TASK_NAME}'. The folder and .env are left in place.`);
  console.log('');
  return 0;
}

module.exports = { install, uninstall, TASK_NAME, taskExists };
