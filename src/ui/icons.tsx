// RR27：自绘 SVG 图标（照六图线性风格，卡面“自己画SVG入icons”）。统一 24×24 视窗、
// 1.6 描边、currentColor——颜色由组件层经 CSS token 指定。纯装饰 aria-hidden；
// 交互图标由使用处给可访问名称。原创绘制，无第三方图标库依赖。
import type { ReactNode } from "react";

type IconProps = { size?: number; className?: string };

function Svg({ size = 24, className, children, label }: IconProps & { children: ReactNode; label?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden={label ? undefined : true}
      role={label ? "img" : undefined}
      aria-label={label}
    >
      {children}
    </svg>
  );
}

/** 品牌雷达 logo：RR32 换交付正稿造型（docs/design/icons-20261011/icons/source/
 * reset-radar-mark.svg 几何逐值：外环 r172 sw15 / 内环 r104 sw12 / 扫描扇形渐变 /
 * 扫描线 / 中心点 r27）。色值走主题 token——深色=精密蓝 #46E4F4/#179BF1，浅色=02-glass
 * 配色 #0277C8/#30B7EF（handoff：勿将亮色透明标放白底）。 */
export function RadarLogo({ size = 36, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" fill="none" className={className} aria-hidden={true}>
      <defs>
        <linearGradient id="rr-logo-sweep" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="var(--logo-grad-lo)" />
          <stop offset="1" stopColor="var(--logo-grad-hi)" />
        </linearGradient>
      </defs>
      <path d="M256 256 L328.69 100.19 A172 172 0 0 1 417.63 197.17 Z" fill="url(#rr-logo-sweep)" />
      <circle cx="256" cy="256" r="172" stroke="var(--logo-ring-main)" strokeWidth="15" />
      <circle cx="256" cy="256" r="104" stroke="var(--logo-ring-inner)" strokeWidth="12" />
      <path d="M256 256 L417.63 197.17" stroke="var(--logo-ring-main)" strokeWidth="7" strokeLinecap="round" />
      <circle cx="256" cy="256" r="27" fill="var(--logo-ring-main)" />
    </svg>
  );
}

