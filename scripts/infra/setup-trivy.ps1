$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$version = '0.76.2'
$expected = '691f737a7e5566a673c3a74dab9160552ec32101e953b659e5c77443d16dddb6'
$project = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$directory = Join-Path $project '.tools\trivy'
$archive = Join-Path $directory "trivy_${version}_windows-64bit.zip"
New-Item -ItemType Directory -Path $directory -Force | Out-Null
if (-not (Test-Path -LiteralPath $archive) -and $env:TRIVY_ARCHIVE_CACHE) {
    if ((Get-FileHash -LiteralPath $env:TRIVY_ARCHIVE_CACHE -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expected) { throw 'Trivy cache checksum mismatch.' }
    Copy-Item -LiteralPath $env:TRIVY_ARCHIVE_CACHE -Destination $archive
}
if (-not (Test-Path -LiteralPath $archive)) {
    $partial = "$archive.partial"
    & curl.exe --fail --location --silent --show-error --connect-timeout 20 --max-time 180 --retry 2 --retry-all-errors --retry-max-time 240 --continue-at - --output $partial "https://github.com/aquasecurity/trivy/releases/download/v$version/trivy_${version}_windows-64bit.zip"
    if ($LASTEXITCODE -ne 0) { throw 'Trivy download failed.' }
    if ((Get-FileHash -LiteralPath $partial -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expected) { throw 'Trivy download checksum mismatch.' }
    Move-Item -LiteralPath $partial -Destination $archive -Force
}
if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expected) { throw 'Trivy archive checksum mismatch.' }
Expand-Archive -LiteralPath $archive -DestinationPath (Join-Path $directory $version) -Force
Write-Output "Trivy $version verified and extracted in .tools/trivy/."
