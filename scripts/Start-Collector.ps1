param([string]$ListenAddress = '', [int]$Port = 9443)
$ErrorActionPreference = 'Stop'
$collector = Join-Path $PSScriptRoot 'DeskPulse.Collector.exe'
if (-not (Test-Path -LiteralPath $collector)) { $collector = Join-Path (Split-Path -Parent $PSScriptRoot) 'artifacts\collector\DeskPulse.Collector.exe' }
if (-not (Test-Path -LiteralPath $collector)) { throw 'Run scripts/Build.ps1 first.' }
$arguments = @('--port', "$Port")
if ($ListenAddress) { $arguments += @('--listen', $ListenAddress) }
& $collector @arguments
