[CmdletBinding()]
param(
    [string]$ServerName,
    [string]$WorldName,
    [ValidateSet('Crossplay', 'PC', 'PlayStation', 'Xbox', 'Nintendo')][string]$PlatformPolicy,
    [ValidateRange(1, 6)][int]$MaxPlayers,
    [string]$OwnerId,
    [SecureString]$AdminPassword,
    [SecureString]$WorldPassword,
    [string]$ManagerTitle,
    [string]$ManagerSubtitle,
    [string]$HostDisplayName,
    [ValidatePattern('^#[0-9A-Fa-f]{6}$')][string]$AccentColor
)

. $PSScriptRoot\Common.ps1
$config = Get-DragonWildsConfig

if (-not $ServerName) { $ServerName = Read-Host "Server name [$($config.ServerName)]" }
if (-not $ServerName) { $ServerName = $config.ServerName }
if (-not $WorldName) { $WorldName = Read-Host "World name [$($config.WorldName)]" }
if (-not $WorldName) { $WorldName = $config.WorldName }
if ($PlatformPolicy) { $config.PlatformPolicy = $PlatformPolicy }
if ($PSBoundParameters.ContainsKey('MaxPlayers')) { $config.MaxPlayers = $MaxPlayers }
if (-not $PSBoundParameters.ContainsKey('AdminPassword')) { $AdminPassword = Read-Host 'Admin password (blank disables)' -AsSecureString }
if (-not $PSBoundParameters.ContainsKey('WorldPassword')) { $WorldPassword = Read-Host 'World password (blank allows friends without one)' -AsSecureString }
if (-not $OwnerId) { $OwnerId = Read-Host 'SteamID64 owner (optional)' }
if ($OwnerId -and $OwnerId -notmatch '^\d{17}$') { throw 'OwnerId must be a 17-digit SteamID64.' }
if ($ManagerTitle) { $config.ManagerTitle = $ManagerTitle }
if ($ManagerSubtitle) { $config.ManagerSubtitle = $ManagerSubtitle }
if ($HostDisplayName) { $config.HostDisplayName = $HostDisplayName }
if ($AccentColor) { $config.AccentColor = $AccentColor }

$toPlainText = {
    param([SecureString]$Value)
    if (-not $Value) { return '' }
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Value)
    try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}
$admin = & $toPlainText $AdminPassword
$worldPassword = & $toPlainText $WorldPassword

$config.ServerName = $ServerName
$config.WorldName = $WorldName
$configContent = ConvertTo-DragonWildsConfigContent -Config $config
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
