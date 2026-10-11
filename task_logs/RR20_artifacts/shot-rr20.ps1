# RR20 实证探针：DPI 感知修复验证（B10 根治证据）
# 用法: pwsh -NoProfile -File shot-rr20.ps1 <exe路径> <输出png>
# 步骤: 探针进程先 SetProcessDpiAwarenessContext(PMv2)（防跨进程 DPI 虚拟化吃掉物理坐标）
#       → 启动 exe → GetDpiForWindow 直探 → GetClientRect 物理尺寸 → PrintWindow(3) 截图 → 收尾
param([Parameter(Mandatory)][string]$ExePath, [Parameter(Mandatory)][string]$OutPng)

Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class RR20Probe {
  [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr value);
  [DllImport("user32.dll")] public static extern uint GetDpiForWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr hWnd, out RECT r);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT r);
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr hWnd, IntPtr hdc, uint flags);
  public struct RECT { public int Left, Top, Right, Bottom; }
}
"@

# DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2 = -4（已设则调用失败但无害，坐标本就不虚拟化）
$ok = [RR20Probe]::SetProcessDpiAwarenessContext([IntPtr](-4))
"ProbePMv2: $ok"

$wd = Split-Path $ExePath
$proc = Start-Process -FilePath $ExePath -WorkingDirectory $wd -PassThru
Start-Sleep -Seconds 10   # 等窗口+webview 首刷（stale→实取握手，B09 口径留足）
$h = $proc.MainWindowHandle
if ($h -eq [IntPtr]::Zero) { $proc.Refresh(); Start-Sleep -Seconds 2; $h = $proc.MainWindowHandle }
"HWND: $h  PID: $($proc.Id)"
if ($h -eq [IntPtr]::Zero) { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue; throw "no main window" }

$dpi = [RR20Probe]::GetDpiForWindow($h)
"GetDpiForWindow: $dpi   (96=无感知→B10 病灶仍在; 192=PerMonitor 感知→修复生效)"

$wr = New-Object RR20Probe+RECT
[RR20Probe]::GetWindowRect($h, [ref]$wr) | Out-Null
"WindowRect(物理): W=$($wr.Right-$wr.Left) H=$($wr.Bottom-$wr.Top)"

$cr = New-Object RR20Probe+RECT
[RR20Probe]::GetClientRect($h, [ref]$cr) | Out-Null
$bw = $cr.Right - $cr.Left; $bh = $cr.Bottom - $cr.Top
"ClientRect(物理): W=$bw H=$bh   (修复后应为 2x 逻辑 420x560 → 840x1120; 修复前病灶=420x560)"

$bmp = New-Object System.Drawing.Bitmap($bw, $bh)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$hdc = $g.GetHdc()
$pw = [RR20Probe]::PrintWindow($h, $hdc, 3)   # PW_CLIENTONLY|PW_RENDERFULLCONTENT（B09 机制②）
$g.ReleaseHdc($hdc); $g.Dispose()
"PrintWindow(3): $pw"
$bmp.Save($OutPng, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
"Saved: $OutPng  size=${bw}x${bh}"
Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
