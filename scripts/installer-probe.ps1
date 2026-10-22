param(
  [ValidateSet('snapshot', 'close')][string]$Mode = 'snapshot',
  [int]$RootPid = 0
)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
if ($Mode -eq 'close') {
  if ($RootPid -le 0) { throw 'A launched application PID is required.' }
  for ($attempt = 0; $attempt -lt 100; $attempt++) {
    $processes = @(Get-CimInstance Win32_Process)
    $ids = [System.Collections.Generic.HashSet[int]]::new()
    [void]$ids.Add($RootPid)
    do {
      $added = $false
      foreach ($item in $processes) {
        if ($ids.Contains([int]$item.ParentProcessId) -and $ids.Add([int]$item.ProcessId)) { $added = $true }
      }
    } while ($added)
    foreach ($candidate in $ids) {
      $appProcess = Get-Process -Id $candidate -ErrorAction SilentlyContinue
      if ($appProcess -and $appProcess.MainWindowHandle -ne 0 -and $appProcess.CloseMainWindow()) { exit 0 }
    }
    Start-Sleep -Milliseconds 100
  }
  throw 'No application window accepted a graceful close.'
}
$entries = @(Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*' -ErrorAction SilentlyContinue |
  Where-Object { $_.DisplayName -eq 'Elektron YT' } |
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
