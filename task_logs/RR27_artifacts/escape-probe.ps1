# RR27 Escape 实测探针：#expanded 起始 → CDP 派发 Escape 键 → 断言窗口高度 690→76 收回。
# 用法: pwsh -NoProfile -File escape-probe.ps1 <exe路径> [端口=9781]
param(
  [Parameter(Mandatory)][string]$ExePath,
  [int]$Port = 9781
)

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class RR27Probe {
  [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr value);
  [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr hWnd, out RECT r);
  public struct RECT { public int Left, Top, Right, Bottom; }
}
"@
[void][RR27Probe]::SetProcessDpiAwarenessContext([IntPtr](-4))

$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=$Port"
$proc = Start-Process -FilePath $ExePath -WorkingDirectory (Split-Path $ExePath) -PassThru
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = $null

$page = $null
foreach ($i in 1..30) {
  Start-Sleep -Milliseconds 700
  try {
    $pages = Invoke-RestMethod "http://127.0.0.1:$Port/json/list" -TimeoutSec 2
    $page = @($pages | Where-Object { $_.type -eq "page" })[0]
    if ($page) { break }
  } catch { }
}
if (-not $page) { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue; throw "CDP not ready" }

$h = $proc.MainWindowHandle
for ($i = 0; $i -lt 20 -and $h -eq [IntPtr]::Zero; $i++) {
  Start-Sleep -Milliseconds 500; $proc.Refresh(); $h = $proc.MainWindowHandle
}

$ws = [System.Net.WebSockets.ClientWebSocket]::new()
[void]$ws.ConnectAsync([Uri]$page.webSocketDebuggerUrl, [Threading.CancellationToken]::None).GetAwaiter().GetResult()
function Send-Cdp([int]$id, [string]$method, [string]$paramsJson) {
  $json = '{"id":' + $id + ',"method":"' + $method + '","params":' + $paramsJson + '}'
  $bytes = [Text.Encoding]::UTF8.GetBytes($json)
  [void]$ws.SendAsync([ArraySegment[byte]]::new($bytes),
    [System.Net.WebSockets.WebSocketMessageType]::Text, $true,
    [Threading.CancellationToken]::None).GetAwaiter().GetResult()
}
function Recv-Until([int]$id) {
  $buf = New-Object byte[] 262144
  for ($i = 0; $i -lt 60; $i++) {
    $res = $ws.ReceiveAsync([ArraySegment[byte]]::new($buf),
      [Threading.CancellationToken]::None).GetAwaiter().GetResult()
    $text = [Text.Encoding]::UTF8.GetString($buf, 0, $res.Count)
    if ($text -match ('"id":' + $id + '[,}]')) { return $text }
  }
  throw "cdp response id=$id not seen"
}
function Client-H() {
  $cr = New-Object RR27Probe+RECT
  [RR27Probe]::GetClientRect($h, [ref]$cr) | Out-Null
  return $cr.Bottom - $cr.Top
}

$base = ($page.url -replace '#.*$', '')
Send-Cdp 1 "Page.navigate" '{"url":"about:blank"}'
Recv-Until 1 | Out-Null
Send-Cdp 2 "Page.navigate" ('{"url":"' + $base + '#expanded"}')
Recv-Until 2 | Out-Null
Start-Sleep -Seconds 3
$hExpanded = Client-H
"expanded ClientH: $hExpanded (期望 1380=2x690)"

Send-Cdp 3 "Input.dispatchKeyEvent" '{"type":"keyDown","key":"Escape","code":"Escape","windowsVirtualKeyCode":27,"nativeVirtualKeyCode":27}'
Recv-Until 3 | Out-Null
Send-Cdp 4 "Input.dispatchKeyEvent" '{"type":"keyUp","key":"Escape","code":"Escape","windowsVirtualKeyCode":27,"nativeVirtualKeyCode":27}'
Recv-Until 4 | Out-Null
Start-Sleep -Seconds 2
$hCollapsed = Client-H
"after-Escape ClientH: $hCollapsed (期望 152=2x76)"

$ws.Dispose()
Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
if ($hCollapsed -lt $hExpanded - 800) { "ESCAPE_OK" ; exit 0 } else { "ESCAPE_FAIL" ; exit 1 }
