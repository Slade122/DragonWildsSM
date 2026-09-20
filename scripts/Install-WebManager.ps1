[CmdletBinding()]
param([Parameter(Mandatory)][SecureString]$DashboardPassword)

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
$plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($DashboardPassword))
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

$rule = 'DragonWilds Manager HTTP 8787'
if (-not (Get-NetFirewallRule -DisplayName $rule -ErrorAction SilentlyContinue)) {
    New-NetFirewallRule -DisplayName $rule -Direction Inbound -Action Allow -Protocol TCP -LocalPort 8787 -RemoteAddress LocalSubnet | Out-Null
}
$action = New-ScheduledTaskAction -Execute $nodeExe -Argument (Join-Path $webRoot 'server.mjs') -WorkingDirectory $webRoot
$trigger = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName 'DragonWildsManager' -Action $action -Trigger $trigger -Settings $settings -User 'SYSTEM' -RunLevel Highest -Force | Out-Null
Start-ScheduledTask -TaskName 'DragonWildsManager'
