[CmdletBinding()]
param([ValidateRange(0, 60)][Nullable[int]]$GraceMinutes)

. $PSScriptRoot\Common.ps1

Initialize-DragonWildsState
$config = Get-DragonWildsConfig
if ($null -eq $GraceMinutes) { $GraceMinutes = $config.UpdateGraceMinutes }
$statePath = Join-Path $script:StateRoot 'update-status.json'
$statusScript = Join-Path $PSScriptRoot 'Get-DragonWildsUpdateStatus.ps1'
$updateScript = Join-Path $PSScriptRoot 'Update-DragonWildsServer.ps1'
$status = & $statusScript | ConvertFrom-Json
if (-not $status.updateAvailable) {
    @{
        status = 'current'
        checkedAt = (Get-Date).ToString('o')
        message = "Installed build $($status.installedBuildId) is current."
    } | ConvertTo-Json | Set-Content -LiteralPath $statePath -Encoding utf8
    Write-DragonWildsLog "No Dragonwilds update available. Installed build $($status.installedBuildId)."
    return
}

$deadline = (Get-Date).AddMinutes($GraceMinutes)
@{
    status = 'pending'
    checkedAt = (Get-Date).ToString('o')
    deadline = $deadline.ToString('o')
    message = "Update available: $($status.installedBuildId) -> $($status.remoteBuildId). Restarting at $($deadline.ToLocalTime())."
} | ConvertTo-Json | Set-Content -LiteralPath $statePath -Encoding utf8
Write-DragonWildsLog "Dragonwilds update found. Waiting $GraceMinutes minutes before shutdown." -Level WARN
Start-Sleep -Seconds ([Math]::Max(0, $GraceMinutes) * 60)

try {
    @{
        status = 'updating'
        checkedAt = (Get-Date).ToString('o')
        message = "Updating Dragonwilds from build $($status.installedBuildId) to $($status.remoteBuildId)."
    } | ConvertTo-Json | Set-Content -LiteralPath $statePath -Encoding utf8
    & $updateScript
    $next = & $statusScript | ConvertFrom-Json
    @{
        status = 'updated'
        checkedAt = (Get-Date).ToString('o')
        message = "Updated Dragonwilds to build $($next.installedBuildId)."
    } | ConvertTo-Json | Set-Content -LiteralPath $statePath -Encoding utf8
}
catch {
    @{
        status = 'failed'
        checkedAt = (Get-Date).ToString('o')
        message = $_.Exception.Message
    } | ConvertTo-Json | Set-Content -LiteralPath $statePath -Encoding utf8
    throw
}
