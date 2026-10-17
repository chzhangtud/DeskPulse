[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [string]$CollectorPath = '',
    [Parameter(Mandatory = $true)][string]$ListenAddress,
    [ValidateRange(1,65535)][int]$Port = 9443
)
$ErrorActionPreference = 'Stop'
if (-not $CollectorPath) {
    $CollectorPath = Join-Path $PSScriptRoot 'DeskPulse.Collector.exe'
    if (-not (Test-Path -LiteralPath $CollectorPath)) { $CollectorPath = Join-Path (Split-Path -Parent $PSScriptRoot) 'artifacts\collector\DeskPulse.Collector.exe' }
}
$taskExe = (Resolve-Path -LiteralPath $CollectorPath).Path
$taskWatcher = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot 'Watch-Collector.ps1')).Path
$taskIp = $null
if (-not [Net.IPAddress]::TryParse($ListenAddress, [ref]$taskIp) -or $taskIp.AddressFamily -ne [Net.Sockets.AddressFamily]::InterNetwork -or $ListenAddress -notmatch '^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)') {
    throw 'Use the same private LAN IPv4 address as the phone and firewall rule.'
}
$taskName = 'DeskPulse-Collector'
$taskUser = [Security.Principal.WindowsIdentity]::GetCurrent()
$taskSid = $taskUser.User.Value
$taskActionArguments = '-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "{0}" -CollectorPath "{1}" -ListenAddress {2} -Port {3}' -f $taskWatcher,$taskExe,$ListenAddress,$Port
$taskAction = New-ScheduledTaskAction -Execute "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -Argument $taskActionArguments -WorkingDirectory (Split-Path -Parent $taskExe)
$taskTrigger = New-ScheduledTaskTrigger -AtLogOn -User $taskSid
$taskTrigger.Delay = 'PT15S'
$taskPrincipal = New-ScheduledTaskPrincipal -UserId $taskSid -LogonType Interactive -RunLevel Highest
$taskSettings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
$taskDefinition = New-ScheduledTask -Action $taskAction -Trigger $taskTrigger -Principal $taskPrincipal -Settings $taskSettings -Description 'DeskPulse collector: hidden elevated monitoring after this user signs in; preserves local pairing state.'
if (-not $PSCmdlet.ShouldProcess($taskName, 'Register and start automatic collector at current-user logon')) {
    return $taskDefinition
}
if (-not (New-Object Security.Principal.WindowsPrincipal($taskUser)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'Registering elevated startup requires an administrator PowerShell.'
}
$taskExisting = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($taskExisting -and $taskExisting.Description -notlike 'DeskPulse collector:*') { throw 'An unrelated scheduled task has this name. It was not modified.' }
if ($taskExisting -and $taskExisting.State -eq 'Running') { Stop-ScheduledTask -TaskName $taskName }
Register-ScheduledTask -TaskName $taskName -InputObject $taskDefinition -Force | Out-Null
Start-ScheduledTask -TaskName $taskName
Write-Host 'DeskPulse starts hidden 15 seconds after this user signs in, with CPU sensor privileges. No password is stored.'
