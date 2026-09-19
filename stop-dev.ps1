# InsightFlow — stop the local dev stack started by start-dev.ps1
$tools  = Join-Path $env:LOCALAPPDATA "InsightFlow"
$pgbin  = Join-Path $tools "pgbin\bin"
$pgdata = Join-Path $tools "pgdata"

Get-Process node -ErrorAction SilentlyContinue | Where-Object {
  $_.CommandLine -match "tsx|next" -or $_.Path -match "nodejs"
} | ForEach-Object {
  try { $cmd = (Get-CimInstance Win32_Process -Filter "ProcessId=$($_.Id)").CommandLine
        if ($cmd -match "InsightFlow") { Stop-Process -Id $_.Id -Force; "stopped node $($_.Id)" } } catch {}
}
Get-Process redis-server -ErrorAction SilentlyContinue | Stop-Process -Force
"redis: stopped"
& "$pgbin\pg_ctl.exe" -D $pgdata stop -m fast 2>&1 | Select-Object -Last 1
"postgres: stopped"
