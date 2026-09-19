# InsightFlow — start the full local dev stack as detached background processes.
# Run:  powershell -ExecutionPolicy Bypass -File start-dev.ps1
# Stops:  stop-dev.ps1
$ErrorActionPreference = "Continue"
$root   = Split-Path -Parent $MyInvocation.MyCommand.Path
$tools  = Join-Path $env:LOCALAPPDATA "InsightFlow"
$pgbin  = Join-Path $tools "pgbin\bin"
$pgdata = Join-Path $tools "pgdata"
$redis  = Join-Path $tools "redis\Redis-8.10.2-Windows-x64-msys2\redis-server.exe"
$logs   = Join-Path $root "logs"
New-Item -ItemType Directory -Force -Path $logs | Out-Null

$env:DATABASE_URL = "postgresql://postgres@localhost:5433/insightflow"
$env:REDIS_URL    = "redis://localhost:6379"
$env:JWT_SECRET   = "dev-secret-0123456789-abcdef"
$env:NODE_ENV     = "development"

function Up($port) { return Test-NetConnection -ComputerName localhost -Port $port -InformationLevel Quiet -WarningAction SilentlyContinue }

# 1) Postgres
if (Up 5433) { "postgres: already running" }
else {
  & "$pgbin\pg_ctl.exe" -D $pgdata -o "-p 5433" -l "$logs\postgres.log" start | Out-Null
  for ($i = 0; $i -lt 15 -and -not (Up 5433); $i++) { Start-Sleep -Seconds 1 }
  "postgres: started :5433"
}

# 2) Redis
if (Up 6379) { "redis: already running" }
else {
  Start-Process -FilePath $redis -ArgumentList "--port 6379 --save '' --appendonly no" -WindowStyle Hidden
  "redis: started :6379"
}

Start-Sleep -Seconds 3

# 3) Backend API
if (Up 4000) { "backend: already running" }
else {
  Start-Process -FilePath "cmd.exe" -WorkingDirectory "$root\backend" -WindowStyle Hidden `
    -ArgumentList '/c set DATABASE_URL=postgresql://postgres@localhost:5433/insightflow&& set REDIS_URL=redis://localhost:6379&& set JWT_SECRET=dev-secret-0123456789-abcdef&& set NODE_ENV=development&& npx tsx src\index.ts > ..\logs\backend.log 2>&1'
  "backend: starting :4000 (logs\backend.log)"
}

# 4) BullMQ worker
Start-Process -FilePath "cmd.exe" -WorkingDirectory "$root\backend" -WindowStyle Hidden `
  -ArgumentList '/c set DATABASE_URL=postgresql://postgres@localhost:5433/insightflow&& set REDIS_URL=redis://localhost:6379&& set JWT_SECRET=dev-secret-0123456789-abcdef&& set NODE_ENV=development&& npx tsx src\worker.ts > ..\logs\worker.log 2>&1'
"worker: starting (logs\worker.log)"

# 5) Frontend
if (Up 3000) { "frontend: already running" }
else {
  Start-Process -FilePath "cmd.exe" -WorkingDirectory "$root\frontend" -WindowStyle Hidden `
    -ArgumentList '/c set NEXT_PUBLIC_API_URL=http://localhost:4000&& set NEXT_PUBLIC_WS_URL=http://localhost:4000&& npx next dev -p 3000 > ..\logs\frontend.log 2>&1'
  "frontend: starting :3000 (logs\frontend.log)"
}

"`nWaiting for API + frontend…"
for ($i = 0; $i -lt 40; $i++) { if ((Up 4000) -and (Up 3000)) { break }; Start-Sleep -Seconds 2 }
"postgres :5433 $(if(Up 5433){'UP'}else{'DOWN'})"
"redis    :6379 $(if(Up 6379){'UP'}else{'DOWN'})"
"backend  :4000 $(if(Up 4000){'UP'}else{'DOWN'})"
"frontend :3000 $(if(Up 3000){'UP'}else{'DOWN'})"
"`nDashboard → http://localhost:3000   (demo@insightflow.dev / Demo123!)"
