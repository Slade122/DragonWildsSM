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
    Write-Host $line
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

    return $config
}

function Get-DragonWildsSecrets {
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

    $executable = Get-DragonWildsExecutablePath -Config $Config
    Get-CimInstance Win32_Process -Filter "Name='RSDragonwildsServer.exe'" |
        Where-Object { $_.ExecutablePath -eq $executable }
}

function Set-RestrictedFileAcl {
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

    Set-Acl -LiteralPath $Path -AclObject $acl
}

function ConvertTo-Psd1Literal {
    param([AllowNull()][string]$Value)

    if ($null -eq $Value) {
        return "''"
    }

    return "'{0}'" -f $Value.Replace("'", "''")
}
