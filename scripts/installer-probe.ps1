param(
  [ValidateSet('snapshot')][string]$Mode = 'snapshot'
)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$entries = @(Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*' -ErrorAction SilentlyContinue |
  Where-Object { $_.DisplayName -eq 'Elektron YT' -or $_.DisplayName -match '^Elektron YT [0-9]+\.' } |
  Select-Object DisplayName, DisplayVersion, UninstallString, PSChildName)
$shell = New-Object -ComObject WScript.Shell
function Read-Shortcut([string]$Path) {
  $exists = Test-Path -LiteralPath $Path
  $target = if ($exists) { $shell.CreateShortcut($Path).TargetPath } else { $null }
  return @{ path = $Path; exists = $exists; target = $target }
}
$desktop = Join-Path ([Environment]::GetFolderPath('DesktopDirectory')) 'Elektron YT.lnk'
$startMenu = Join-Path ([Environment]::GetFolderPath('StartMenu')) 'Programs\Elektron YT.lnk'
@{ registry = $entries; desktop = (Read-Shortcut $desktop); startMenu = (Read-Shortcut $startMenu) } | ConvertTo-Json -Depth 5 -Compress
