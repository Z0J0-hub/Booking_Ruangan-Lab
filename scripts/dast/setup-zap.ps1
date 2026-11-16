$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$version = '2.17.0'
$expected = '94c8f767b1c2e94f0db66b3ae56514d5e3f5a728ee1b6c798e0c8fe2d61fbff0'
$project = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$directory = Join-Path $project '.tools\zap'
$archive = Join-Path $directory "ZAP_${version}_Crossplatform.zip"
New-Item -ItemType Directory -Path $directory -Force | Out-Null
if (-not (Test-Path -LiteralPath $archive) -and $env:ZAP_ARCHIVE_CACHE) {
    if (-not (Test-Path -LiteralPath $env:ZAP_ARCHIVE_CACHE -PathType Leaf)) { throw 'Configured ZAP archive cache is missing.' }
    if ((Get-FileHash -LiteralPath $env:ZAP_ARCHIVE_CACHE -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expected) {
        throw 'Configured ZAP archive cache checksum mismatch.'
    }
    Copy-Item -LiteralPath $env:ZAP_ARCHIVE_CACHE -Destination $archive
}
if (-not (Test-Path -LiteralPath $archive)) {
    $partial = "$archive.partial"
    & curl.exe --fail --location --silent --show-error --connect-timeout 20 --max-time 300 --retry 3 --retry-delay 2 --retry-all-errors --retry-max-time 360 --continue-at - --output $partial "https://github.com/zaproxy/zaproxy/releases/download/v$version/ZAP_${version}_Crossplatform.zip"
    if ($LASTEXITCODE -ne 0) { throw 'Cannot download pinned ZAP distribution.' }
    if ((Get-FileHash -LiteralPath $partial -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expected) {
        throw 'ZAP download checksum mismatch.'
    }
    Move-Item -LiteralPath $partial -Destination $archive -Force
}
if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expected) {
    throw 'Cached ZAP archive checksum mismatch.'
}
# Re-extract verified distribution on each setup. No system install or PATH changes.
Expand-Archive -LiteralPath $archive -DestinationPath $directory -Force
Write-Output "ZAP $version verified and extracted in .tools/zap/. Java 17+ required."
