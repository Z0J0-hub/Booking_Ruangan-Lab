param(
    [ValidateSet('Install', 'Start', 'Stop', 'Status')]
    [string]$Action = 'Status'
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$runtimeRoot = Join-Path $projectRoot '.jenkins-local'
$jenkinsHomePath = Join-Path $runtimeRoot 'home'
$javaPath = Join-Path $runtimeRoot 'jre\bin\java.exe'
$warPath = Join-Path $runtimeRoot 'jenkins.war'
$pidPath = Join-Path $runtimeRoot 'jenkins.pid'
$baseUrl = 'http://127.0.0.1:8081'

function Download-CheckedFile([string]$Uri, [string]$Destination, [string]$ExpectedHash) {
    $temporaryDownload = "$Destination.download"
    Invoke-WebRequest -UseBasicParsing -Uri $Uri -OutFile $temporaryDownload -TimeoutSec 120
    $actualHash = (Get-FileHash -LiteralPath $temporaryDownload -Algorithm SHA256).Hash
    if ($actualHash -ne $ExpectedHash.Trim()) {
        throw "SHA256 verification failed: $Destination"
    }
    Move-Item -LiteralPath $temporaryDownload -Destination $Destination -Force
}

if ($Action -eq 'Install') {
    New-Item -ItemType Directory -Path $runtimeRoot -Force | Out-Null
    if (!(Test-Path -LiteralPath $javaPath)) {
        Write-Output 'Downloading Temurin Java 21 JRE for this Jenkins workspace only...'
        $assets = Invoke-RestMethod 'https://api.adoptium.net/v3/assets/latest/21/hotspot?architecture=x64&image_type=jre&os=windows&vendor=eclipse'
        $package = @($assets)[0].binary.package
        $javaArchive = Join-Path $runtimeRoot 'java.zip'
        Download-CheckedFile $package.link $javaArchive $package.checksum
        $extractPath = Join-Path $runtimeRoot 'java-extracted'
        Expand-Archive -LiteralPath $javaArchive -DestinationPath $extractPath -Force
        $jreDirectory = Get-ChildItem -LiteralPath $extractPath -Directory | Select-Object -First 1
        if (!$jreDirectory) { throw 'Java archive does not contain a runtime directory.' }
        $jreDestination = [System.IO.Path]::GetFullPath((Join-Path $runtimeRoot 'jre'))
        $verifiedExtractRoot = [System.IO.Path]::GetFullPath($extractPath) + [System.IO.Path]::DirectorySeparatorChar
        $verifiedRuntimeRoot = [System.IO.Path]::GetFullPath($runtimeRoot) + [System.IO.Path]::DirectorySeparatorChar
        if (!$jreDirectory.FullName.StartsWith($verifiedExtractRoot, [System.StringComparison]::OrdinalIgnoreCase) -or !$jreDestination.StartsWith($verifiedRuntimeRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
            throw 'Java extraction paths must remain inside the local Jenkins workspace.'
        }
        Move-Item -LiteralPath $jreDirectory.FullName -Destination $jreDestination
    }
    if (!(Test-Path -LiteralPath $warPath)) {
        $jenkinsVersion = (Invoke-RestMethod 'https://updates.jenkins.io/stable/latestCore.txt').Trim()
        if ($jenkinsVersion -notmatch '^\d+\.\d+\.\d+$') { throw 'Unexpected Jenkins LTS version response.' }
        $warUrl = "https://get.jenkins.io/war-stable/$jenkinsVersion/jenkins.war"
        $warHash = ((Invoke-RestMethod "$warUrl.sha256").Trim() -split '\s+')[0]
        Write-Output "Downloading Jenkins LTS $jenkinsVersion..."
        Download-CheckedFile $warUrl $warPath $warHash
        Set-Content -LiteralPath (Join-Path $runtimeRoot 'jenkins-version.txt') -Value $jenkinsVersion
    }
    Write-Output 'Local runtime installed. Run this script with -Action Start.'
    exit
}

$jenkinsProcess = $null
if (Test-Path -LiteralPath $pidPath) {
    $processIdText = (Get-Content -LiteralPath $pidPath -Raw).Trim()
    if ($processIdText -match '^\d+$') {
        $candidate = Get-Process -Id ([int]$processIdText) -ErrorAction SilentlyContinue
        if ($candidate -and $candidate.Path -eq $javaPath) {
            $jenkinsProcess = $candidate
        }
    }
}

if ($Action -eq 'Stop') {
    if ($jenkinsProcess) {
        Stop-Process -Id $jenkinsProcess.Id
        Write-Output 'Local Jenkins stopped. Configuration and builds are preserved.'
    } else { Write-Output 'Local Jenkins is not running.' }
    exit
}

if ($Action -eq 'Status') {
    if ($jenkinsProcess) { Write-Output "Local Jenkins process $($jenkinsProcess.Id): $baseUrl" }
    else { Write-Output 'Local Jenkins is not running.' }
    exit
}

if ($jenkinsProcess) { Write-Output "Jenkins already running: $baseUrl"; exit }
if (!(Test-Path -LiteralPath $javaPath) -or !(Test-Path -LiteralPath $warPath)) {
    throw 'Install the runtime first: -Action Install'
}
if (Get-NetTCPConnection -LocalPort 8081 -State Listen -ErrorAction SilentlyContinue) {
    throw 'Port 8081 is already in use. Stop the conflicting process before starting Jenkins.'
}
New-Item -ItemType Directory -Path $jenkinsHomePath -Force | Out-Null
$previousJenkinsHome = $env:JENKINS_HOME
try {
    $env:JENKINS_HOME = $jenkinsHomePath
    $processArguments = @('-Xms256m', '-Xmx1024m', '-jar', ('"' + $warPath + '"'), '--httpListenAddress=127.0.0.1', '--httpPort=8081')
    $startedProcess = Start-Process -FilePath $javaPath -ArgumentList $processArguments -WorkingDirectory $runtimeRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runtimeRoot 'stdout.log') -RedirectStandardError (Join-Path $runtimeRoot 'stderr.log')
    Set-Content -LiteralPath $pidPath -Value $startedProcess.Id
} finally {
    $env:JENKINS_HOME = $previousJenkinsHome
}
Write-Output "Jenkins starting: $baseUrl"
Write-Output "Unlock password file: $(Join-Path $jenkinsHomePath 'secrets\initialAdminPassword')"
Write-Output "Logs: $runtimeRoot"
