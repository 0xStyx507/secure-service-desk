param(
  [string]$Target = 'http://127.0.0.1:3001',
  [string]$ZapImage = 'ghcr.io/zaproxy/zaproxy:stable'
)

$ErrorActionPreference = 'Stop'
$workspace = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path

$ready = $false
for ($attempt = 0; $attempt -lt 5; $attempt++) {
  try {
    $response = Invoke-WebRequest -UseBasicParsing "$Target/api/health/live" -TimeoutSec 3
    if ($response.StatusCode -eq 200) {
      $ready = $true
      break
    }
  } catch {
    Start-Sleep -Seconds 2
  }
}
if (-not $ready) {
  throw "Target is not reachable at $Target. Start the complete stack first; the script does not create or stop MongoDB/Redis/API containers."
}

$zapTarget = $Target -replace '127\.0\.0\.1', 'host.docker.internal' -replace 'localhost', 'host.docker.internal'
docker run --rm --add-host host.docker.internal:host-gateway `
  -v "${workspace}:/zap/wrk/:rw" `
  $ZapImage zap-baseline.py `
  -t "$zapTarget/api/health/live" `
  -r zap-report.html `
  -J zap-report.json `
  -I
