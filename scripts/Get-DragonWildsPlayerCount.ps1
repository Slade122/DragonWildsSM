. $PSScriptRoot\Common.ps1

$config = Get-DragonWildsConfig
$cachePath = Join-Path $script:StateRoot 'player-count.json'
$lockPath = Join-Path $script:StateRoot 'player-count.lock'
$lockStream = $null

try {
    try {
        $lockStream = [IO.File]::Open($lockPath, 'OpenOrCreate', 'ReadWrite', 'None')
    }
    catch [IO.IOException] {
        if (Test-Path -LiteralPath $cachePath) {
            Get-Content -LiteralPath $cachePath -Raw
            return
        }
        throw 'Player probe is already running.'
    }

    $process = Get-DragonWildsProcess -Config $config
    if (-not $process) {
        [pscustomobject]@{
            Supported = $true
            CurrentPlayers = 0
            MaxPlayers = $config.MaxPlayers
            Message = 'Server is offline.'
        } | ConvertTo-Json -Compress
        return
    }

    $capturePath = Join-Path $env:TEMP "dwsm-player-$PID.etl"
    $textPath = Join-Path $env:TEMP "dwsm-player-$PID.txt"
    $sessionName = "DragonWildsSM-$PID"
    try {
        Remove-NetEventSession -Name $sessionName -ErrorAction SilentlyContinue
        New-NetEventSession -Name $sessionName -LocalFilePath $capturePath -CaptureMode SaveToFile -MaxFileSize 16 | Out-Null
        Add-NetEventPacketCaptureProvider -SessionName $sessionName -IpProtocols 17 -TruncationLength 96 | Out-Null
        Start-NetEventSession -Name $sessionName
        Start-Sleep -Seconds 3
        Stop-NetEventSession -Name $sessionName
        Remove-NetEventSession -Name $sessionName
        & pktmon format $capturePath -o $textPath *> $null

        $localAddresses = @(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
            Select-Object -ExpandProperty IPAddress)
        $flows = @{}
        foreach ($line in Get-Content -LiteralPath $textPath -ErrorAction SilentlyContinue) {
            if ($line -notmatch '(?<source>\d{1,3}(?:\.\d{1,3}){3})\.(?<sourcePort>\d+) > (?<destination>\d{1,3}(?:\.\d{1,3}){3})\.(?<destinationPort>\d+): UDP') {
                continue
            }

            $source = $Matches.source
            $sourcePort = [int]$Matches.sourcePort
            $destination = $Matches.destination
            $destinationPort = [int]$Matches.destinationPort
            if ($destinationPort -eq $config.GamePort -and $source -notin $localAddresses -and $source -ne '127.0.0.1') {
                $key = "$source`:$sourcePort"
                if (-not $flows.ContainsKey($key)) { $flows[$key] = @{ Inbound = $false; Outbound = $false } }
                $flows[$key].Inbound = $true
            }
            if ($sourcePort -eq $config.GamePort -and $destination -notin $localAddresses -and $destination -ne '127.0.0.1') {
                $key = "$destination`:$destinationPort"
                if (-not $flows.ContainsKey($key)) { $flows[$key] = @{ Inbound = $false; Outbound = $false } }
                $flows[$key].Outbound = $true
            }
        }

        $count = @($flows.Values | Where-Object { $_.Inbound -and $_.Outbound }).Count
        $result = [pscustomobject]@{
            Supported = $true
            CurrentPlayers = [math]::Min($count, $config.MaxPlayers)
            MaxPlayers = $config.MaxPlayers
            Message = 'Estimated from active bidirectional game-port connections.'
        }
        $json = $result | ConvertTo-Json -Compress
        Set-Content -LiteralPath $cachePath -Value $json -Encoding utf8
        $json
    }
    finally {
        Stop-NetEventSession -Name $sessionName -ErrorAction SilentlyContinue
        Remove-NetEventSession -Name $sessionName -ErrorAction SilentlyContinue
        Remove-Item -LiteralPath $capturePath, $textPath -Force -ErrorAction SilentlyContinue
    }
}
catch {
    [pscustomobject]@{
        Supported = $false
        CurrentPlayers = $null
        MaxPlayers = $config.MaxPlayers
        Message = "Player connection probe failed: $($_.Exception.Message)"
    } | ConvertTo-Json -Compress
}
finally {
    if ($lockStream) { $lockStream.Dispose() }
}
