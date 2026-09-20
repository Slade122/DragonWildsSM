[CmdletBinding()]
param(
    [ValidatePattern('^[A-Za-z]:\\')][string]$InstallRoot,
    [ValidatePattern('^(?:[A-Za-z]:\\|\\\\[^\\]+\\[^\\]+)')][string]$BackupRoot,
    [string]$SteamCmdPath = 'C:\steamcmd\steamcmd.exe',
    [ValidateRange(1, 65535)][int]$GamePort = 7777,
    [string]$ServerName,
    [string]$WorldName = 'Dragonwilds',
    [ValidateSet('Crossplay', 'PC', 'PlayStation', 'Xbox', 'Nintendo')][string]$PlatformPolicy = 'Crossplay',
    [ValidateRange(1, 6)][int]$MaxPlayers = 6,
    [string]$OwnerId,
    [ValidateRange(1, 24)][int]$UpdateCheckHours = 1,
    [ValidateRange(0, 60)][int]$UpdateGraceMinutes = 10,
    [ValidateRange(1, 65535)][int]$WebPort = 8787,
    [string]$ManagerTitle = 'Dragonwilds Server',
    [string]$ManagerSubtitle = 'Dedicated server command center',
    [string]$HostDisplayName = $env:COMPUTERNAME,
    [ValidatePattern('^#[0-9A-Fa-f]{6}$')][string]$AccentColor = '#d9aa50',
    [SecureString]$WorldPassword,
    [SecureString]$AdminPassword,
    [SecureString]$DashboardPassword
)

$ErrorActionPreference = 'Stop'
if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
        [Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'Run Install.ps1 in an elevated PowerShell session.'
}

$scripts = Join-Path $PSScriptRoot 'scripts'
if ($PSBoundParameters.Count -eq 0) {
    & (Join-Path $scripts 'Install-WebManager.ps1')
    Start-Sleep -Seconds 3
    Start-Process 'http://localhost:8787'
    Write-Host 'First-run setup is open at http://localhost:8787.'
    return
}

if (-not $InstallRoot) { $InstallRoot = Read-Host 'Game install location [C:\DragonWildsServer]' }
if (-not $InstallRoot) { $InstallRoot = 'C:\DragonWildsServer' }
if (-not $BackupRoot) { $BackupRoot = Read-Host 'Backup location [C:\ProgramData\DragonWildsSM\backups]' }
if (-not $BackupRoot) { $BackupRoot = 'C:\ProgramData\DragonWildsSM\backups' }
if (-not $ServerName) { $ServerName = Read-Host 'Server name [My Dragonwilds Server]' }
if (-not $ServerName) { $ServerName = 'My Dragonwilds Server' }
if (-not $OwnerId) { $OwnerId = Read-Host 'Owner SteamID64 (optional)' }
if ($OwnerId -and $OwnerId -notmatch '^\d{17}$') { throw 'OwnerId must be a 17-digit SteamID64.' }
if (-not $PSBoundParameters.ContainsKey('WorldPassword')) { $WorldPassword = Read-Host 'World password (blank for none)' -AsSecureString }
if (-not $PSBoundParameters.ContainsKey('AdminPassword')) { $AdminPassword = Read-Host 'Admin password (blank for none)' -AsSecureString }
if (-not $DashboardPassword) { $DashboardPassword = Read-Host 'Dashboard password' -AsSecureString }

& (Join-Path $scripts 'Install-DragonWildsServer.ps1') `
    -InstallRoot $InstallRoot `
    -SteamCmdPath $SteamCmdPath `
    -BackupRoot $BackupRoot `
    -GamePort $GamePort `
    -ServerName $ServerName `
    -WorldName $WorldName `
    -PlatformPolicy $PlatformPolicy `
    -MaxPlayers $MaxPlayers `
    -UpdateCheckHours $UpdateCheckHours `
    -UpdateGraceMinutes $UpdateGraceMinutes

& (Join-Path $scripts 'Configure-DragonWildsServer.ps1') `
    -ServerName $ServerName `
    -WorldName $WorldName `
    -PlatformPolicy $PlatformPolicy `
    -MaxPlayers $MaxPlayers `
    -OwnerId $OwnerId `
    -WorldPassword $WorldPassword `
    -AdminPassword $AdminPassword `
    -ManagerTitle $ManagerTitle `
    -ManagerSubtitle $ManagerSubtitle `
    -HostDisplayName $HostDisplayName `
    -AccentColor $AccentColor

& (Join-Path $scripts 'Install-WebManager.ps1') `
    -DashboardPassword $DashboardPassword `
    -WebPort $WebPort `
    -ManagerTitle $ManagerTitle `
    -ManagerSubtitle $ManagerSubtitle `
    -HostDisplayName $HostDisplayName `
    -AccentColor $AccentColor

& (Join-Path $scripts 'Start-DragonWildsServer.ps1')
Write-Host "Dragonwilds is installed in '$InstallRoot'. Backups go to '$BackupRoot'. Dashboard port: $WebPort."
