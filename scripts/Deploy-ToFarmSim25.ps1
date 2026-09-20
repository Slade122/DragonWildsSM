[CmdletBinding()]
param(
    [string]$HostName = 'farmsim',
    [Parameter(Mandatory)][ValidatePattern('^[A-Za-z]:\\')][string]$InstallRoot
)

$projectRoot = Split-Path -Parent $PSScriptRoot
$remoteRoot = 'C:\DragonWildsSM'

ssh $HostName "if not exist $remoteRoot mkdir $remoteRoot"
scp -r "$projectRoot\*" "${HostName}:$remoteRoot"
if ($LASTEXITCODE -ne 0) {
    throw 'Project copy to FarmSim25 failed.'
}

ssh $HostName "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$remoteRoot\scripts\Install-DragonWildsServer.ps1`" -InstallRoot `"$InstallRoot`""
if ($LASTEXITCODE -ne 0) {
    throw 'Remote Dragonwilds installation failed.'
}
