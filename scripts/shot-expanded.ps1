# RR14 展开态截图探针：hash 状态入口（#expanded）→ PrintWindow 截图。
# 用法: pwsh -NoProfile -File shot-expanded.ps1 <exe路径> <输出png> [调试端口=9333]
# 机制（TRUTH §2 B10/B09 口径延续）：
#   1) 探针进程自设 PMv2（200% 缩放下防 GetClientRect 坐标虚拟化，RR13 done 遗产④）
#   2) 以 WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port 启动 exe
#      （WebView2 官方环境变量，浏览器进程启动参数注入）
#   3) CDP Page.navigate 两跳：先 about:blank 再 <原url>#expanded —— 同 URL 仅变 hash
#      是 same-document 导航不会重挂 SPA，必须两跳强制整页加载让 App 重读起始 hash
#   4) GetDpiForWindow/GetClientRect 实证 + PrintWindow(PW_CLIENTONLY|PW_RENDERFULLCONTENT)
param(
  [Parameter(Mandatory)][string]$ExePath,
  [Parameter(Mandatory)][string]$OutPng,
  [int]$Port = 9333,
  # 目标 hash：默认 #expanded（起始展开）；空串=默认胶囊态（两跳重载后仍回胶囊）
  [string]$Hash = "#expanded",
  # RR27：截图前把展开面板滚到底（底栏按钮/校准行在折叠线下方，需滚动佐证可达）
  [switch]$ScrollBottom,
  # RR29：导航后先点击该文字的页签按钮（如"用卡"），拍指定页视口（credits-zero 决策卡等）
  [string]$ClickTab = "",
  # RR34：预设主题（reset-radar.theme localStorage）——先导航 base 落键再两跳重挂，
  # App 挂载时读到的即目标主题；不指定则沿用现有存储（默认 dark）
  [ValidateSet("", "dark", "light", "system")][string]$Theme = ""
)

Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class RR14Probe {
  [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr value);
  [DllImport("user32.dll")] public static extern uint GetDpiForWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr hWnd, out RECT r);
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr hWnd, IntPtr hdc, uint flags);
  public struct RECT { public int Left, Top, Right, Bottom; }
}
"@

$ok = [RR14Probe]::SetProcessDpiAwarenessContext([IntPtr](-4))
"ProbePMv2: $ok"

$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=$Port"
$wd = Split-Path $ExePath
$proc = Start-Process -FilePath $ExePath -WorkingDirectory $wd -WindowStyle Hidden -PassThru
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = $null

# 等 CDP HTTP 端点就绪（webview 起来才有）
$page = $null
foreach ($i in 1..30) {
  Start-Sleep -Milliseconds 700
  try {
    $pages = Invoke-RestMethod "http://127.0.0.1:$Port/json/list" -TimeoutSec 2
    $page = @($pages | Where-Object { $_.type -eq "page" })[0]
    if ($page) { break }
  } catch { }
}
if (-not $page) { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue; throw "CDP endpoint not ready" }
"CDP page: $($page.url)"
$base = ($page.url -replace '#.*$', '') -replace '\?.*$', ''
"Nav base: $base"

# 再等主窗口句柄（窗口创建早期可能拿不到；条件次序勿倒——首轮 $i=0 直接进循环体）
$h = $proc.MainWindowHandle
for ($i = 0; $i -lt 20 -and $h -eq [IntPtr]::Zero; $i++) {
  Start-Sleep -Milliseconds 500; $proc.Refresh(); $h = $proc.MainWindowHandle
}
"HWND: $h  PID: $($proc.Id)"
if ($h -eq [IntPtr]::Zero) { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue; throw "no main window" }

