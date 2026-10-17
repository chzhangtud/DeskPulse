param([string]$AndroidSdk = $env:ANDROID_HOME, [string]$JavaHome = $env:JAVA_HOME)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Push-Location $root
try {
    $defaultSdk = Join-Path $env:LOCALAPPDATA 'Android\Sdk'
    if (-not $AndroidSdk -and (Test-Path -LiteralPath $defaultSdk)) { $AndroidSdk = $defaultSdk }
    if (-not $JavaHome) {
        foreach ($candidate in @((Join-Path $env:ProgramFiles 'Android\Android Studio\jbr'))) {
            if (Test-Path -LiteralPath "$candidate\bin\java.exe") { $JavaHome = $candidate; break }
        }
    }
    if ($AndroidSdk) { $env:ANDROID_HOME = $AndroidSdk }
    if ($JavaHome) { $env:JAVA_HOME = $JavaHome }
    dotnet publish collector -c Release -r win-x64 --self-contained true -o artifacts\collector
    if ($LASTEXITCODE -ne 0) { throw 'Collector build failed' }
    & android\gradlew.bat -p android assembleDebug lintDebug
    if ($LASTEXITCODE -ne 0) { throw 'Android build or lint failed' }
    node --test tests\core.test.cjs tests\i18n.test.cjs tests\stocks.test.cjs
    if ($LASTEXITCODE -ne 0) { throw 'Core tests failed' }
    New-Item -ItemType Directory -Force artifacts\android | Out-Null
    Copy-Item -LiteralPath android\app\build\outputs\apk\debug\app-debug.apk -Destination artifacts\android\DeskPulse-0.1.0.apk
    Copy-Item -LiteralPath scripts\Start-Collector.ps1,scripts\Allow-Lan.ps1,scripts\Install-CpuSensor.ps1,scripts\Register-CollectorStartup.ps1,scripts\Watch-Collector.ps1 -Destination artifacts\collector
    Copy-Item -LiteralPath THIRD_PARTY_NOTICES.md -Destination artifacts\collector
    Copy-Item -LiteralPath licenses -Destination artifacts\collector -Recurse -Force
    $packageRoot = $env:NUGET_PACKAGES
    if (-not $packageRoot) { $packageRoot = Join-Path $env:USERPROFILE '.nuget\packages' }
    $runtimeConfig = Get-Content -LiteralPath artifacts\collector\DeskPulse.Collector.runtimeconfig.json -Raw | ConvertFrom-Json
    foreach ($framework in $runtimeConfig.runtimeOptions.includedFrameworks) {
        $package = if ($framework.name -eq 'Microsoft.NETCore.App') { 'microsoft.netcore.app.runtime.win-x64' } else { 'microsoft.aspnetcore.app.runtime.win-x64' }
        $prefix = if ($framework.name -eq 'Microsoft.NETCore.App') { 'DOTNET' } else { 'ASPNET' }
        $runtimePath = Join-Path $packageRoot "$package\$($framework.version)"
        foreach ($notice in @('LICENSE.TXT', 'THIRD-PARTY-NOTICES.TXT')) {
            $sourceNotice = Join-Path $runtimePath $notice
            if (Test-Path -LiteralPath $sourceNotice) { Copy-Item -LiteralPath $sourceNotice -Destination "artifacts\collector\$prefix-$notice" }
        }
    }
    & scripts\Copy-PackageNotices.ps1 -Destination artifacts\collector\licenses -PackageRoot $packageRoot
    # Package only published files, never the running installation's private state directory.
    $distributionFiles = Get-ChildItem -LiteralPath artifacts\collector -File | Select-Object -ExpandProperty FullName
    $distributionFiles += (Resolve-Path -LiteralPath artifacts\collector\licenses).Path
    Compress-Archive -LiteralPath $distributionFiles -DestinationPath artifacts\DeskPulse-0.1.0-windows-x64.zip -Force
    Write-Host 'Outputs: artifacts/collector and artifacts/android/DeskPulse-0.1.0.apk'
} finally { Pop-Location }
