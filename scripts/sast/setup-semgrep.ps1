param([switch]$Resolve)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$project = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$tools = Join-Path $project '.tools'
$uvDir = Join-Path $tools 'uv-0.13.8'
$archive = Join-Path $tools 'uv-0.13.8.zip'
$expected = '529e78a9cec6cd7e3e014f7ecd8bda0c113969d4ed0f2efeedb85c30943325b8'
New-Item -ItemType Directory -Path $uvDir -Force | Out-Null
if (-not (Test-Path -LiteralPath $archive)) {
    & curl.exe --fail --location --silent --show-error --connect-timeout 20 --max-time 180 --retry 2 --output "$archive.partial" 'https://github.com/astral-sh/uv/releases/download/0.13.8/uv-x86_64-pc-windows-msvc.zip'
    if ($LASTEXITCODE -ne 0) { throw 'uv download failed.' }
    if ((Get-FileHash -LiteralPath "$archive.partial" -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expected) { throw 'uv download checksum mismatch.' }
    Move-Item -LiteralPath "$archive.partial" -Destination $archive -Force
}
if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expected) { throw 'uv checksum mismatch.' }
Expand-Archive -LiteralPath $archive -DestinationPath $uvDir -Force
$uv = Join-Path $uvDir 'uv.exe'
$env:UV_CACHE_DIR = Join-Path $tools 'uv-cache'
$env:UV_PYTHON_INSTALL_DIR = Join-Path $tools 'python'
$env:UV_PYTHON_PREFERENCE = 'only-managed'
$env:UV_SYSTEM_CERTS = 'true'
$env:UV_NO_CONFIG = '1'
$venv = Join-Path $tools 'semgrep\venv'
if (-not (Test-Path -LiteralPath (Join-Path $venv 'Scripts\python.exe'))) {
    & $uv venv --python 3.13 $venv
    if ($LASTEXITCODE -ne 0) { throw 'Cannot prepare managed Python for Semgrep.' }
}
$python = Join-Path $venv 'Scripts\python.exe'
$lock = Join-Path $PSScriptRoot 'requirements.lock'
if ($Resolve) {
    & $uv pip compile --python $python --generate-hashes --only-binary :all: --output-file $lock (Join-Path $PSScriptRoot 'requirements.in') --quiet
    if ($LASTEXITCODE -ne 0) { throw 'Cannot resolve Semgrep requirements.' }
}
if (-not (Test-Path -LiteralPath $lock)) { throw 'Missing reviewed Semgrep requirements.lock.' }
& $uv pip sync --python $python --require-hashes --only-binary :all: $lock --quiet
if ($LASTEXITCODE -ne 0) { throw 'Cannot install hash-locked Semgrep dependencies.' }
Write-Output 'Semgrep 1.185.0 installed locally in .tools/semgrep/venv; system Python/PATH unchanged.'
