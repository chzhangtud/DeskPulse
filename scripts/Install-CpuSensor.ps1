# Optional signed driver needed by LibreHardwareMonitor for CPU die/package temperatures.
# Run once in an administrator PowerShell, then restart the collector as administrator.
$ErrorActionPreference = 'Stop'
$taskIdentity = [Security.Principal.WindowsIdentity]::GetCurrent()
$taskPrincipal = New-Object Security.Principal.WindowsPrincipal($taskIdentity)
if (-not $taskPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'CPU sensor setup requires an administrator PowerShell.'
}
if (Test-Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\PawnIO') {
    Write-Host 'PawnIO is already installed. Restart the collector as administrator.'
    return
}
$taskInstaller = Join-Path ([IO.Path]::GetTempPath()) ('DeskPulse-PawnIO-' + [guid]::NewGuid().ToString() + '.exe')
try {
    # Pin both the official release content and its valid publisher signature.
    Invoke-WebRequest 'https://github.com/namazso/PawnIO.Setup/releases/download/2.2.0/PawnIO_setup.exe' -OutFile $taskInstaller -UseBasicParsing
    $taskExpectedHash = '1F519A22E47187F70A1379A48CA604981C4FCF694F4E65B734AAA74A9FBA3032'
    if ((Get-FileHash -LiteralPath $taskInstaller -Algorithm SHA256).Hash -ne $taskExpectedHash) { throw 'CPU sensor installer hash mismatch.' }
    $taskSignature = Get-AuthenticodeSignature -LiteralPath $taskInstaller
    if ($taskSignature.Status -ne 'Valid' -or $taskSignature.SignerCertificate.Subject -notmatch 'CN=namazso\.eu(?:,|$)') {
        throw 'CPU sensor installer publisher signature is not valid.'
    }
    # Use the normal signed-module edition, never the unrestricted developer edition.
    $taskInstall = Start-Process -FilePath $taskInstaller -ArgumentList '-install','-silent' -WindowStyle Hidden -Wait -PassThru
    if ($taskInstall.ExitCode -ne 0) { throw "CPU sensor setup failed: $($taskInstall.ExitCode)" }
    Write-Host 'PawnIO installed. Restart the collector as administrator.'
} finally {
    if (Test-Path -LiteralPath $taskInstaller) { Remove-Item -LiteralPath $taskInstaller }
}
