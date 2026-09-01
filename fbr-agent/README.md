# FBR Fiscal Agent

Relays invoices from the ERP to AJK-IRD. Runs on the **shop PC**, beside the AJK fiscal
component, and is what the Invoicing screen talks to.

The ERP itself is hosted (https://www.alliedsteel.store) and its built JavaScript calls
`http://localhost:4000`. That resolves to whichever machine the browser is on, so
invoicing works on the PC running this agent and nowhere else. That is deliberate: the
AJK fiscal component is licensed to one registered till machine.

```
Browser on the shop PC
  → http://localhost:4000        this agent
    → http://localhost:8524      AJK fiscal component  (preferred)
    → https://gw.fbr.gov.pk/…    AJK cloud endpoint    (fallback, if 8524 is down)

Supabase ──→ this agent, on a timer: files anything raised while the PC was off
```

## The shop PC gets switched off

It is turned off after office hours, and that is fine. The agent holds no data — it is a
messenger, and it only matters at the moment an invoice is filed.

Two things make that safe:

**It comes back on its own.** The scheduled task has *two* triggers, at boot and at logon.
A boot trigger alone looks sufficient but Windows Fast Startup turns a nightly shutdown
into a hibernate, and a machine that resumes rather than boots may never fire it. Since
this PC is switched off every evening, that is the normal case here, not an edge one.

**Nothing raised overnight is lost.** Staff can raise an invoice from any machine at any
time; it lands in the database as `fbr_status = 'pending'`. The agent drains that backlog
by itself — once shortly after it starts, then every few minutes — and the Invoicing
screen says how many are waiting. See [Auto-filing](#auto-filing).

## Setting up a machine

Requirements, from AJK's technical spec section 9.1:

- Windows 10 or above
- IIS enabled
- .NET Framework 4.5 or above
- Administrator rights
- **POS ID and Access Code** for the fiscal component installer
- Node.js LTS — *only if installing from source; `fbr-agent.exe` has Node inside it*

Order matters — do the AJK component first, then this agent.

1. **Register the till machine.** POS registration records the **MAC address and local IP**
   of one specific machine (spec section 6.5). Moving to a new PC means updating that on
   the IRIS-AJK portal, or the machine will not be recognised.
2. **Install the AJK fiscal component** from the AJK-IRD portal, choosing the
   **Production** build. Confirm it answers:
   `curl http://localhost:8524/api/IMSFiscal/Get` → `["Service is responding"]`
   Replacing a sandbox install? Do **not** uninstall from Control Panel — run `Setup.exe`
   as administrator and choose **Remove** (spec section 17), or it leaves a broken install.
3. **Copy `dist\` to the shop PC**, somewhere permanent — `C:\AlliedSteel\fbr-agent` is a
   good place. Not the Desktop, not Downloads.
4. **Double-click `Install FBR Agent.cmd`.** It asks Windows for administrator rights
   itself, so there is no right-click menu to explain to anyone.
5. **Open https://www.alliedsteel.store on that machine.** Invoicing should show the FBR
   service as online.

The installer writes `.env`, registers the scheduled task, then checks the whole path the
ERP depends on: the agent answers, the fiscal component answers, the database is reachable,
and Chrome's private-network preflight is allowed. It is safe to run again at any time.

### POS identity

`FBR_POS_ID` in `.env` must match the POS ID this machine is registered under, because it is
sent as `POSID` on every invoice. Getting it wrong does not fail loudly — it files real
invoices against another registration.

`FBR_PRODUCTION_TOKEN` is the token AJK issue at POS registration, found under the POS
Clients menu on the IRIS-AJK portal. **It is not the Access Code**, which is typed into the
fiscal component's installer once and never sent to the API. Only the cloud endpoint uses
the token; the local component on 8524 authenticates from its own installation, so a machine
filing through the component works without it.

With `FBR_POS_ID` set and `FBR_PRODUCTION_TOKEN` blank, cloud filing is refused rather than
falling back to the built-in token, which belongs to a different POS ID.

### From source instead

```powershell
Set-ExecutionPolicy -Scope Process Bypass -Force
.\install.ps1
```

Needs Node.js LTS. `install.ps1` is a wrapper around `node index.js --install`; the
registration itself lives in `install.js` so the packaged `.exe` sets itself up exactly the
same way.

## Building the executable

On a development machine with Node and internet access:

```powershell
.\build.ps1
```

esbuild flattens the agent and its dependencies into one script, Node's
single-executable-application support turns that into a blob, and postject writes the blob
into a copy of `node.exe`. Out comes `dist\` — an 80 MB `fbr-agent.exe` plus the two `.cmd`
files, `.env.example` and a plain-English `README.txt` for whoever is at the shop.

`dist\` and `build\` are not in the repository. The executable is a release artefact.

> postject warns `The signature seems corrupted!` unless `signtool.exe` is on PATH. That is
> expected — it is `node.exe`'s own Authenticode signature, which no longer covers the
> modified bytes. `build.ps1` strips it first when signtool is available. Copy the folder to
> the shop PC over the network or by USB rather than downloading it in a browser, or
> SmartScreen will have opinions about an unsigned executable.

## Auto-filing

Configured in `.env` — see `.env.example` for every setting.

| | |
|---|---|
| `QUEUE_ENABLED` | `false` goes back to pressing Submit by hand |
| `QUEUE_INTERVAL_MINUTES` | how often to look for waiting invoices (default 5) |
| `QUEUE_MAX_RETRIES` | give up on an invoice after this many attempts (default 5) |
| `QUEUE_REQUIRE_LOCAL` | `true` waits for the fiscal component rather than filing via the cloud |
| `SUPABASE_URL` / `SUPABASE_KEY` | the publishable key, the same one the website uses |

Every attempt writes a row to `fbr_submission_log`, which is the audit trail for everything
filed while nobody was watching — which is most of what this does.

`QUEUE_REQUIRE_LOCAL` is left `true` on purpose. AJK register a POS against one till machine
and the local component is the path they nominate, so when it is not answering the queue
waits for the next pass instead of filing around it.

**Keep `QUEUE_ENABLED=false` in the development `.env`.** With it on, running the agent on a
developer machine files real pending invoices to AJK production from a machine that is not
the registered till.

## Day to day

```powershell
fbr-agent.exe --status       # registered? running? how many invoices waiting?
fbr-agent.exe --install      # re-run all the checks; safe any time
fbr-agent.exe --uninstall    # remove the scheduled task

schtasks /Query /TN AlliedSteelFbrAgent
schtasks /Run   /TN AlliedSteelFbrAgent
schtasks /End   /TN AlliedSteelFbrAgent
Get-Content .\logs\agent.log -Tail 40
```

From source, `node index.js --status` and friends do the same.

## Endpoints

| | |
|---|---|
| `GET /health` | agent alive |
| `GET /api/fbr/status` | is the AJK component on 8524 answering |
| `GET /api/fbr/queue` | how many invoices are waiting, and what the last run did |
| `POST /api/fbr/queue/run` | file the backlog now instead of waiting for the timer |
| `POST /api/fbr/preview` | build the AJK payload without sending it |
| `POST /api/fbr/submit` | local component first, cloud if it is down |
| `POST /api/fbr/submit-cloud` | straight to AJK's cloud endpoint |

`/preview` is the one to reach for when a submission is rejected — it shows the exact JSON
without filing anything.

## Two things that catch people out

**Chrome or Edge, not Safari.** Safari refuses an HTTPS page calling `localhost` outright.
Chrome allows it only because this agent answers the private-network preflight — see the
middleware at the top of `index.js`, which must stay ahead of `cors()`.

**Invoicing is tied to this one machine.** Everything else in the ERP works from anywhere.
If the PC is off, invoices are still raised normally; they are filed when it is next on.

## Configuration

`config/fbr.js` holds the POS ID and the AJK tokens. `FBR_ENV` in `.env` selects sandbox
or production for the **cloud fallback**, and must match the build of the fiscal component
installed on the machine.
