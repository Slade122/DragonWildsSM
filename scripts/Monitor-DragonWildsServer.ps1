. $PSScriptRoot\Common.ps1

$config = Get-DragonWildsConfig
if (-not (Get-DragonWildsProcess -Config $config)) {
    Write-DragonWildsLog 'Watchdog detected a stopped server; starting it.' -Level WARN
    & $PSScriptRoot\Start-DragonWildsServer.ps1
}

$retention = (Get-Date).AddDays(-[int]$config.LogRetentionDays)
Get-ChildItem -LiteralPath $script:LogDirectory -Filter '*.log' -File |
    Where-Object LastWriteTime -lt $retention |
    Remove-Item -Force
