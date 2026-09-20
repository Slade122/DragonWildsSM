. $PSScriptRoot\Common.ps1

$config = Get-DragonWildsConfig
$process = @(Get-DragonWildsProcess -Config $config) | Select-Object -First 1
$health = [ordered]@{
    Timestamp = (Get-Date).ToString('o')
    Running = [bool]$process
    ProcessId = if ($process) { $process.ProcessId } else { $null }
    GamePort = $config.GamePort
    FirewallRulePresent = [bool](Get-NetFirewallRule -DisplayName 'DragonWilds Dedicated Server UDP 7777' -ErrorAction SilentlyContinue)
    StartTaskState = (Get-ScheduledTask -TaskName 'DragonWildsServer' -ErrorAction SilentlyContinue).State
    WatchdogTaskState = (Get-ScheduledTask -TaskName 'DragonWildsServerWatchdog' -ErrorAction SilentlyContinue).State
}

$health | ConvertTo-Json
if (-not $health.Running) {
    exit 1
}
