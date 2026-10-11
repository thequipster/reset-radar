# RR21 透明度实证探针：CopyFromScreen 实拍悬浮窗区域（alwaysOnTop 在顶，无遮挡）。
# PrintWindow 会把分层窗口透明区合成为黑（识图子代理已证 PNG 全 alpha=255），
# 屏幕实拍才等于用户所见：四角若为桌面像素（非纯黑）→ 透明生效。
# 用法: pwsh -NoProfile -File probe-transparent.ps1 <exe路径> <输出png> [端口]
param(
  [Parameter(Mandatory)][string]$ExePath,
  [Parameter(Mandatory)][string]$OutPng,
  [int]$Port = 9335
)

Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class RR21Probe {
  [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr value);
  [DllImport("user32.dll")] public static extern uint GetDpiForWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT r);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr after, int x, int y, int cx, int cy, uint flags);
  public struct RECT { public int Left, Top, Right, Bottom; }
}
"@

$ok = [RR21Probe]::SetProcessDpiAwarenessContext([IntPtr](-4))
"ProbePMv2: $ok"

$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=$Port"
$wd = Split-Path $ExePath
$proc = Start-Process -FilePath $ExePath -WorkingDirectory $wd -PassThru
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = $null

$h = $proc.MainWindowHandle
for ($i = 0; $i -lt 20 -and $h -eq [IntPtr]::Zero; $i++) {
  Start-Sleep -Milliseconds 500; $proc.Refresh(); $h = $proc.MainWindowHandle
}
if ($h -eq [IntPtr]::Zero) { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue; throw "no main window" }
"HWND: $h"

# 把窗口挪到屏幕固定位置（避开任务栏），确保截图区域无其他窗口（alwaysOnTop 在顶）
[void][RR21Probe]::SetWindowPos($h, [IntPtr]-1, 200, 200, 0, 0, 0x0001 -bor 0x0004 -bor 0x0010)  # HWND_TOPMOST|NOSIZE|NOACTIVATE
Start-Sleep -Seconds 5   # 等真实快照握手渲染（等待页→胶囊）

$dpi = [RR21Probe]::GetDpiForWindow($h)
$r = New-Object RR21Probe+RECT
[RR21Probe]::GetWindowRect($h, [ref]$r) | Out-Null
$w = $r.Right - $r.Left; $hh = $r.Bottom - $r.Top
"DPI: $dpi  WindowRect(物理): $($r.Left),$($r.Top) ${w}x${hh}"

$bmp = New-Object System.Drawing.Bitmap($w, $hh)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($r.Left, $r.Top, 0, 0, [System.Drawing.Size]::new($w, $hh))
$g.Dispose()
$bmp.Save($OutPng, [System.Drawing.Imaging.ImageFormat]::Png)

# 四角+中上取样（避开胶囊本体）
function Px($x, $y) { $c = $bmp.GetPixel($x, $y); "($x,$y) RGB=$($c.R),$($c.G),$($c.B)" }
"corner TL: " + (Px 4 4)
"corner TR: " + (Px ($w-5) 4)
"corner BL: " + (Px 4 ($hh-5))
"corner BR: " + (Px ($w-5) ($hh-5))
"mid-top  : " + (Px ([int]($w/2)) 4)
$bmp.Dispose()
"Saved: $OutPng"
Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
