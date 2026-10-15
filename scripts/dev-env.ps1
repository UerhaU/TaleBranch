$ErrorActionPreference = "Stop"

# Optional machine-specific paths stay outside version control.
$localSetup = Join-Path $PSScriptRoot "dev-env.local.ps1"
if (Test-Path -LiteralPath $localSetup) {
    . $localSetup
    return
}

if (-not (Get-Command cargo.exe -ErrorAction SilentlyContinue)) {
    throw "Rust/Cargo was not found. Install Rust and the Tauri 2 prerequisites for Windows, or configure scripts/dev-env.local.ps1."
}

Write-Host "Using the Rust toolchain configured in PATH."
