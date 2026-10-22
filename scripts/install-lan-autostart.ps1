<#
.SYNOPSIS
  Makes the Polystrike LAN server start by itself when you log in to this PC (Windows Scheduled Task).

.DESCRIPTION
  Registers a per-user task "PolystrikeLAN" that runs `node server/index.js --lan` (50 Hz LAN mode) hidden at logon, restarts it
  if it crashes and writes its output to %LOCALAPPDATA%\PolystrikeLAN\server.log. No administrator rights are needed.
  Run it ONCE on the PC that hosts the office LAN server. Remove it again with scripts\uninstall-lan-autostart.ps1.

.PARAMETER Port
  TCP port of the server (default 3000).
.PARAMETER StartNow
  Also start the server right away instead of waiting for the next logon.
.PARAMETER OpenFirewall
  Also allow inbound TCP on the port for the Private network profile (needs an administrator PowerShell).
.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File scripts\install-lan-autostart.ps1 -StartNow
  powershell -NoProfile -ExecutionPolicy Bypass -File scripts\install-lan-autostart.ps1 -WhatIf   # shows what would happen
#>
[CmdletBinding(SupportsShouldProcess = $true)]
param(
  [int]$Port = 3000,
  [string]$TaskName = 'PolystrikeLAN',
  [switch]$StartNow,
  [switch]$OpenFirewall
)

$ErrorActionPreference = 'Stop'

$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
if (-not (Test-Path (Join-Path $root 'server\index.js'))) { throw "server\index.js not found under $root" }
if (-not (Test-Path (Join-Path $root 'node_modules'))) { throw "node_modules is missing: run 'npm install' in $root first" }

$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) { throw 'Node.js was not found in PATH. Install Node.js (LTS) first.' }
$node = $nodeCmd.Source

$logDir = Join-Path $env:LOCALAPPDATA 'PolystrikeLAN'
$logFile = Join-Path $logDir 'server.log'

# The task runs a hidden PowerShell that starts node in the project folder and appends everything to the log file.
$command = "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; `$env:PORT = '$Port'; Set-Location -LiteralPath '$root'; & '$node' server/index.js --lan *>> '$logFile'"
$arguments = "-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -Command `"$command`""

$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $arguments -WorkingDirectory $root
$trigger = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -RestartCount 5 -RestartInterval (New-TimeSpan -Minutes 1) `
  -MultipleInstances IgnoreNew -StartWhenAvailable

if ($PSCmdlet.ShouldProcess("Scheduled task '$TaskName'", "Register (node server/index.js --lan on port $Port at logon)")) {
  New-Item -ItemType Directory -Force -Path $logDir | Out-Null
  Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings `
    -Description 'Polystrike 3D FPS LAN server (50 Hz), started at logon' -Force | Out-Null
  Write-Host "Task '$TaskName' registered. It starts the LAN server automatically each time you log in."
}

if ($OpenFirewall) {
  $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
  if (-not $isAdmin) {
    Write-Warning 'OpenFirewall needs an administrator PowerShell; skipped. Windows will ask once when node first listens: choose "Private networks".'
  } elseif ($PSCmdlet.ShouldProcess("Windows Firewall", "Allow inbound TCP $Port on Private networks")) {
    $ruleName = "Polystrike LAN ($Port)"
    Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue | Remove-NetFirewallRule
    New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Protocol TCP -LocalPort $Port -Profile Private -Action Allow | Out-Null
    Write-Host "Firewall rule '$ruleName' added (Private networks)."
  }
}

if ($StartNow -and $PSCmdlet.ShouldProcess("Scheduled task '$TaskName'", 'Start now')) {
  Start-ScheduledTask -TaskName $TaskName
  Write-Host 'Server starting...'
  Start-Sleep -Seconds 3
}

$ips = @(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
  Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } |
  Select-Object -ExpandProperty IPAddress)
Write-Host ''
Write-Host 'LAN address(es) of this PC:'
foreach ($ip in $ips) { Write-Host "  http://${ip}:$Port" }
if ($ips.Count -gt 0) {
  Write-Host ''
  Write-Host "Set this on the public server (Render > Environment):  LAN_SERVER_URL = http://$($ips[0]):$Port"
  Write-Host '(give this PC a fixed IP / DHCP reservation so the address never changes)'
}
Write-Host "Log file: $logFile"