/** 拖动把手：2×3 圆点（仅装饰；拖动区语义由外层 data-tauri-drag-region 提供）。 */
export function GripDots({ size = 20, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" className={className} aria-hidden={true}>
      {[5, 11].map((x) => [5, 10, 15].map((y) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.6" fill="currentColor" />))}
    </svg>
  );
}

export function ChevronDown({ size, className }: IconProps) {
  return <Svg size={size} className={className}><path d="M6 9.5 12 15.5 18 9.5" /></Svg>;
}

export function ChevronUp({ size, className }: IconProps) {
  return <Svg size={size} className={className}><path d="M6 14.5 12 8.5 18 14.5" /></Svg>;
}

export function ChevronRight({ size, className }: IconProps) {
  return <Svg size={size} className={className}><path d="M9.5 6 15.5 12 9.5 18" /></Svg>;
}

export function SunIcon({ size, className }: IconProps) {
  return (
    <Svg size={size} className={className}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5 5l1.6 1.6M17.4 17.4 19 19M19 5l-1.6 1.6M6.6 17.4 5 19" />
    </Svg>
  );
}

export function MoonIcon({ size, className }: IconProps) {
  return <Svg size={size} className={className}><path d="M20 13.2A8.2 8.2 0 0 1 10.8 4 8.4 8.4 0 1 0 20 13.2Z" /></Svg>;
}

/** 跟随系统（显示器）。 */
export function MonitorIcon({ size, className }: IconProps) {
  return (
    <Svg size={size} className={className}>
      <rect x="3.5" y="4.5" width="17" height="12" rx="2" />
      <path d="M9 20h6M12 16.5V20" />
    </Svg>
  );
}

export function CloseIcon({ size, className }: IconProps) {
  return <Svg size={size} className={className}><path d="M6 6l12 12M18 6 6 18" /></Svg>;
}

/** 刷新圆环；loading 态由 CSS 旋转（reduced-motion 下静止）。 */
export function RefreshIcon({ size, className }: IconProps) {
  return (
    <Svg size={size} className={className}>
      <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" />
      <path d="M19.8 3.6v3.6h-3.6" />
    </Svg>
  );
}

export function CopyIcon({ size, className }: IconProps) {
  return (
    <Svg size={size} className={className}>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V6a2 2 0 0 1 2-2h9" />
    </Svg>
  );
}

/** 四角星（建议横幅主图标，图2/图3/图6 紫卡语言）。 */
export function SparkleIcon({ size, className }: IconProps) {
  return (
    <Svg size={size} className={className}>
      <path d="M12 3.5 13.8 10.2 20.5 12 13.8 13.8 12 20.5 10.2 13.8 3.5 12 10.2 10.2 Z" fill="currentColor" stroke="none" />
      <path d="M18.6 4.2 19.2 6 21 6.6 19.2 7.2 18.6 9 18 7.2 16.2 6.6 18 6 Z" fill="currentColor" stroke="none" opacity="0.8" />
    </Svg>
  );
}

export function CalendarIcon({ size, className }: IconProps) {
  return (
    <Svg size={size} className={className}>
      <rect x="4" y="5.5" width="16" height="15" rx="2" />
      <path d="M4 10h16M8.5 3.5v3.4M15.5 3.5v3.4" />
    </Svg>
  );
}

/** 数据库（采集状态，图1/图3）。 */
export function DatabaseIcon({ size, className }: IconProps) {
  return (
    <Svg size={size} className={className}>
      <ellipse cx="12" cy="5.5" rx="7" ry="2.6" />
      <path d="M5 5.5v6.4c0 1.4 3.1 2.6 7 2.6s7-1.2 7-2.6V5.5" />
      <path d="M5 11.9v6.6c0 1.4 3.1 2.6 7 2.6s7-1.2 7-2.6v-6.6" />
    </Svg>
  );
}

export function ClockIcon({ size, className }: IconProps) {
  return (
    <Svg size={size} className={className}>
      <circle cx="12" cy="12" r="8.4" />
      <path d="M12 7.4V12l3.2 2" />
    </Svg>
  );
}

/** 警告三角（错误横幅，图5-3）。 */
export function AlertIcon({ size, className }: IconProps) {
  return (
    <Svg size={size} className={className}>
      <path d="M12 4.2 21 19.4H3Z" />
      <path d="M12 10v4.2M12 17.1v.1" />
    </Svg>
  );
}

/** 喇叭（公告，图3 通知行琥珀卡）。 */
export function SpeakerIcon({ size, className }: IconProps) {
  return (
    <Svg size={size} className={className}>
      <path d="M4.5 9.5v5h3.4l4.6 3.8V5.7L7.9 9.5Z" />
      <path d="M16 9a4.4 4.4 0 0 1 0 6M18.6 6.6a8 8 0 0 1 0 10.8" />
    </Svg>
  );
}

/** 盾牌（风险前拉因子 / 风险分析区块）。 */
export function ShieldIcon({ size, className }: IconProps) {
  return (
    <Svg size={size} className={className}>
      <path d="M12 3.6 19 6.4v5.2c0 4.4-3 7.6-7 8.8-4-1.2-7-4.4-7-8.8V6.4Z" />
      <path d="M9 12l2.1 2.1L15.4 9.8" />
    </Svg>
  );
}

/** 折线脉冲（风险主图标，图1/图3 红色圆底内）。 */
export function PulseIcon({ size, className }: IconProps) {
  return <Svg size={size} className={className}><path d="M3.5 12h3.4l2.2-5.6 3.4 11.2 2.4-5.6h5.6" /></Svg>;
}

/** 禁止符（软上限约束，图3 因子行）。 */
export function BanIcon({ size, className }: IconProps) {
  return (
    <Svg size={size} className={className}>
      <circle cx="12" cy="12" r="8.4" />
      <path d="M6.2 6.2 17.8 17.8" />
    </Svg>
  );
}

/** 重置卡牌组（卡数图标，图1/图6）。 */
export function CardStackIcon({ size, className }: IconProps) {
  return (
    <Svg size={size} className={className}>
      <rect x="4" y="7" width="12.5" height="13" rx="2" />
      <path d="M8.5 7V5.4A1.9 1.9 0 0 1 10.4 3.5h8A1.9 1.9 0 0 1 20.3 5.4v11a1.9 1.9 0 0 1-1.9 1.9H16" />
      <path d="M4 11.5h12.5" opacity="0.8" />
    </Svg>
  );
}

export function InfoIcon({ size, className }: IconProps) {
  return (
    <Svg size={size} className={className}>
      <circle cx="12" cy="12" r="8.4" />
      <path d="M12 11v5.2M12 7.6v.1" />
    </Svg>
  );
}

/** 灯泡（用卡决策绿卡，图3/图6）。 */
export function BulbIcon({ size, className }: IconProps) {
  return (
    <Svg size={size} className={className}>
      <path d="M9.4 17.2c0-1.4-1.2-2.2-2-3.6a6.2 6.2 0 1 1 9.2 0c-.8 1.4-2 2.2-2 3.6Z" />
      <path d="M10 20.2h4M10.6 17.2h2.8" />
    </Svg>
  );
}

/** 柱状图（候选日收益与“查看完整规划”按钮小图标）。 */
export function BarChartIcon({ size, className }: IconProps) {
  return (
    <Svg size={size} className={className}>
      <path d="M4.5 19.5h15" />
      <path d="M7.5 19.5v-6M12 19.5V6.5M16.5 19.5v-9" />
    </Svg>
  );
}

/** 最佳日皇冠（候选日图最佳柱顶，图3/图6 金色）。 */
export function CrownIcon({ size = 12, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" className={className} aria-hidden={true}>
      <path d="M2 5.2 4.6 8 8 3l3.4 5L16 5.2l-1.6 7.3H3.6Z" />
    </svg>
  );
}

/** 滑块（校准按钮小图标，图3 底栏）。 */
export function SlidersIcon({ size, className }: IconProps) {
  return (
    <Svg size={size} className={className}>
      <path d="M5 5.5v13M12 5.5v13M19 5.5v13" />
      <circle cx="5" cy="10" r="1.9" /><circle cx="12" cy="15" r="1.9" /><circle cx="19" cy="8" r="1.9" />
    </Svg>
  );
}

/** 检查（复制成功反馈）。 */
export function CheckIcon({ size, className }: IconProps) {
  return <Svg size={size} className={className}><path d="M5 12.8 9.6 17.4 19 7" /></Svg>;
}
