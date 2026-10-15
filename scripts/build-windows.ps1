$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "dev-env.ps1")

$projectRoot = Split-Path -Parent $PSScriptRoot
$releaseRoot = Join-Path $projectRoot "release"
$portableRoot = Join-Path $releaseRoot "portable"
$installerRoot = Join-Path $releaseRoot "installer"

if (-not (Test-Path -LiteralPath $portableRoot)) {
    New-Item -ItemType Directory -Path $portableRoot | Out-Null
}
if (-not (Test-Path -LiteralPath $installerRoot)) {
    New-Item -ItemType Directory -Path $installerRoot | Out-Null
}

Push-Location $projectRoot
try {
    & npm.cmd test
    if ($LASTEXITCODE -ne 0) { throw "Automated tests failed." }

    & npm.cmd run tauri build -- --bundles nsis
    if ($LASTEXITCODE -ne 0) { throw "Tauri build failed." }

    $targetRoot = if ($env:CARGO_TARGET_DIR) {
        if ([IO.Path]::IsPathRooted($env:CARGO_TARGET_DIR)) { $env:CARGO_TARGET_DIR }
        else { Join-Path (Join-Path $projectRoot "src-tauri") $env:CARGO_TARGET_DIR }
    } else { Join-Path $projectRoot "src-tauri\target" }
    $compiledExe = Join-Path $targetRoot "release\talebranch.exe"
    if (-not (Test-Path -LiteralPath $compiledExe)) {
        throw "Portable executable was not found: $compiledExe"
    }
    $appVersion = (Get-Content -LiteralPath (Join-Path $projectRoot "package.json") -Raw | ConvertFrom-Json).version
    Copy-Item -LiteralPath $compiledExe -Destination (Join-Path $portableRoot "TaleBranch-$appVersion-portable.exe") -Force

    $bundleRoot = Join-Path $targetRoot "release\bundle\nsis"
    Get-ChildItem -LiteralPath $bundleRoot -Filter "*.exe" | ForEach-Object {
        Copy-Item -LiteralPath $_.FullName -Destination $installerRoot -Force
    }

    Write-Host ""
    Write-Host "Windows build is ready:"
    Write-Host "  Portable: $portableRoot"
    Write-Host "  Installer: $installerRoot"
}
finally {
    Pop-Location
}
