. $PSScriptRoot\Common.ps1

$config = Get-DragonWildsConfig
$manifest = Join-Path $config.InstallRoot "steamapps\appmanifest_$($config.AppId).acf"
$installedBuildId = $null
if (Test-Path -LiteralPath $manifest) {
    $match = Select-String -LiteralPath $manifest -Pattern '"buildid"\s+"(?<BuildId>\d+)"' | Select-Object -First 1
    if ($match) { $installedBuildId = $match.Matches[0].Groups['BuildId'].Value }
}

$output = & $config.SteamCmdPath '+login' 'anonymous' '+app_info_update' '1' '+app_info_print' "$($config.AppId)" '+quit'
if ($LASTEXITCODE -ne 0) {
    throw "SteamCMD app_info_print failed with exit code $LASTEXITCODE."
}

$remoteBuildId = ($output | Select-String -Pattern '"buildid"\s+"(?<BuildId>\d+)"' | Select-Object -First 1).Matches[0].Groups['BuildId'].Value
$statePath = Join-Path $script:StateRoot 'update-status.json'
$state = if (Test-Path -LiteralPath $statePath) { Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json } else { $null }

[pscustomobject]@{
    checkedAt = (Get-Date).ToString('o')
    installedBuildId = $installedBuildId
    remoteBuildId = $remoteBuildId
    updateAvailable = ($installedBuildId -and $remoteBuildId -and $installedBuildId -ne $remoteBuildId)
    pending = [bool]($state -and $state.status -eq 'pending')
    status = if ($state) { $state.status } else { 'idle' }
    deadline = if ($state) { $state.deadline } else { $null }
    lastMessage = if ($state) { $state.message } else { $null }
} | ConvertTo-Json
