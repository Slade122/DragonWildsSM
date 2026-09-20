# DragonWildsSM

Windows PowerShell management for a RuneScape: Dragonwilds dedicated server. It installs and updates Steam app `4019830`, creates the server configuration, manages startup and recovery through Scheduled Tasks, and provides a JSON health check.

## Before deployment

The target must have at least **25 GB free** on the selected install volume, 64-bit Windows, SteamCMD, and TCP/22 access for remote deployment. Dragonwilds uses UDP `7777`; forward that port on the edge firewall to the host for off-LAN friends.

`FarmSim25` currently has only 17.5 GB free on `C:`, so do not run the installer there until storage is expanded or an alternate volume is mounted.

## Quick start on the server

Run PowerShell as Administrator:

```powershell
git clone https://github.com/Slade122/DragonWildsSM.git C:\DragonWildsSM
Set-Location C:\DragonWildsSM
.\scripts\Install-DragonWildsServer.ps1 -InstallRoot E:\DragonWildsServer
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

## Network

Create an inbound Windows Firewall rule and a pfSense NAT/firewall rule for **UDP 7777** to the server's static LAN address. The application is public when `Public=1` in the generated `DedicatedServer.ini`.

## Deployment

`scripts\Deploy-ToFarmSim25.ps1` copies this repository to the target using OpenSSH, then runs the installer remotely. It defaults to `E:\DragonWildsServer` deliberately: use a volume with at least 25 GB free. Pass `-InstallRoot` with the actual prepared volume.
