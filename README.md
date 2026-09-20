# DragonWildsSM

A self-hosted Windows manager for the RuneScape: Dragonwilds dedicated server. It installs Steam app `4019830`, manages startup and recovery, performs scheduled updates, creates world backups, and provides a password-protected React dashboard.

Dragonwilds publishes server and world names with a 16-character limit. Changing the world name selects or creates a different save; it does not rename an existing world.

## Features

- Interactive installer with configurable game, SteamCMD, and backup locations
- Configurable game port, server/world names, owner SteamID64, and passwords
- Custom dashboard title, subtitle, host label, accent color, port, and access scope
- Automatic startup and five-minute watchdog tasks
- Hourly-by-default Steam build checks with a configurable shutdown grace period
- Safe save backups to any local drive or UNC path available to `SYSTEM`
- Process, player connections, network, CPU, memory, disk, save, update, and log monitoring
- LAN-restricted dashboard firewall rule by default

## Requirements

- 64-bit Windows with PowerShell 5.1 or newer
- Administrator access
- At least 25 GB free on the selected game volume
- Internet access for SteamCMD and Node.js downloads
- UDP access to the configured game port

## Install

Clone the repository wherever you want the manager installed, then launch the browser-based setup from an elevated PowerShell window:

```powershell
git clone https://github.com/Slade122/DragonWildsSM.git D:\Tools\DragonWildsSM
Set-Location D:\Tools\DragonWildsSM
.\Install.ps1
```

`Install.ps1` installs the local Node runtime, registers the manager service, opens `http://localhost:8787`, and detects that no server has been installed. The first-run wizard then configures:

- Game, SteamCMD, and backup locations
- Existing-server detection with an option to skip SteamCMD installation
- Game and dashboard ports
- Dashboard bind address and Windows Firewall scope
- Server/world names, public visibility, and owner SteamID64
- World, admin, and dashboard passwords
- Automatic-update interval and shutdown grace period
- Dashboard title, subtitle, host label, and accent color

Every option can also be supplied non-interactively, which bypasses the browser wizard:

```powershell
.\Install.ps1 `
  -InstallRoot 'D:\GameServers\Dragonwilds' `
  -BackupRoot '\\nas\game-backups\dragonwilds' `
  -SteamCmdPath 'D:\SteamCMD\steamcmd.exe' `
  -GamePort 7777 `
  -ServerName 'Weekend Wilds' `
  -WorldName 'Valhalla' `
  -OwnerId '76561198000000000' `
  -UpdateCheckHours 2 `
  -UpdateGraceMinutes 15 `
  -WebPort 8787 `
  -ManagerTitle 'Weekend Wilds' `
  -ManagerSubtitle 'Private clan realm' `
  -HostDisplayName 'Game Server 01' `
  -AccentColor '#c98b3c' `
  -WorldPassword (Read-Host -AsSecureString) `
  -AdminPassword (Read-Host -AsSecureString) `
  -DashboardPassword (Read-Host -AsSecureString)
```

The manager location is simply the directory where the repository is cloned. The game and backup locations are independent and may use different volumes.

## Remote deployment

`Deploy-ToServer.ps1` supports any OpenSSH-accessible Windows host:

```powershell
.\scripts\Deploy-ToServer.ps1 `
  -HostName game-server `
  -ManagerRoot 'D:\Tools\DragonWildsSM' `
  -InstallRoot 'E:\GameServers\Dragonwilds' `
  -BackupRoot '\\nas\backups\dragonwilds' `
  -GamePort 7777 `
  -ServerName 'Weekend Wilds'
```

## Dashboard customization

The **Realm** page allows an administrator to change:

- Server and world names
- Owner SteamID64
- Game and dashboard ports
- World and admin passwords
- Public-listing state
- Backup location
- Update-check interval and grace period
- Dashboard bind address and firewall scope
- Dashboard title and subtitle
- Host display name
- Accent color

The game installation directory is selected during first-run setup because changing it later requires moving or reinstalling Steam content. The dashboard displays the active game, backup, executable, and SteamCMD paths.

For settings that affect how the dashboard process starts, rerun:

```powershell
.\scripts\Install-WebManager.ps1 `
  -DashboardPassword (Read-Host -AsSecureString) `
  -WebPort 8787 `
  -BindAddress '0.0.0.0' `
  -RemoteAddress 'LocalSubnet'
```

`RemoteAddress` is passed to Windows Firewall. Keep `LocalSubnet` unless you intentionally want broader dashboard access. The dashboard uses plain HTTP and should not be exposed directly to the internet.

## Scheduled tasks

- `DragonWildsServer` starts the game server at boot.
- `DragonWildsServerWatchdog` checks every five minutes and restarts a stopped server.
- `DragonWildsAutoUpdate` checks Steam at the configured interval. When an update is available, it records the deadline, waits the configured grace period, stops the server, updates and validates it, then restarts it.
- `DragonWildsManager` starts the web dashboard at boot.

## Configuration and secrets

Runtime files are stored under `C:\ProgramData\DragonWildsSM`:

- `config\ServerConfig.psd1` contains non-secret settings.
- `config\ServerSecrets.psd1` contains owner/admin/world credentials.
- `config\WebUiAuth.json` contains the salted dashboard password hash.
- `update-status.json` contains update progress.
- `logs\manager.log` contains manager activity.

Secret files are restricted to Administrators and `SYSTEM` and are excluded from Git.

`PlatformPolicy` accepts `Crossplay`, `PC`, `PlayStation`, `Xbox`, or `Nintendo`. `MaxPlayers` accepts 1 through 6; the manager applies it through Unreal's `Engine.GameSession` launch override.

## Manual operations

```powershell
.\scripts\Start-DragonWildsServer.ps1
.\scripts\Stop-DragonWildsServer.ps1
.\scripts\Update-DragonWildsServer.ps1
.\scripts\Get-DragonWildsUpdateStatus.ps1
.\scripts\Invoke-ScheduledUpdate.ps1
.\scripts\Get-DragonWildsHealth.ps1
```

Dragonwilds does not respond to Steam A2S queries and exposes no known RCON endpoint. The manager estimates active players from bidirectional UDP flows on the configured game port. The game currently supports a maximum configured cap of six players.

## Network

The installer creates the local Windows Firewall rule. Internet play also requires forwarding the selected UDP game port from the edge firewall/router to the Windows host.

## License

MIT
