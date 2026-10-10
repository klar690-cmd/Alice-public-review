param([ValidateSet('start', 'stop', 'status')][string]$Action = 'start')
$ErrorActionPreference = 'Stop'
$projectRootPath = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../../../..')).Path
$vitePath = Join-Path $projectRootPath 'node_modules/vite/bin/vite.js'
$runtimeDirPath = Join-Path $PSScriptRoot '.runtime'
$recordPath = Join-Path $runtimeDirPath 'browser-process.json'
$url = 'http://127.0.0.1:1448/docs/alice/v2/m3g/Alice-browser.html'

function Get-OwnedBrowserProcess {
    if (-not (Test-Path -LiteralPath $recordPath)) { return $null }
    $record = Get-Content -Raw -LiteralPath $recordPath | ConvertFrom-Json
    $processInfo = Get-CimInstance Win32_Process -Filter ('ProcessId = ' + [int]$record.processId) -ErrorAction SilentlyContinue
    if (-not $processInfo) { return $null }
    $expectedArgument = $vitePath.Replace('\', '/')
    $actualArguments = ([string]$processInfo.CommandLine).Replace('\', '/')
    if (-not $actualArguments.Contains($expectedArgument) -or -not $actualArguments.Contains('--port 1448') -or -not $actualArguments.Contains('--host 127.0.0.1')) {
        throw 'The recorded PID does not belong to this Alice browser launcher. No process was stopped.'
    }
    return $processInfo
}

$ownedProcess = Get-OwnedBrowserProcess
if ($Action -eq 'stop') {
    if ($ownedProcess) {
        Stop-Process -Id $ownedProcess.ProcessId
        Wait-Process -Id $ownedProcess.ProcessId -Timeout 5 -ErrorAction SilentlyContinue
        Write-Output ('Stopped only the Alice R271 browser process ' + $ownedProcess.ProcessId)
    } else { Write-Output 'Alice R271 browser is already stopped.' }
    return
}
if ($Action -eq 'status') {
    Write-Output $(if ($ownedProcess) { 'RUNNING ' + $url } else { 'STOPPED' })
    return
}
if (-not $ownedProcess) {
    if (Get-NetTCPConnection -LocalPort 1448 -State Listen -ErrorAction SilentlyContinue) {
        throw 'Port 1448 belongs to another process. It was not interrupted.'
    }
    if (-not (Test-Path -LiteralPath $vitePath)) { throw 'Cached Vite is unavailable. No dependency will be installed.' }
    $nodeExePath = (Get-Command node -CommandType Application | Select-Object -First 1).Source
    New-Item -ItemType Directory -Path $runtimeDirPath -Force | Out-Null
    $arguments = @('"' + $vitePath + '"', '--host', '127.0.0.1', '--port', '1448', '--strictPort', '--mode', 'alice-preview')
    $child = Start-Process -FilePath $nodeExePath -ArgumentList $arguments -WorkingDirectory $projectRootPath -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runtimeDirPath 'vite-output.log') -RedirectStandardError (Join-Path $runtimeDirPath 'vite-error.log')
    [ordered]@{ processId = $child.Id; port = 1448; host = '127.0.0.1'; project = $projectRootPath; vite = $vitePath; url = $url; createdUtc = [DateTime]::UtcNow.ToString('o') } | ConvertTo-Json | Set-Content -LiteralPath $recordPath -Encoding utf8
}
$ready = $false
for ($attempt = 0; $attempt -lt 30; $attempt++) {
    try {
        $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 2
        if ($response.StatusCode -eq 200 -and $response.Content.Contains('alice-browser-revision')) { $ready = $true; break }
    } catch { Start-Sleep -Milliseconds 400 }
}
if (-not $ready) { throw 'Alice did not answer on loopback. Read the local .runtime logs; no other server was changed.' }
Write-Output $url
Write-Output 'Open the link on this Windows computer. Stop only this server with Open-Alice.ps1 -Action stop.'
