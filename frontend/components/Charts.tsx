"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fmtNumber } from "@/lib/utils";

const ACCENT = "#4f6df5";
const ACCENT2 = "#8fa2ff";
const PALETTE = ["#4f6df5", "#8fa2ff", "#6ee7a0", "#f0b45a", "#e879a8", "#5ac8e0", "#a78bfa", "#f87373", "#94a3b8"];

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: { value?: number | string; name?: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="card px-3 py-2 text-xs shadow-lg">
      <div className="text-muted mb-1">{label}</div>
      {payload.map((p, i) => (
        <div key={i} className="text-slate-200 font-semibold">
          {p.name ? `${p.name}: ` : ""}{fmtNumber(Number(p.value))}
        </div>
      ))}
    </div>
  );
}

function xLabel(t: string, interval?: string) {
  const d = new Date(t);
  return interval === "hour"
    ? d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function AreaTrend({
  data,
  interval,
  color = ACCENT,
  name,
  height = 280,
}: {
  data: { t: string; value: number }[];
  interval?: string;
  color?: string;
  name?: string;
  height?: number;
}) {
  const points = data.map((p) => ({ ...p, label: xLabel(p.t, interval) }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={points} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <defs>
          <linearGradient id={`grad-${color}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.35} />
            <stop offset="100%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="#232c4d" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={30} />
        <YAxis tickLine={false} axisLine={false} tickFormatter={(v: number) => fmtNumber(v)} width={48} />
        <Tooltip content={<ChartTooltip />} />
        <Area type="monotone" dataKey="value" name={name} stroke={color} strokeWidth={2} fill={`url(#grad-${color})`} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function BarSeries({
  data,
  dataKey = "value",
  xKey = "label",
  horizontal,
  height = 280,
}: {
  data: Record<string, string | number>[];
  dataKey?: string;
  xKey?: string;
  horizontal?: boolean;
  height?: number;
}) {
  if (horizontal) {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="#232c4d" strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" tickLine={false} axisLine={false} tickFormatter={(v: number) => fmtNumber(v)} />
          <YAxis type="category" dataKey={xKey} tickLine={false} axisLine={false} width={110} />
          <Tooltip content={<ChartTooltip />} />
          <Bar dataKey={dataKey} fill={ACCENT} radius={[0, 4, 4, 0]} maxBarSize={18} />
        </BarChart>
      </ResponsiveContainer>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid stroke="#232c4d" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey={xKey} tickLine={false} axisLine={false} />
        <YAxis tickLine={false} axisLine={false} tickFormatter={(v: number) => fmtNumber(v)} width={48} />
        <Tooltip content={<ChartTooltip />} />
        <Bar dataKey={dataKey} fill={ACCENT} radius={[4, 4, 0, 0]} maxBarSize={40} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function Donut({
  data,
  dataKey = "value",
  nameKey = "name",
  height = 280,
}: {
  data: Record<string, string | number>[];
  dataKey?: string;
  nameKey?: string;
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie
          data={data}
          dataKey={dataKey}
          nameKey={nameKey}
          cx="50%"
          cy="45%"
          innerRadius="55%"
          outerRadius="85%"
          paddingAngle={3}
          strokeWidth={0}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
          ))}
        </Pie>
        <Tooltip content={<ChartTooltip />} />
        <Legend
          formatter={(v: string) => <span className="text-xs text-muted">{v}</span>}
          iconSize={8}
          iconType="circle"
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function Card({ title, subtitle, action, children }: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="card p-4">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-200">{title}</h3>
          {subtitle && <p className="text-xs text-subtle mt-0.5">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

export { PALETTE, ACCENT2 };
