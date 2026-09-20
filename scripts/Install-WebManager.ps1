[CmdletBinding()]
param(
    [SecureString]$DashboardPassword,
    [ValidatePattern('^[A-Za-z]:\\')][string]$InstallRoot = 'C:\DragonWildsServer',
    [ValidatePattern('^(?:[A-Za-z]:\\|\\\\[^\\]+\\[^\\]+)')][string]$BackupRoot = 'C:\ProgramData\DragonWildsSM\backups',
    [string]$SteamCmdPath = 'C:\steamcmd\steamcmd.exe',
    [ValidateRange(1, 65535)][int]$WebPort,
    [string]$BindAddress,
    [string]$RemoteAddress,
    [string]$ManagerTitle,
    [string]$ManagerSubtitle,
    [string]$HostDisplayName,
    [ValidatePattern('^#[0-9A-Fa-f]{6}$')][string]$AccentColor
)

. $PSScriptRoot\Common.ps1
if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'Run this script in an elevated PowerShell session.'
}

$projectRoot = Split-Path -Parent $PSScriptRoot
$webRoot = Join-Path $projectRoot 'web'
$runtimeRoot = Join-Path $projectRoot 'runtime\node'
$nodeExe = Join-Path $runtimeRoot 'node.exe'
if (-not (Test-Path $nodeExe)) {
    $archive = Join-Path $env:TEMP 'node-v24.21.0-win-x64.zip'
    Invoke-WebRequest -Uri 'https://nodejs.org/dist/v24.21.0/node-v24.21.0-win-x64.zip' -OutFile $archive
    $extractRoot = Join-Path $env:TEMP 'node-v24.21.0-win-x64'
    Expand-Archive -LiteralPath $archive -DestinationPath $env:TEMP -Force
    New-Item -ItemType Directory -Path $runtimeRoot -Force | Out-Null
    Copy-Item -Path (Join-Path $extractRoot '*') -Destination $runtimeRoot -Recurse -Force
    Remove-Item -LiteralPath $archive -Force
}

Push-Location $webRoot
try {
    & $nodeExe (Join-Path $runtimeRoot 'node_modules\npm\bin\npm-cli.js') 'ci' '--omit=dev'
    if ($LASTEXITCODE -ne 0) { throw "npm ci failed with exit code $LASTEXITCODE." }
}
finally { Pop-Location }

Initialize-DragonWildsState
$config = if (Test-Path -LiteralPath $script:ConfigPath) {
    Get-DragonWildsConfig
}
else {
    @{
        AppId = 4019830
        InstallRoot = $InstallRoot
        SteamCmdPath = $SteamCmdPath
        BackupRoot = $BackupRoot
        ServerExecutableRelativePath = 'RSDragonwilds\Binaries\Win64\RSDragonwildsServer.exe'
        GamePort = 7777
        Public = 1
        ServerName = 'My Dragonwilds Server'
        WorldName = 'Dragonwilds'
        LogRetentionDays = 30
        UpdateCheckHours = 1
        UpdateGraceMinutes = 10
        WebPort = 8787
        WebBindAddress = '0.0.0.0'
        WebRemoteAddress = 'LocalSubnet'
        ManagerTitle = 'Dragonwilds Server'
        ManagerSubtitle = 'Dedicated server command center'
        HostDisplayName = $env:COMPUTERNAME
        AccentColor = '#d9aa50'
    }
}
if ($PSBoundParameters.ContainsKey('WebPort')) { $config.WebPort = $WebPort }
if ($BindAddress) { $config.WebBindAddress = $BindAddress }
if ($RemoteAddress) { $config.WebRemoteAddress = $RemoteAddress }
if ($ManagerTitle) { $config.ManagerTitle = $ManagerTitle }
if ($ManagerSubtitle) { $config.ManagerSubtitle = $ManagerSubtitle }
if ($HostDisplayName) { $config.HostDisplayName = $HostDisplayName }
if ($AccentColor) { $config.AccentColor = $AccentColor }
Set-Content -LiteralPath $script:ConfigPath -Value (ConvertTo-DragonWildsConfigContent -Config $config) -Encoding utf8
Set-RestrictedFileAcl -Path $script:ConfigPath

if ($DashboardPassword) {
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($DashboardPassword)
    try { $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
    $salt = [Guid]::NewGuid().ToString('N')
    $deriver = [Security.Cryptography.Rfc2898DeriveBytes]::new($plain, [Text.Encoding]::UTF8.GetBytes($salt), 210000)
    try {
        $hash = ([BitConverter]::ToString($deriver.GetBytes(64))).Replace('-', '').ToLowerInvariant()
    }
    finally {
        $deriver.Dispose()
    }
    @{ salt = $salt; hash = $hash } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $script:ConfigDirectory 'WebUiAuth.json') -Encoding utf8
    Set-RestrictedFileAcl -Path (Join-Path $script:ConfigDirectory 'WebUiAuth.json')
}

$action = New-ScheduledTaskAction -Execute $nodeExe -Argument (Join-Path $webRoot 'server.mjs') -WorkingDirectory $webRoot
$trigger = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName 'DragonWildsManager' -Action $action -Trigger $trigger -Settings $settings -User 'SYSTEM' -RunLevel Highest -Force | Out-Null
& (Join-Path $PSScriptRoot 'Apply-DragonWildsConfiguration.ps1')
Start-ScheduledTask -TaskName 'DragonWildsManager'
