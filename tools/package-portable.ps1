$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$package = Get-Content -Raw (Join-Path $projectRoot "package.json") | ConvertFrom-Json
$version = $package.version
$portableRoot = Join-Path $projectRoot "portable-$version"
$appRoot = Join-Path $portableRoot "BMS Data Platform"
$stageRoot = Join-Path $portableRoot "app-stage"
$electronDist = Join-Path $projectRoot "node_modules\electron\dist"

if (Test-Path -LiteralPath $portableRoot) {
    throw "Output already exists: $portableRoot"
}
if (-not (Test-Path -LiteralPath (Join-Path $electronDist "electron.exe"))) {
    throw "Electron runtime is missing. Run pnpm install first."
}

New-Item -ItemType Directory -Path $appRoot, $stageRoot | Out-Null
Copy-Item -Path (Join-Path $electronDist "*") -Destination $appRoot -Recurse -Force
Copy-Item -LiteralPath (Join-Path $projectRoot "dist") -Destination $stageRoot -Recurse
Copy-Item -LiteralPath (Join-Path $projectRoot "electron") -Destination $stageRoot -Recurse
Copy-Item -LiteralPath (Join-Path $projectRoot "package.json") -Destination $stageRoot

& pnpm exec asar pack $stageRoot (Join-Path $appRoot "resources\app.asar")
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Rename-Item -LiteralPath (Join-Path $appRoot "electron.exe") -NewName "BMS Data Platform.exe"
Compress-Archive -LiteralPath $appRoot -DestinationPath (Join-Path $projectRoot "BMS-Data-Platform-$version-Windows-x64.zip") -CompressionLevel Optimal

Write-Output "Portable monitor created: $appRoot"
