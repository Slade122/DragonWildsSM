. $PSScriptRoot\Common.ps1

$config = Get-DragonWildsConfig
$processes = @(Get-DragonWildsProcess -Config $config)
if (-not $processes) {
    Write-DragonWildsLog 'Server is not running.'
    return
}

foreach ($process in $processes) {
    Stop-Process -Id $process.ProcessId -Force
    Write-DragonWildsLog "Stopped server PID $($process.ProcessId)."
}
