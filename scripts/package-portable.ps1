param(
    [Parameter(Mandatory = $true)][string]$CompiledExe,
    [switch]$AllowMissingIcons
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$appVersion = (Get-Content -LiteralPath (Join-Path $projectRoot "package.json") -Raw | ConvertFrom-Json).version
$portableRoot = Join-Path $projectRoot "release\portable"
if (-not (Test-Path -LiteralPath $CompiledExe)) { throw "Portable executable missing." }
New-Item -ItemType Directory -Path $portableRoot -Force | Out-Null
$destination = Join-Path $portableRoot "TaleBranch-$appVersion-portable.exe"
Copy-Item -LiteralPath $CompiledExe -Destination $destination -Force
$check = Start-Process -FilePath $destination -ArgumentList "--self-test" -WindowStyle Hidden -Wait -PassThru
if ($check.ExitCode -ne 0) { throw "Packaged self-test failed ($($check.ExitCode))." }
$report = Get-Content -LiteralPath (Join-Path $portableRoot "TaleBranch-data\self-test-result.json") -Raw | ConvertFrom-Json
if ($report.result -ne "passed" -or $report.version -ne $appVersion) { throw "Invalid packaged self-test report." }
if (-not $AllowMissingIcons -and $report.embeddedGameIcons -lt 1000) { throw "The local game icon set is incomplete. Use -AllowMissingIcons only for a source build with placeholder icons." }
Copy-Item -LiteralPath (Join-Path $projectRoot "docs\PORTABLE_RU.md") -Destination (Join-Path $portableRoot "README_RU.md") -Force
Copy-Item -LiteralPath (Join-Path $projectRoot "LICENSE") -Destination (Join-Path $portableRoot "LICENSE.txt") -Force
Copy-Item -LiteralPath (Join-Path $projectRoot "THIRD_PARTY_NOTICES.md") -Destination (Join-Path $portableRoot "THIRD_PARTY_NOTICES.md") -Force
Copy-Item -LiteralPath (Join-Path $projectRoot "CHANGELOG.md") -Destination (Join-Path $portableRoot "CHANGELOG.md") -Force
$archive = Join-Path $portableRoot "TaleBranch-$appVersion-portable.zip"
Compress-Archive -LiteralPath $destination,(Join-Path $portableRoot "README_RU.md"),(Join-Path $portableRoot "LICENSE.txt"),(Join-Path $portableRoot "THIRD_PARTY_NOTICES.md"),(Join-Path $portableRoot "CHANGELOG.md") -DestinationPath $archive -Force
$checksums = @($destination, $archive) | ForEach-Object {
    $inputStream = [IO.File]::OpenRead($_)
    $hasher = [Security.Cryptography.SHA256]::Create()
    try { $digest = [BitConverter]::ToString($hasher.ComputeHash($inputStream)).Replace("-", "") }
    finally { $inputStream.Dispose(); $hasher.Dispose() }
    "$digest  $([IO.Path]::GetFileName($_))"
}
[IO.File]::WriteAllLines((Join-Path $portableRoot "TaleBranch-$appVersion-SHA256.txt"), $checksums, (New-Object Text.UTF8Encoding($false)))
Write-Host "Portable ready: $destination"
Write-Host "Archive: $archive"
Write-Host "Embedded assets: $($report.embeddedAssets); game icons: $($report.embeddedGameIcons); no server required."
