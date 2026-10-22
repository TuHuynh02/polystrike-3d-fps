<#
.SYNOPSIS
  Removes the "PolystrikeLAN" autostart task created by install-lan-autostart.ps1 (and stops the server it started).
.PARAMETER Port
  Port used at install time; only needed to remove the firewall rule (administrator PowerShell).
#>
[CmdletBinding(SupportsShouldProcess = $true)]
param(
  [int]$Port = 3000,
  [string]$TaskName = 'PolystrikeLAN'
)

$ErrorActionPreference = 'Stop'

$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($task) {
  if ($PSCmdlet.ShouldProcess("Scheduled task '$TaskName'", 'Stop and unregister')) {
    Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Host "Task '$TaskName' removed."
  }
} else {
  Write-Host "Task '$TaskName' does not exist; nothing to remove."
}

$ruleName = "Polystrike LAN ($Port)"
if (Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue) {
  $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
  if ($isAdmin) {
    if ($PSCmdlet.ShouldProcess('Windows Firewall', "Remove rule '$ruleName'")) {
      Get-NetFirewallRule -DisplayName $ruleName | Remove-NetFirewallRule
      Write-Host "Firewall rule '$ruleName' removed."
    }
  } else {
    Write-Warning "Firewall rule '$ruleName' exists; run this script in an administrator PowerShell to remove it."
  }
}
