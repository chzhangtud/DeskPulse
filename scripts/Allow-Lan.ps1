param(
    [Parameter(Mandatory=$true)][string]$Program,
    [Parameter(Mandatory=$true)][string]$LocalAddress,
    [string]$RemoteAddress = 'LocalSubnet',
    [int]$Port = 9443
)
$ErrorActionPreference = 'Stop'
$resolvedProgram = (Resolve-Path -LiteralPath $Program).Path
$parsed = [System.Net.IPAddress]::Parse($LocalAddress)
if ($parsed.AddressFamily -ne 'InterNetwork' -or $LocalAddress -notmatch '^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)') { throw 'Use a private LAN IPv4 address.' }
# Scope the rule to one program, address, TCP port and LAN clients, including public-profile home networks.
$ruleName = "DeskPulse-LAN-$Port"
Get-NetFirewallRule -Name $ruleName -ErrorAction SilentlyContinue | Remove-NetFirewallRule
New-NetFirewallRule -Name $ruleName -DisplayName "DeskPulse LAN HTTPS ($Port)" -Direction Inbound -Action Allow -Protocol TCP -LocalPort $Port -LocalAddress $LocalAddress -RemoteAddress $RemoteAddress -Program $resolvedProgram -Profile Any | Out-Null
Write-Host "Allowed $resolvedProgram at ${LocalAddress}:$Port from $RemoteAddress only."
