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
```

## Setting up a machine

Requirements, from AJK's technical spec section 9.1:

- Windows 10 or above
- IIS enabled
- .NET Framework 4.5 or above
- Administrator rights
- Node.js LTS
- **POS ID and Access Code** for the fiscal component installer

Order matters — do the AJK component first, then this agent.

1. **Register the till machine.** POS registration records the **MAC address and local IP**
   of one specific machine (spec section 6.5). Moving to a new PC means updating that on
   the IRIS-AJK portal, or the machine will not be recognised.
2. **Install the AJK fiscal component** from the AJK-IRD portal, choosing the
   **Production** build. Confirm it answers:
   `curl http://localhost:8524/api/IMSFiscal/Get` → `["Service is responding"]`
   Replacing a sandbox install? Do **not** uninstall from Control Panel — run `Setup.exe`
   as administrator and choose **Remove** (spec section 17), or it leaves a broken install.
3. **Copy this folder** to the shop PC.
4. **Run the setup script** from an elevated PowerShell:
   ```powershell
   Set-ExecutionPolicy -Scope Process Bypass -Force
   .\install.ps1
   ```
5. **Open https://www.alliedsteel.store on that machine.** Invoicing should show the FBR
   service as online.

`install.ps1` installs dependencies, writes `.env`, registers the agent as a scheduled
task that starts with Windows and restarts if it stops, then verifies the agent answers,
the fiscal component answers, and Chrome's private-network preflight is allowed.

## Day to day

```powershell
Get-ScheduledTask  -TaskName AlliedSteelFbrAgent   # is it registered
Start-ScheduledTask -TaskName AlliedSteelFbrAgent
Stop-ScheduledTask  -TaskName AlliedSteelFbrAgent
.\install.ps1 -Uninstall                           # remove the task
Get-Content .\logs\agent.log -Tail 40
```

## Endpoints

| | |
|---|---|
| `GET /health` | agent alive |
| `GET /api/fbr/status` | is the AJK component on 8524 answering |
| `POST /api/fbr/preview` | build the AJK payload without sending it |
| `POST /api/fbr/submit` | local component first, cloud if it is down |
| `POST /api/fbr/submit-cloud` | straight to AJK's cloud endpoint |

`/preview` is the one to reach for when a submission is rejected — it shows the exact JSON
without filing anything.

## Two things that catch people out

**The PC has to stay on.** If it is off, or someone stops the task, invoicing stops. Not a
laptop that goes home.

**Chrome or Edge, not Safari.** Safari refuses an HTTPS page calling `localhost` outright.
Chrome allows it only because this agent answers the private-network preflight — see the
middleware at the top of `index.js`, which must stay ahead of `cors()`.

## Configuration

`config/fbr.js` holds the POS ID and the AJK tokens. `FBR_ENV` in `.env` selects sandbox
or production for the **cloud fallback**, and must match the build of the fiscal component
installed on the machine.
