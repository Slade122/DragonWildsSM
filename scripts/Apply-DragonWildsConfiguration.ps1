[CmdletBinding()]
param([switch]$ScheduleManagerRestart)

. $PSScriptRoot\Common.ps1
$config = Get-DragonWildsConfig
$projectRoot = Split-Path -Parent $PSScriptRoot
$webRoot = Join-Path $projectRoot 'web'
$nodeExe = Join-Path $projectRoot 'runtime\node\node.exe'
$powerShell = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$startupTrigger = New-ScheduledTaskTrigger -AtStartup

if (Test-Path -LiteralPath (Join-Path $config.InstallRoot $config.ServerExecutableRelativePath)) {
    Get-NetFirewallRule -DisplayName 'DragonWilds Dedicated Server UDP *' -ErrorAction SilentlyContinue |
        Remove-NetFirewallRule -ErrorAction SilentlyContinue
    New-NetFirewallRule -DisplayName "DragonWilds Dedicated Server UDP $($config.GamePort)" -Direction Inbound -Action Allow -Protocol UDP -LocalPort $config.GamePort | Out-Null

    $startAction = New-ScheduledTaskAction -Execute $powerShell -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$PSScriptRoot\Start-DragonWildsServer.ps1`""
    $monitorAction = New-ScheduledTaskAction -Execute $powerShell -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$PSScriptRoot\Monitor-DragonWildsServer.ps1`""
    $updateAction = New-ScheduledTaskAction -Execute $powerShell -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$PSScriptRoot\Invoke-ScheduledUpdate.ps1`""
    $monitorTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date).Date -RepetitionInterval (New-TimeSpan -Minutes 5) -RepetitionDuration (New-TimeSpan -Days 3650)
    $updateTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date).Date.AddMinutes(17) -RepetitionInterval (New-TimeSpan -Hours $config.UpdateCheckHours) -RepetitionDuration (New-TimeSpan -Days 3650)
    $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit (New-TimeSpan -Minutes 10)
    $updateSettings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 45)
    Register-ScheduledTask -TaskName 'DragonWildsServer' -Action $startAction -Trigger $startupTrigger -Settings $settings -User 'SYSTEM' -RunLevel Highest -Force | Out-Null
    Register-ScheduledTask -TaskName 'DragonWildsServerWatchdog' -Action $monitorAction -Trigger $monitorTrigger -Settings $settings -User 'SYSTEM' -RunLevel Highest -Force | Out-Null
    Register-ScheduledTask -TaskName 'DragonWildsAutoUpdate' -Action $updateAction -Trigger $updateTrigger -Settings $updateSettings -User 'SYSTEM' -RunLevel Highest -Force | Out-Null
}

Get-NetFirewallRule -DisplayName 'DragonWilds Manager HTTP *' -ErrorAction SilentlyContinue |
    Remove-NetFirewallRule -ErrorAction SilentlyContinue
New-NetFirewallRule -DisplayName "DragonWilds Manager HTTP $($config.WebPort)" -Direction Inbound -Action Allow -Protocol TCP -LocalPort $config.WebPort -RemoteAddress $config.WebRemoteAddress | Out-Null

if (Test-Path -LiteralPath $nodeExe) {
    $managerAction = New-ScheduledTaskAction -Execute $nodeExe -Argument (Join-Path $webRoot 'server.mjs') -WorkingDirectory $webRoot
    $managerSettings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
    Register-ScheduledTask -TaskName 'DragonWildsManager' -Action $managerAction -Trigger $startupTrigger -Settings $managerSettings -User 'SYSTEM' -RunLevel Highest -Force | Out-Null
}

if ($ScheduleManagerRestart) {
    $restartCommand = "Start-Sleep -Seconds 3; Stop-ScheduledTask -TaskName 'DragonWildsManager' -ErrorAction SilentlyContinue; Start-Sleep -Seconds 2; Start-ScheduledTask -TaskName 'DragonWildsManager'"
    $restartAction = New-ScheduledTaskAction -Execute $powerShell -Argument "-NoProfile -ExecutionPolicy Bypass -Command `"$restartCommand`""
    $restartTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddSeconds(10)
    Register-ScheduledTask -TaskName 'DragonWildsManagerRestart' -Action $restartAction -Trigger $restartTrigger -Settings (New-ScheduledTaskSettingsSet -StartWhenAvailable) -User 'SYSTEM' -RunLevel Highest -Force | Out-Null
}
