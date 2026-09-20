# DragonWildsSM

LAN management for a RuneScape: Dragonwilds dedicated server. It installs and updates Steam app `4019830`, manages startup/recovery, and includes a password-protected React dashboard for configuration, updates, and live health.

## Before deployment

The target must have at least **25 GB free** on the selected install volume, 64-bit Windows, SteamCMD, and TCP/22 access for remote deployment. Dragonwilds uses UDP `7778` by default in this project, deliberately avoiding the existing server on FarmSim25's UDP `7777`; forward that port on the edge firewall to the host for off-LAN friends.

## Quick start on the server

Run PowerShell as Administrator:

```powershell
git clone https://github.com/Slade122/DragonWildsSM.git C:\DragonWildsSM
Set-Location C:\DragonWildsSM
.\scripts\Install-DragonWildsServer.ps1 -InstallRoot C:\DragonWildsServer
.\scripts\Configure-DragonWildsServer.ps1
.\scripts\Start-DragonWildsServer.ps1
.\scripts\Get-DragonWildsHealth.ps1
```

`Install-DragonWildsServer.ps1` downloads SteamCMD when necessary, validates the dedicated-server files, configures the firewall, and registers:

- `DragonWildsServer` — starts at boot as `SYSTEM`.
- `DragonWildsServerWatchdog` — runs every five minutes and restarts a stopped server.

## Operations

```powershell
# Apply an upstream update safely: stop, validate-update, start.
.\scripts\Update-DragonWildsServer.ps1

# Stop or start the game process.
.\scripts\Stop-DragonWildsServer.ps1
.\scripts\Start-DragonWildsServer.ps1

# Emit health as JSON; non-zero exit means unhealthy.
.\scripts\Get-DragonWildsHealth.ps1

# Run the watchdog once, or let its scheduled task handle it.
.\scripts\Monitor-DragonWildsServer.ps1
```

## Configuration and secrets

The tracked template is `config\ServerConfig.example.psd1`. Installation writes the active configuration to `C:\ProgramData\DragonWildsSM\config\ServerConfig.psd1`; passwords and the optional Steam owner ID live separately in `ServerSecrets.psd1` with Administrator/SYSTEM-only ACLs. Neither secret file belongs in Git.

`Configure-DragonWildsServer.ps1` requests the public server name, world name, optional world password, optional admin password, and optional SteamID64 owner. Leave a password blank for an open server.

## Web manager

Build the dashboard before deploying:

```powershell
Set-Location web
npm install
npm run build
```

Then install it on the server from elevated PowerShell:

```powershell
.\scripts\Install-WebManager.ps1 -DashboardPassword (Read-Host -AsSecureString)
```

The dashboard listens only on the LAN at `http://<server-LAN-IP>:8787`. It uses a local password stored as a PBKDF2 hash in `C:\ProgramData\DragonWildsSM\config\WebUiAuth.json`, inaccessible to normal users. The Windows Firewall rule is limited to `LocalSubnet`; do not expose this HTTP dashboard through pfSense or nginx.

The dashboard shows Dragonwilds process CPU, memory, virtual memory, storage, saves, network, logs, install paths, and every supported dedicated-server setting. It starts/stops/restarts the server, runs SteamCMD updates, makes safe world backups, and updates server/world/password settings. Password fields stay blank in the UI until explicitly changed.

Dragonwilds does not expose a server-side live-player query or RCON endpoint. The dashboard shows the game's compiled six-player capacity but labels live player count as unavailable rather than guessing.

## Network

Create an inbound Windows Firewall rule and a pfSense NAT/firewall rule for the configured UDP port (default **7778**) to the server's static LAN address. The application is public when `Public=1` in the generated `DedicatedServer.ini`.

## Deployment

`scripts\Deploy-ToFarmSim25.ps1` copies this repository to the target using OpenSSH, then runs the installer remotely. It defaults to `E:\DragonWildsServer` deliberately: use a volume with at least 25 GB free. Pass `-InstallRoot` with the actual prepared volume.
