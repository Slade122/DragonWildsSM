[CmdletBinding()]
param(
    [string]$ServerName,
    [string]$WorldName,
    [string]$OwnerId,
    [SecureString]$AdminPassword,
    [SecureString]$WorldPassword
)

. $PSScriptRoot\Common.ps1
$config = Get-DragonWildsConfig

if (-not $ServerName) { $ServerName = Read-Host "Server name [$($config.ServerName)]" }
if (-not $ServerName) { $ServerName = $config.ServerName }
if (-not $WorldName) { $WorldName = Read-Host "World name [$($config.WorldName)]" }
if (-not $WorldName) { $WorldName = $config.WorldName }
if (-not $PSBoundParameters.ContainsKey('AdminPassword')) { $AdminPassword = Read-Host 'Admin password (blank disables)' -AsSecureString }
if (-not $PSBoundParameters.ContainsKey('WorldPassword')) { $WorldPassword = Read-Host 'World password (blank allows friends without one)' -AsSecureString }
if (-not $OwnerId) { $OwnerId = Read-Host 'SteamID64 owner (optional)' }
if ($OwnerId -and $OwnerId -notmatch '^\d{17}$') { throw 'OwnerId must be a 17-digit SteamID64.' }

$toPlainText = {
    param([SecureString]$Value)
    if (-not $Value) { return '' }
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Value)
    try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}
$admin = & $toPlainText $AdminPassword
$worldPassword = & $toPlainText $WorldPassword

$configContent = @"
@{
    AppId = $($config.AppId)
    InstallRoot = $(ConvertTo-Psd1Literal $config.InstallRoot)
    SteamCmdPath = $(ConvertTo-Psd1Literal $config.SteamCmdPath)
    ServerExecutableRelativePath = $(ConvertTo-Psd1Literal $config.ServerExecutableRelativePath)
    GamePort = $($config.GamePort)
    Public = $($config.Public)
    ServerName = $(ConvertTo-Psd1Literal $ServerName)
    WorldName = $(ConvertTo-Psd1Literal $WorldName)
    LogRetentionDays = $($config.LogRetentionDays)
}
"@
Set-Content -LiteralPath $script:ConfigPath -Value $configContent -Encoding utf8
$secretContent = @"
@{
    OwnerId = $(ConvertTo-Psd1Literal $OwnerId)
    AdminPassword = $(ConvertTo-Psd1Literal $admin)
    WorldPassword = $(ConvertTo-Psd1Literal $worldPassword)
}
"@
Set-Content -LiteralPath $script:SecretsPath -Value $secretContent -Encoding utf8
Set-RestrictedFileAcl -Path $script:ConfigPath
Set-RestrictedFileAcl -Path $script:SecretsPath
Write-DragonWildsLog 'Configuration saved. Restart the server to apply it.'
