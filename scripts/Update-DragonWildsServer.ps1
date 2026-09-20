. $PSScriptRoot\Common.ps1

$config = Get-DragonWildsConfig
$wasRunning = [bool](Get-DragonWildsProcess -Config $config)
if ($wasRunning) {
    & $PSScriptRoot\Stop-DragonWildsServer.ps1
}

Write-DragonWildsLog 'Updating and validating Dragonwilds through SteamCMD.'
& $config.SteamCmdPath '+force_install_dir' $config.InstallRoot '+login' 'anonymous' '+app_update' "$($config.AppId)" 'validate' '+quit'
if ($LASTEXITCODE -ne 0) {
    throw "SteamCMD update failed with exit code $LASTEXITCODE."
}

if ($wasRunning) {
    & $PSScriptRoot\Start-DragonWildsServer.ps1
}
Write-DragonWildsLog 'Update complete.'
