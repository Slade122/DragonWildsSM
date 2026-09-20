. $PSScriptRoot\Common.ps1

$config = Get-DragonWildsConfig
$existing = Get-DragonWildsProcess -Config $config
if ($existing) {
    Write-DragonWildsLog "Server already running with PID $($existing.ProcessId)."
    return
}

$secrets = Get-DragonWildsSecrets
$settingsDirectory = Join-Path $config.InstallRoot 'RSDragonwilds\Saved\Config\WindowsServer'
New-Item -ItemType Directory -Force -Path $settingsDirectory | Out-Null
$settingsPath = Join-Path $settingsDirectory 'DedicatedServer.ini'
$settings = @"
[/Script/Dominion.DedicatedServerSettings]
AdminPassword=$(if ($secrets.ContainsKey('AdminPassword')) { $secrets.AdminPassword })
OwnerId=$(if ($secrets.ContainsKey('OwnerId')) { $secrets.OwnerId })
Public=$($config.Public)
WorldPassword=$(if ($secrets.ContainsKey('WorldPassword')) { $secrets.WorldPassword })
ServerName=$($config.ServerName)
DefaultWorldName=$($config.WorldName)
"@
Set-Content -LiteralPath $settingsPath -Value $settings -Encoding utf8
Set-RestrictedFileAcl -Path $settingsPath

$executable = Get-DragonWildsExecutablePath -Config $config
Start-Process -FilePath $executable -WorkingDirectory (Split-Path -Parent $executable) -ArgumentList '-log', '-NewConsole' | Out-Null
Write-DragonWildsLog "Started Dragonwilds server from '$executable'."
