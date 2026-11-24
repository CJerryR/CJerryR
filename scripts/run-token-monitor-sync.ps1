param(
    [string]$Repository = 'CJerryR/CJerryR',
    [string]$NodePath = 'node',
    [string]$GhPath = 'gh'
)

$ErrorActionPreference = 'Stop'
$env:TOKEN_CARD_GH = $GhPath
$logDirectory = Join-Path $env:LOCALAPPDATA 'TokenMonitorGitHub'
New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
$logPath = Join-Path $logDirectory 'sync.log'
Add-Content -LiteralPath $logPath -Value ("`r`n[{0}]" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'))

try {
    $output = & $NodePath (Join-Path $PSScriptRoot 'update-token-monitor.mjs') --publish --repo $Repository 2>&1
    $result = $LASTEXITCODE
    $output | Out-File -LiteralPath $logPath -Append -Encoding utf8
    exit $result
}
catch {
    Add-Content -LiteralPath $logPath -Value 'Updater could not run. Existing GitHub cards were preserved.'
    exit 1
}
