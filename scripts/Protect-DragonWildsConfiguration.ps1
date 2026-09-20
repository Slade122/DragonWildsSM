. $PSScriptRoot\Common.ps1

foreach ($path in $script:ConfigPath, $script:SecretsPath, (Join-Path $script:ConfigDirectory 'WebUiAuth.json')) {
    if (Test-Path -LiteralPath $path) {
        Set-RestrictedFileAcl -Path $path
    }
}
