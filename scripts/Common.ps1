Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$script:StateRoot = Join-Path $env:ProgramData 'DragonWildsSM'
$script:ConfigDirectory = Join-Path $script:StateRoot 'config'
$script:ConfigPath = Join-Path $script:ConfigDirectory 'ServerConfig.psd1'
$script:SecretsPath = Join-Path $script:ConfigDirectory 'ServerSecrets.psd1'
$script:LogDirectory = Join-Path $script:StateRoot 'logs'

function Initialize-DragonWildsState {
    foreach ($directory in @($script:StateRoot, $script:ConfigDirectory, $script:LogDirectory)) {
        New-Item -ItemType Directory -Force -Path $directory | Out-Null
    }
}

function Write-DragonWildsLog {
    param([Parameter(Mandatory)][string]$Message, [ValidateSet('INFO', 'WARN', 'ERROR')][string]$Level = 'INFO')

    Initialize-DragonWildsState
    $line = '{0:o} [{1}] {2}' -f (Get-Date), $Level, $Message
    Add-Content -LiteralPath (Join-Path $script:LogDirectory 'manager.log') -Value $line
    Write-Information $line -InformationAction Continue
}

function Get-DragonWildsConfig {
    if (-not (Test-Path -LiteralPath $script:ConfigPath)) {
        throw "Server configuration is missing: $script:ConfigPath. Run Install-DragonWildsServer.ps1 first."
    }

    $config = Import-PowerShellDataFile -LiteralPath $script:ConfigPath
    foreach ($name in 'AppId', 'InstallRoot', 'SteamCmdPath', 'ServerExecutableRelativePath', 'GamePort', 'Public', 'ServerName', 'WorldName') {
        if (-not $config.ContainsKey($name)) {
            throw "Server configuration is missing '$name'."
        }
    }

    $defaults = @{
        LogRetentionDays = 30
        BackupRoot = (Join-Path $script:StateRoot 'backups')
        UpdateCheckHours = 1
        UpdateGraceMinutes = 10
        WebPort = 8787
        WebBindAddress = '0.0.0.0'
        WebRemoteAddress = 'LocalSubnet'
        ManagerTitle = 'Dragonwilds Server'
        ManagerSubtitle = 'Dedicated server command center'
        HostDisplayName = $env:COMPUTERNAME
        AccentColor = '#d9aa50'
    }
    foreach ($name in $defaults.Keys) {
        if (-not $config.ContainsKey($name)) {
            $config[$name] = $defaults[$name]
        }
    }

    return $config
}

function ConvertTo-DragonWildsConfigContent {
    param([Parameter(Mandatory)][hashtable]$Config)

    return @"
@{
    AppId = $($Config.AppId)
    InstallRoot = $(ConvertTo-Psd1Literal $Config.InstallRoot)
    SteamCmdPath = $(ConvertTo-Psd1Literal $Config.SteamCmdPath)
    BackupRoot = $(ConvertTo-Psd1Literal $Config.BackupRoot)
    ServerExecutableRelativePath = $(ConvertTo-Psd1Literal $Config.ServerExecutableRelativePath)
    GamePort = $($Config.GamePort)
    Public = $($Config.Public)
    ServerName = $(ConvertTo-Psd1Literal $Config.ServerName)
    WorldName = $(ConvertTo-Psd1Literal $Config.WorldName)
    LogRetentionDays = $($Config.LogRetentionDays)
    UpdateCheckHours = $($Config.UpdateCheckHours)
    UpdateGraceMinutes = $($Config.UpdateGraceMinutes)
    WebPort = $($Config.WebPort)
    WebBindAddress = $(ConvertTo-Psd1Literal $Config.WebBindAddress)
    WebRemoteAddress = $(ConvertTo-Psd1Literal $Config.WebRemoteAddress)
    ManagerTitle = $(ConvertTo-Psd1Literal $Config.ManagerTitle)
    ManagerSubtitle = $(ConvertTo-Psd1Literal $Config.ManagerSubtitle)
    HostDisplayName = $(ConvertTo-Psd1Literal $Config.HostDisplayName)
    AccentColor = $(ConvertTo-Psd1Literal $Config.AccentColor)
}
"@
}

function Get-DragonWildsSecret {
    if (-not (Test-Path -LiteralPath $script:SecretsPath)) {
        return @{}
    }

    return Import-PowerShellDataFile -LiteralPath $script:SecretsPath
}

function Get-DragonWildsExecutablePath {
    param([Parameter(Mandatory)][hashtable]$Config)

    $path = Join-Path $Config.InstallRoot $Config.ServerExecutableRelativePath
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
        throw "Dedicated-server executable was not found at '$path'. Run Install-DragonWildsServer.ps1."
    }

    return $path
}

function Get-DragonWildsProcess {
    param([Parameter(Mandatory)][hashtable]$Config)

    $serverDirectory = Split-Path -Parent (Get-DragonWildsExecutablePath -Config $Config)
    $shippingExecutable = Join-Path $serverDirectory 'RSDragonwilds\Binaries\Win64\RSDragonwildsServer-Win64-Shipping.exe'
    Get-CimInstance Win32_Process -Filter "Name='RSDragonwildsServer-Win64-Shipping.exe'" |
        Where-Object { $_.ExecutablePath -eq $shippingExecutable }
}

function Set-RestrictedFileAcl {
    [CmdletBinding(SupportsShouldProcess)]
    param([Parameter(Mandatory)][string]$Path)

    $acl = Get-Acl -LiteralPath $Path
    $acl.SetAccessRuleProtection($true, $false)
    foreach ($rule in @($acl.Access)) {
        [void]$acl.RemoveAccessRule($rule)
    }

    foreach ($identity in 'BUILTIN\Administrators', 'NT AUTHORITY\SYSTEM') {
        $rule = [System.Security.AccessControl.FileSystemAccessRule]::new(
            $identity, 'FullControl', 'Allow')
        [void]$acl.AddAccessRule($rule)
    }

    if ($PSCmdlet.ShouldProcess($Path, 'Restrict file permissions to Administrators and SYSTEM')) {
        Set-Acl -LiteralPath $Path -AclObject $acl
    }
}

function ConvertTo-Psd1Literal {
    param([AllowNull()][string]$Value)

    if ($null -eq $Value) {
        return "''"
    }

    return "'{0}'" -f $Value.Replace("'", "''")
}
