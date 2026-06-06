param(
  [int]$Port = 3000,
  [string]$EnvFile = '',
  [string]$LogFile = 'C:\Users\USER\Documents\AgentOS\Agent-OS\.dev-server.log'
)

Set-Location 'C:\Users\USER\Documents\AgentOS\Agent-OS'
if (-not $env:AGENTOS_STATE_FILE) {
  Set-Item -Path 'Env:AGENTOS_STATE_FILE' -Value 'C:\Users\USER\Documents\AgentOS\Agent-OS\.agentos-runtime-state.json'
}

if ($EnvFile -and (Test-Path $EnvFile)) {
  Get-Content $EnvFile | ForEach-Object {
    if ($_ -match '^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$') {
      $name = $matches[1]
      $value = $matches[2].Trim()
      if ($value.Length -ge 2 -and $value.StartsWith('"') -and $value.EndsWith('"')) {
        $value = $value.Substring(1, $value.Length - 2)
      }
      Set-Item -Path "Env:$name" -Value $value
    }
  }
}

npm run dev -- --hostname 127.0.0.1 --port $Port *>> $LogFile
