param([string]$Destination, [string]$PackageRoot)
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$taskAssets = Get-Content -LiteralPath "$taskRoot\collector\obj\project.assets.json" -Raw | ConvertFrom-Json
New-Item -ItemType Directory -Force -Path $Destination | Out-Null
$taskManifest = @('# Resolved package source and license metadata', '')
foreach ($taskEntry in $taskAssets.libraries.PSObject.Properties) {
    if ($taskEntry.Value.type -ne 'package') { continue }
    $taskPackagePath = Join-Path $PackageRoot $taskEntry.Value.path
    $taskNuspec = Get-ChildItem -LiteralPath $taskPackagePath -Filter *.nuspec | Select-Object -First 1
    if (-not $taskNuspec) { throw "Missing package metadata: $($taskEntry.Name)" }
    [xml]$taskMetadata = Get-Content -LiteralPath $taskNuspec.FullName -Raw
    $taskInfo = $taskMetadata.package.metadata
    $taskName = $taskEntry.Name.Replace('/', '-')
    $taskManifest += "- $($taskEntry.Name): $($taskInfo.license.InnerText) | $($taskInfo.projectUrl) | source $($taskInfo.repository.url) commit $($taskInfo.repository.commit)"
    Copy-Item -LiteralPath $taskNuspec.FullName -Destination (Join-Path $Destination ($taskName + '.nuspec'))
    foreach ($taskNotice in Get-ChildItem -LiteralPath $taskPackagePath -File -Recurse | Where-Object Name -Match '^(LICENSE|COPYING|THIRD.PARTY.NOTICES)(\..*)?$') {
        Copy-Item -LiteralPath $taskNotice.FullName -Destination (Join-Path $Destination ($taskName + '-' + $taskNotice.Name))
    }
}
$taskManifest | Set-Content -LiteralPath (Join-Path $Destination 'PACKAGES.md') -Encoding utf8
