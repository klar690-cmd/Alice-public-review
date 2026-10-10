# Open the updated Alice browser App — R271

## Working local address

[Open Alice](http://127.0.0.1:1448/docs/alice/v2/m3g/Alice-browser.html)

This address works on the Windows computer running this checkout/server. It is loopback only, not a public, LAN or mobile link. The task leaves its own server running after verification.

## Reopen and stop

Double-click **Open-Alice.cmd** in this directory, or run this one Windows command:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:/Projetos/RumoAoMilhao-ASSISTENTE/.local/r271/alice/docs/alice/v2/m3g/Open-Alice.ps1" -Action start
```

The launcher uses the already installed Node/Vite, starts a hidden process bound to `127.0.0.1:1448`, and prints the address. It refuses a port owned by another process and installs nothing. Its own PID/logs are kept in the ignored `.runtime` directory here.

To stop **only this launcher's server**:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:/Projetos/RumoAoMilhao-ASSISTENTE/.local/r271/alice/docs/alice/v2/m3g/Open-Alice.ps1" -Action stop
```

Use `-Action status` for a read-only check. The stop action verifies the recorded PID's exact Vite path, port and loopback arguments before stopping; it never stops the original app or other preview servers. ExecutionPolicy Bypass applies only to this PowerShell process; no Windows policy setting is modified.

## Click through the real App

1. Home opens first. Enter the preferred name on first opening.
2. Click **Agentes e ligações**, the network icon beside the original left navigation. The original Accounts tab remains available.
3. Select GG or another node; use **+ Adicionar agente** for another logical worker.
4. At **Qual IA será este agente?**, choose the existing provider/company: OpenAI/Codex, Anthropic/Claude Code, Google Antigravity or another registry option.
5. At **Como deseja conectar?**, choose **Usar API** or **Entrar com conta**. The selected preference is highlighted. Account connection is not integrated; API integration is pending and no key is requested.
6. Return to GG to see its independent preference. Projects, local profiles and teams have separate configurations; return to the same project/team and select the intended agent. A newly added review node must have its required input connected before the existing graph validator allows saving.
7. Use the normal **Menu → Escolher tema** for Original/Elite Indigo or Creme & Rosé. Use the house icon or **Voltar à Home** to return.

Team preferences remain saved only in the current App session, as the existing UI states. Reloading resets those in-memory agent/team drafts; it does not log in or run an agent. The browser adapter keeps local name/workspace/profile metadata in this origin's browser storage.

## Optional offline HTML

**Alice-V2-preview.html** is a single-file build of the **same App**, not a separately coded editor. Open it directly in Chrome with `file://` or by double-clicking. It includes the application JS/CSS/assets and is about 31.5 MB. The file:// click test is recorded separately. It uses a separate browser storage origin from localhost.

Source candidate: **7c61693a0345252996a7f4f6ed673e639ce14fb0**. Browser host: `Alice-browser.html → src/preview/main.tsx → src/main.tsx → App`, with the normal `useAliceV2Navigation` project/profile route and no mainOverride/alternate store or cloned editor. The former preview entry used a fixed external M2 store; it is retained untouched and is not the recommended address for R271.

This is the actual Alice frontend with its existing browser-only local adapter. Native PTY/filesystem/provider services are unavailable in browser mode and original preview safety notices remain visible. Existing sample account metadata is not a live account. No provider authentication, keys, native agent, n8n, paid request, public deployment or Windows build is performed. These limits are different from a detached visual mock: the same existing App/components and their real UI preference state are exercised.