# CDP WebSocket：两跳导航（about:blank → index.html#expanded）
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
  for ($i = 0; $i -lt 40; $i++) {
    $res = $ws.ReceiveAsync([ArraySegment[byte]]::new($buf),
      [Threading.CancellationToken]::None).GetAwaiter().GetResult()
    $text = [Text.Encoding]::UTF8.GetString($buf, 0, $res.Count)
    if ($text -match ('"id":' + $id + '[,}]')) { return $text }
  }
  throw "cdp response id=$id not seen"
}
Send-Cdp 1 "Page.navigate" '{"url":"about:blank"}'
Recv-Until 1 | Out-Null
if ($Theme -ne "") {
  # 落主题键须在应用 origin 下：先去 base 写 localStorage，再回 about:blank 后两跳重挂
  Send-Cdp 9 "Page.navigate" ('{"url":"' + $base + '"}')
  Recv-Until 9 | Out-Null
  $tJson = @{ expression = "localStorage.setItem('reset-radar.theme','" + $Theme + "'); localStorage.getItem('reset-radar.theme')"; returnByValue = $true } | ConvertTo-Json -Compress
  Send-Cdp 10 "Runtime.evaluate" $tJson
  "ThemePreset($Theme): $(Recv-Until 10)"
  Send-Cdp 11 "Page.navigate" '{"url":"about:blank"}'
  Recv-Until 11 | Out-Null
}
Send-Cdp 2 "Page.navigate" ('{"url":"' + $base + $Hash + '"}')
$nav = Recv-Until 2
"Navigate: $nav"
if ($ScrollBottom) {
  Start-Sleep -Seconds 3   # 等 React 挂载完成（导航响应早于渲染）
  Send-Cdp 3 "Runtime.evaluate" '{"expression":"document.querySelector(''[role=main]'').scrollTop = 1e6; ''scrolled''","returnByValue":true}'
  "Scroll: $(Recv-Until 3)"
}
if ($ClickTab -ne "") {
  Start-Sleep -Seconds 4   # 等 React 挂载完成（导航响应早于渲染；3s 偶发未挂载完 not-found）
  $cJson = @{ expression = "(() => { const b = [...document.querySelectorAll('button')].find(x => (x.textContent||'').trim() === '" + $ClickTab + "'); if (b) { b.click(); return 'clicked'; } return 'not-found'; })()"; returnByValue = $true } | ConvertTo-Json -Compress
  Send-Cdp 4 "Runtime.evaluate" $cJson
  $clickRes = Recv-Until 4
  "ClickTab: $clickRes"
  if ($clickRes -match "not-found") {   # 单次重试（挂载竞态）
    Start-Sleep -Seconds 2
    Send-Cdp 5 "Runtime.evaluate" $cJson
    $clickRes = Recv-Until 5
    "ClickTab retry: $clickRes"
  }
  Start-Sleep -Milliseconds 600
}
$ws.Dispose()

Start-Sleep -Seconds 3   # 等整页加载+快照渲染

$dpi = [RR14Probe]::GetDpiForWindow($h)
"GetDpiForWindow: $dpi   (期望 192=PMv2 生效，B10 修复在)"
$cr = New-Object RR14Probe+RECT
[RR14Probe]::GetClientRect($h, [ref]$cr) | Out-Null
$bw = $cr.Right - $cr.Left; $bh = $cr.Bottom - $cr.Top
if ($bw -gt 2000) {
  # 偶发超大过渡态：再等 3s 复读一次（若仍超大则照实截，日志留证）
  Start-Sleep -Seconds 3
  [RR14Probe]::GetClientRect($h, [ref]$cr) | Out-Null
  $bw = $cr.Right - $cr.Left; $bh = $cr.Bottom - $cr.Top
  "Re-read ClientRect: W=$bw H=$bh"
}
"ClientRect(物理): W=$bw H=$bh   (期望 2x 逻辑 460x560 → 920x1120)"

$bmp = New-Object System.Drawing.Bitmap($bw, $bh)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$hdc = $g.GetHdc()
$pw = [RR14Probe]::PrintWindow($h, $hdc, 3)   # PW_CLIENTONLY|PW_RENDERFULLCONTENT
$g.ReleaseHdc($hdc); $g.Dispose()
"PrintWindow(3): $pw"
$bmp.Save($OutPng, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
"Saved: $OutPng  size=${bw}x${bh}"
Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
