# Downloads the mood-matched background music tracks listed in
# extension/music/manifest.json into extension/music/<mood>.<ext>.
# Idempotent: skips any file that already exists.
#
# Run from a terminal:
#   powershell -ExecutionPolicy Bypass -File download-music.ps1

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$musicDir = Join-Path $root 'extension/music'
$manifestPath = Join-Path $musicDir 'manifest.json'

if (-not (Test-Path $manifestPath)) {
  Write-Host "Manifest not found at $manifestPath" -ForegroundColor Red
  exit 1
}

try {
  $manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
} catch {
  Write-Host "Failed to parse $manifestPath" -ForegroundColor Red
  exit 1
}

$failed = 0
foreach ($mood in $manifest.PSObject.Properties.Name) {
  $track = $manifest.$mood
  $dest = Join-Path $musicDir $track.file

  if (Test-Path $dest) {
    Write-Host "[skip] $mood -> $($track.file) (already exists)"
    continue
  }

  Write-Host "[download] $mood -> $($track.file)"
  try {
    Invoke-WebRequest -Uri $track.url -OutFile $dest -UseBasicParsing
    $size = (Get-Item $dest).Length
    Write-Host ("  ok: {0:N1} MB" -f ($size / 1MB))
  } catch {
    Write-Host "  FAILED to download $mood from $($track.url)" -ForegroundColor Red
    Remove-Item $dest -ErrorAction SilentlyContinue
    $failed++
  }
}

if ($failed -gt 0) {
  Write-Host "$failed track(s) FAILED to download. The extension will have no music for those moods." -ForegroundColor Red
  exit 1
}
Write-Host "Done."
