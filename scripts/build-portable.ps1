param([switch]$AllowMissingIcons)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "dev-env.ps1")
$projectRoot = Split-Path -Parent $PSScriptRoot
$appVersion = (Get-Content -LiteralPath (Join-Path $projectRoot "package.json") -Raw | ConvertFrom-Json).version
$portableRoot = Join-Path $projectRoot "release\portable"
$buildTemp = Join-Path $projectRoot ".dev-logs\build-temp"
New-Item -ItemType Directory -Path $buildTemp -Force | Out-Null
$env:TEMP = $buildTemp
$env:TMP = $buildTemp
Push-Location $projectRoot
try {
    & npm.cmd test
    if ($LASTEXITCODE -ne 0) { throw "Frontend tests failed." }
    & npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw "Frontend production build failed." }
    & cargo.exe test --manifest-path src-tauri/Cargo.toml --lib
    if ($LASTEXITCODE -ne 0) { throw "Native file tests failed." }
    & npm.cmd run tauri build -- --no-bundle --config (Join-Path $projectRoot "src-tauri\tauri.portable.conf.json")
    if ($LASTEXITCODE -ne 0) { throw "Portable build failed." }
    $targetRoot = if ($env:CARGO_TARGET_DIR) { $env:CARGO_TARGET_DIR } else { Join-Path $projectRoot "src-tauri\target" }
    $compiledExe = Join-Path $targetRoot "release\talebranch.exe"
    & (Join-Path $PSScriptRoot "package-portable.ps1") -CompiledExe $compiledExe -AllowMissingIcons:$AllowMissingIcons
}
finally { Pop-Location }
