[CmdletBinding()]
param(
    [Parameter(Mandatory)][ValidatePattern('^[A-Za-z]:\\')][string]$InstallRoot,
    [string]$SteamCmdPath = 'C:\steamcmd\steamcmd.exe',
    [switch]$SkipDownload
)

. $PSScriptRoot\Common.ps1

if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
        [Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'Run this script in an elevated PowerShell session.'
}

$requiredFreeBytes = 25GB
$root = [IO.Path]::GetPathRoot($InstallRoot)
$drive = Get-PSDrive -Name $root.TrimEnd('\', ':')
if ($drive.Free -lt $requiredFreeBytes) {
    throw "Install volume '$root' has $([math]::Round($drive.Free / 1GB, 1)) GB free; at least 25 GB is required."
}

Initialize-DragonWildsState

if (-not (Test-Path -LiteralPath $SteamCmdPath -PathType Leaf)) {
    if ($SkipDownload) {
        throw "SteamCMD does not exist at '$SteamCmdPath'."
    }

    $steamDirectory = Split-Path -Parent $SteamCmdPath
    New-Item -ItemType Directory -Force -Path $steamDirectory | Out-Null
    $archive = Join-Path $env:TEMP 'steamcmd.zip'
    Invoke-WebRequest -Uri 'https://steamcdn-a.akamaihd.net/client/installer/steamcmd.zip' -OutFile $archive
    Expand-Archive -LiteralPath $archive -DestinationPath $steamDirectory -Force
    Remove-Item -LiteralPath $archive -Force
}

New-Item -ItemType Directory -Force -Path $InstallRoot | Out-Null
Write-DragonWildsLog "Installing or validating Steam app 4019830 in '$InstallRoot'."
& $SteamCmdPath '+force_install_dir' $InstallRoot '+login' 'anonymous' '+app_update' '4019830' 'validate' '+quit'
if ($LASTEXITCODE -ne 0) {
    throw "SteamCMD failed with exit code $LASTEXITCODE."
}

$executable = Get-ChildItem -LiteralPath $InstallRoot -Filter 'RSDragonwildsServer.exe' -Recurse -File |
    Select-Object -First 1 -ExpandProperty FullName
if (-not $executable) {
    throw 'SteamCMD completed but RSDragonwildsServer.exe was not installed.'
}

$relativeExecutable = $executable.Substring($InstallRoot.Length).TrimStart('\')
$template = Join-Path (Split-Path -Parent $PSScriptRoot) 'config\ServerConfig.example.psd1'
$configText = Get-Content -LiteralPath $template -Raw
$configText = $configText.Replace("InstallRoot = 'E:\DragonWildsServer'", "InstallRoot = $(ConvertTo-Psd1Literal $InstallRoot)")
$configText = $configText.Replace("SteamCmdPath = 'C:\steamcmd\steamcmd.exe'", "SteamCmdPath = $(ConvertTo-Psd1Literal $SteamCmdPath)")
$configText = $configText.Replace("ServerExecutableRelativePath = 'RSDragonwilds\Binaries\Win64\RSDragonwildsServer.exe'", "ServerExecutableRelativePath = $(ConvertTo-Psd1Literal $relativeExecutable)")
Set-Content -LiteralPath $script:ConfigPath -Value $configText -Encoding utf8
Set-RestrictedFileAcl -Path $script:ConfigPath

$gamePort = 7778
$ruleName = "DragonWilds Dedicated Server UDP $gamePort"
if (-not (Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue)) {
    New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Action Allow -Protocol UDP -LocalPort $gamePort |
        Out-Null
}

$powerShell = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$startAction = New-ScheduledTaskAction -Execute $powerShell -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$PSScriptRoot\Start-DragonWildsServer.ps1`""
$monitorAction = New-ScheduledTaskAction -Execute $powerShell -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$PSScriptRoot\Monitor-DragonWildsServer.ps1`""
$startupTrigger = New-ScheduledTaskTrigger -AtStartup
$monitorTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date).Date -RepetitionInterval (New-TimeSpan -Minutes 5) -RepetitionDuration (New-TimeSpan -Days 3650)
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit (New-TimeSpan -Minutes 10)
Register-ScheduledTask -TaskName 'DragonWildsServer' -Action $startAction -Trigger $startupTrigger -Settings $settings -User 'SYSTEM' -RunLevel Highest -Force | Out-Null
Register-ScheduledTask -TaskName 'DragonWildsServerWatchdog' -Action $monitorAction -Trigger $monitorTrigger -Settings $settings -User 'SYSTEM' -RunLevel Highest -Force | Out-Null

Write-DragonWildsLog "Installation complete. Configure secrets with Configure-DragonWildsServer.ps1 before starting."
