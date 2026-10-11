# RR13 截图脚本（RR09 方法复现，TRUTH B09 机制②）：
# PrintWindow(PW_CLIENTONLY|PW_RENDERFULLCONTENT=3) 离屏渲染 WebView2，无需前台权。
# 用法：pwsh -NoProfile -File scripts\shot-capsule.ps1 <exe路径> <输出png> <等待秒>
param(
  [Parameter(Mandatory = $true)][string]$ExePath,
  [Parameter(Mandatory = $true)][string]$OutPng,
  [int]$WaitSec = 6
)

Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class Win32Shot {
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr hWnd, IntPtr hdc, uint flags);
  [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr hWnd, out RECT r);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
}
"@

$proc = Start-Process -FilePath $ExePath -PassThru
try {
  $deadline = (Get-Date).AddSeconds($WaitSec)
  do { Start-Sleep -Milliseconds 500; $proc.Refresh() } while ($proc.MainWindowHandle -eq 0 -and (Get-Date) -lt $deadline)
  if ($proc.MainWindowHandle -eq 0) { throw "未取得主窗口句柄" }
  # 等渲染稳定（WebView2 首帧 + stale 快照载入）
  Start-Sleep -Seconds 3
  $h = $proc.MainWindowHandle
  $r = New-Object Win32Shot+RECT
  [Win32Shot]::GetClientRect($h, [ref]$r) | Out-Null
  $w = $r.R - $r.L; $ht = $r.B - $r.T
  $bmp = New-Object System.Drawing.Bitmap($w, $ht)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $hdc = $g.GetHdc()
  $ok = [Win32Shot]::PrintWindow($h, $hdc, 3)  # PW_CLIENTONLY|PW_RENDERFULLCONTENT
  $g.ReleaseHdc($hdc); $g.Dispose()
  if (-not $ok) { throw "PrintWindow 失败" }
  $bmp.Save($OutPng, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  Write-Output "SHOT-OK client=${w}x${ht} -> $OutPng"
} finally {
  if (-not $proc.HasExited) { Stop-Process -Id $proc.Id -Force }
}
