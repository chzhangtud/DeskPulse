param(
    [Parameter(Mandatory = $true)][string]$CollectorPath,
    [Parameter(Mandatory = $true)][string]$ListenAddress,
    [int]$Port = 9443
)
$ErrorActionPreference = 'Stop'
$taskExe = (Resolve-Path -LiteralPath $CollectorPath).Path
$taskDirectory = Split-Path -Parent $taskExe
$taskState = Join-Path $taskDirectory 'state'
New-Item -ItemType Directory -Force -Path $taskState | Out-Null
while ($true) {
    try {
        # Wait for this specific LAN address, rather than binding a boot-time fallback.
        if (-not (Get-NetIPAddress -AddressFamily IPv4 -IPAddress $ListenAddress -ErrorAction SilentlyContinue)) {
            Start-Sleep -Seconds 10
            continue
        }
        $taskProcess = $null
        foreach ($taskListener in Get-NetTCPConnection -LocalAddress $ListenAddress -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) {
            $taskCandidate = Get-Process -Id $taskListener.OwningProcess -ErrorAction SilentlyContinue
            if ($taskCandidate -and $taskCandidate.Path -eq $taskExe) { $taskProcess = $taskCandidate; break }
        }
        # Adopt an already-running copy instead of starting another collector.
        if (-not $taskProcess) {
            $taskProcess = Start-Process -FilePath $taskExe -ArgumentList '--listen',$ListenAddress,'--port',"$Port" -WorkingDirectory $taskDirectory -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $taskState 'startup.stdout.log') -RedirectStandardError (Join-Path $taskState 'startup.stderr.log')
        }
        Set-Content -LiteralPath (Join-Path $taskState 'collector.pid') -Value $taskProcess.Id
        $taskProcess.WaitForExit()
    } catch {
        Set-Content -LiteralPath (Join-Path $taskState 'startup-error.txt') -Value $_.Exception.Message
    }
    Start-Sleep -Seconds 10
}
