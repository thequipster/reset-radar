# RR29 Tab 键序探针：起 release app → CDP 两跳导航 → 连发 Tab 键 → 逐次记录
# document.activeElement（tag/class/aria/text 片段）→ 输出键序清单（stdout）。
# 用法: pwsh -NoProfile -File probe-tab-order.ps1 <exe路径> <hash如#expanded> [端口=9334] [Tab次数=14]
# 机制沿 shot-expanded.ps1（B09 机制②/B10 PMv2/两跳导航）；CDP Input.dispatchKeyEvent
# 直达页面焦点链（等效浏览器级键盘输入；NOACTIVATE 窗口的用户路径=点击激活后 Tab，
# 页面内焦点遍历一致——口径注记于报告）。
param(
  [Parameter(Mandatory)][string]$ExePath,
  [Parameter(Mandatory)][string]$Hash,
  [int]$Port = 9334,
  [int]$Tabs = 14,
  # 非空时导航后先点击该文字的页签按钮再遍历（如"用卡"→ 页内次级控件入序）
  [string]$ClickTab = ""
)

$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=$Port"
$wd = Split-Path $ExePath
$proc = Start-Process -FilePath $ExePath -WorkingDirectory $wd -PassThru
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
if (-not $page) { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue; throw "CDP endpoint not ready" }
$base = ($page.url -replace '#.*$', '') -replace '\?.*$', ''

$ws = [System.Net.WebSockets.ClientWebSocket]::new()
[void]$ws.ConnectAsync([Uri]$page.webSocketDebuggerUrl, [Threading.CancellationToken]::None).GetAwaiter().GetResult()
$script:id = 0
function Send-Cdp([string]$method, [string]$paramsJson) {
  $script:id++
  $json = '{"id":' + $script:id + ',"method":"' + $method + '","params":' + $paramsJson + '}'
  $bytes = [Text.Encoding]::UTF8.GetBytes($json)
  [void]$ws.SendAsync([ArraySegment[byte]]::new($bytes),
    [System.Net.WebSockets.WebSocketMessageType]::Text, $true,
    [Threading.CancellationToken]::None).GetAwaiter().GetResult()
  return $script:id
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

# 两跳导航（same-document hash 变更不重挂 SPA）
$n1 = Send-Cdp "Page.navigate" '{"url":"about:blank"}'
Recv-Until $n1 | Out-Null
$n2 = Send-Cdp "Page.navigate" ('{"url":"' + $base + $Hash + '"}')
Recv-Until $n2 | Out-Null
Start-Sleep -Seconds 3   # 等 React 挂载
if ($ClickTab -ne "") {
  $cJson = @{ expression = "(() => { const b = [...document.querySelectorAll('button')].find(x => (x.textContent||'').trim() === '" + $ClickTab + "'); if (b) { b.click(); return 'clicked'; } return 'not-found'; })()"; returnByValue = $true } | ConvertTo-Json -Compress
  $cid = Send-Cdp "Runtime.evaluate" $cJson
  "click: $(Recv-Until $cid)"
  Start-Sleep -Milliseconds 500
}

# 起点：document.activeElement 初始状态
$n3Json = @{ expression = "JSON.stringify({tag:document.activeElement.tagName,cls:(document.activeElement.className||'').toString().slice(0,60)})"; returnByValue = $true } | ConvertTo-Json -Compress
$n3 = Send-Cdp "Runtime.evaluate" $n3Json
"start: $(Recv-Until $n3)"

for ($i = 1; $i -le $Tabs; $i++) {
  foreach ($t in @("keyDown", "keyUp")) {
    $kid = Send-Cdp "Input.dispatchKeyEvent" ('{"type":"' + $t + '","key":"Tab","code":"Tab","windowsVirtualKeyCode":9,"nativeVirtualKeyCode":9}')
    Recv-Until $kid | Out-Null
  }
  Start-Sleep -Milliseconds 120
  $eJson = @{ expression = "JSON.stringify({tag:document.activeElement.tagName,cls:(document.activeElement.className||'').toString().slice(0,70),aria:document.activeElement.getAttribute('aria-label')||'',text:(document.activeElement.textContent||'').trim().slice(0,30)})"; returnByValue = $true } | ConvertTo-Json -Compress
  $eid = Send-Cdp "Runtime.evaluate" $eJson
  "tab#$i : $(Recv-Until $eid)"
}
$ws.Dispose()
Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
"done: $Tabs tabs dispatched"
