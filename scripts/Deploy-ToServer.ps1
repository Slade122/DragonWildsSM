[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$HostName,
    [Parameter(Mandatory)][ValidatePattern('^[A-Za-z]:\\')][string]$InstallRoot,
    [ValidatePattern('^[A-Za-z]:\\')][string]$ManagerRoot = 'C:\DragonWildsSM',
    [ValidatePattern('^(?:[A-Za-z]:\\|\\\\[^\\]+\\[^\\]+)')][string]$BackupRoot = 'C:\ProgramData\DragonWildsSM\backups',
    [ValidateRange(1, 65535)][int]$GamePort = 7777,
    [string]$ServerName = 'My Dragonwilds Server',
    [string]$WorldName = 'Dragonwilds',
    [ValidateSet('Crossplay', 'PC', 'PlayStation', 'Xbox', 'Nintendo')][string]$PlatformPolicy = 'Crossplay',
    [ValidateRange(1, 6)][int]$MaxPlayers = 6
)

$projectRoot = Split-Path -Parent $PSScriptRoot

ssh $HostName "if not exist `"$ManagerRoot`" mkdir `"$ManagerRoot`""
if ($LASTEXITCODE -ne 0) {
    throw "Could not create '$ManagerRoot' on '$HostName'."
}

scp -r "$projectRoot\*" "${HostName}:$($ManagerRoot.Replace('\', '/'))"
if ($LASTEXITCODE -ne 0) {
    throw "Project copy to '$HostName' failed."
}

$installer = Join-Path $ManagerRoot 'scripts\Install-DragonWildsServer.ps1'
ssh $HostName "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$installer`" -InstallRoot `"$InstallRoot`" -BackupRoot `"$BackupRoot`" -GamePort $GamePort -ServerName `"$ServerName`" -WorldName `"$WorldName`" -PlatformPolicy $PlatformPolicy -MaxPlayers $MaxPlayers"
if ($LASTEXITCODE -ne 0) {
    throw "Remote Dragonwilds installation on '$HostName' failed."
}
