"use client";

import { formatCurrency } from "@/lib/utils";
import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const BLUE = "#2563eb";
/** Neutros que funcionam nos dois temas — atributo SVG não resolve `var()`. */
const AXIS = "#7c8aa5";
const GRID = "rgba(124, 138, 165, 0.25)";
const PALETTE = ["#2563eb", "#10b981", "#f59e0b", "#8b5cf6", "#ef4444", "#06b6d4", "#64748b", "#ec4899"];

const tooltipStyle = {
  borderRadius: 12,
  border: "1px solid rgba(124, 138, 165, 0.3)",
  boxShadow: "0 8px 24px rgb(15 23 42 / 0.08)",
  fontSize: 12,
};

function useHasMounted() {
  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  return hasMounted;
}

function ChartPlaceholder({ height }: { height: number }) {
  return <div aria-hidden="true" style={{ height }} />;
}

export function LeadsPerMonthChart({
  data,
}: {
  data: { month: string; leads: number }[];
}) {
  const hasMounted = useHasMounted();
  if (!hasMounted) return <ChartPlaceholder height={240} />;

  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={data} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
        <XAxis dataKey="month" tick={{ fontSize: 11, fill: AXIS }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 11, fill: AXIS }} axisLine={false} tickLine={false} allowDecimals={false} />
        <Tooltip contentStyle={tooltipStyle} />
        <Line
          type="monotone"
          dataKey="leads"
          name="Leads"
          stroke={BLUE}
          strokeWidth={2.5}
          dot={{ r: 3, fill: BLUE }}
          activeDot={{ r: 5 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function SalesPerMonthChart({
  data,
}: {
  data: { month: string; valor: number }[];
}) {
  const hasMounted = useHasMounted();
  if (!hasMounted) return <ChartPlaceholder height={240} />;

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 8, right: 12, left: -6, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
        <XAxis dataKey="month" tick={{ fontSize: 11, fill: AXIS }} axisLine={false} tickLine={false} />
        <YAxis
          tick={{ fontSize: 11, fill: AXIS }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
        />
        <Tooltip contentStyle={tooltipStyle} formatter={(v) => formatCurrency(Number(v))} />
        <Bar dataKey="valor" name="Vendas" fill={BLUE} radius={[6, 6, 0, 0]} maxBarSize={42} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// Entrada diária de leads — usado no relatório de entrada e no resumo da empresa.
export function DailyLeadsChart({
  data,
  height = 240,
}: {
  data: { label: string; total: number }[];
  height?: number;
}) {
  const hasMounted = useHasMounted();
  if (!hasMounted) return <ChartPlaceholder height={height} />;
  if (data.length === 0) {
    return <p className="py-16 text-center text-sm text-ink-faint">Sem leads no período.</p>;
  }

  // Em séries longas, mostra um rótulo a cada N dias para não empilhar texto
  const step = Math.ceil(data.length / 12);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11, fill: AXIS }}
          axisLine={false}
          tickLine={false}
          interval={step - 1}
        />
        <YAxis
          tick={{ fontSize: 11, fill: AXIS }}
          axisLine={false}
          tickLine={false}
          allowDecimals={false}
        />
        <Tooltip contentStyle={tooltipStyle} />
        <Bar dataKey="total" name="Leads" fill={BLUE} radius={[6, 6, 0, 0]} maxBarSize={28} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function DealsByStageChart({
  data,
}: {
  data: { name: string; value: number; color: string }[];
}) {
  const filtered = data.filter((d) => d.value > 0);
  if (filtered.length === 0) {
    return <p className="py-16 text-center text-sm text-ink-faint">Sem negociações no período.</p>;
  }

  return <DealsByStageChartContent data={filtered} />;
}

function DealsByStageChartContent({
  data,
}: {
  data: { name: string; value: number; color: string }[];
}) {
  const hasMounted = useHasMounted();
  if (!hasMounted) return <ChartPlaceholder height={220} />;

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row">
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2}>
            {data.map((entry, i) => (
              <Cell key={i} fill={entry.color || PALETTE[i % PALETTE.length]} />
            ))}
          </Pie>
          <Tooltip contentStyle={tooltipStyle} />
        </PieChart>
      </ResponsiveContainer>
      <ul className="grid w-full shrink-0 grid-cols-2 gap-x-4 gap-y-1.5 text-xs sm:w-44 sm:grid-cols-1">
        {data.map((d, i) => (
          <li key={i} className="flex items-center gap-2 text-ink-soft">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: d.color || PALETTE[i % PALETTE.length] }} />
            <span className="truncate">{d.name}</span>
            <span className="ml-auto font-semibold text-ink">{d.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function HorizontalCountChart({
  data,
  color = BLUE,
  currency,
}: {
  data: { name: string; value: number }[];
  color?: string;
  currency?: boolean;
}) {
  if (data.length === 0) {
    return <p className="py-16 text-center text-sm text-ink-faint">Sem dados no período.</p>;
  }

  return <HorizontalCountChartContent data={data} color={color} currency={currency} />;
}

function HorizontalCountChartContent({
  data,
  color,
  currency,
}: {
  data: { name: string; value: number }[];
  color: string;
  currency?: boolean;
}) {
  const height = Math.max(160, data.length * 42);
  const hasMounted = useHasMounted();
  if (!hasMounted) return <ChartPlaceholder height={height} />;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 24, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} horizontal={false} />
        <XAxis type="number" hide />
        <YAxis
          type="category"
          dataKey="name"
          width={120}
          tick={{ fontSize: 11, fill: AXIS }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(v) => (currency ? formatCurrency(Number(v)) : v)}
        />
        <Bar dataKey="value" fill={color} radius={[0, 6, 6, 0]} maxBarSize={22} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ------------------------------------------------------------
// Dashboard no design Jidianos (prints 9 e 11)
// ------------------------------------------------------------

/** Paleta das barras por item (print 9). */
const VIVID = ["#0ea5e9", "#10b981", "#8b5cf6", "#f59e0b", "#ec4899", "#06b6d4", "#f97316", "#6366f1"];

const compact = (v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v));

/** Barras mês a mês numa cor só (leads, vendas, valor vendido). */
export function MonthlyBarChart({
  data,
  dataKey,
  name,
  color,
  currency,
}: {
  data: object[];
  dataKey: string;
  name: string;
  color: string;
  currency?: boolean;
}) {
  const hasMounted = useHasMounted();
  if (!hasMounted) return <ChartPlaceholder height={240} />;
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: currency ? 0 : -18, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
        <XAxis dataKey="month" tick={{ fontSize: 11, fill: AXIS }} axisLine={{ stroke: GRID }} tickLine={false} />
        <YAxis
          tick={{ fontSize: 11, fill: AXIS }}
          axisLine={false}
          tickLine={false}
          allowDecimals={false}
          tickFormatter={currency ? compact : undefined}
        />
        <Tooltip
          contentStyle={tooltipStyle}
          cursor={{ fill: "rgba(124, 138, 165, 0.12)" }}
          formatter={(v) => (currency ? formatCurrency(Number(v)) : v)}
        />
        <Bar dataKey={dataKey} name={name} fill={color} radius={[6, 6, 0, 0]} maxBarSize={48} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Linha suave com pontos vazados (conversão mês a mês, print 11). */
export function MonthlyLineChart({
  data,
  dataKey,
  name,
  color,
}: {
  data: object[];
  dataKey: string;
  name: string;
  color: string;
}) {
  const hasMounted = useHasMounted();
  if (!hasMounted) return <ChartPlaceholder height={240} />;
  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={data} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
        <XAxis dataKey="month" tick={{ fontSize: 11, fill: AXIS }} axisLine={{ stroke: GRID }} tickLine={false} />
        <YAxis tick={{ fontSize: 11, fill: AXIS }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `${v}%`} />
        <Tooltip contentStyle={tooltipStyle} formatter={(v) => `${v}%`} />
        <Line
          type="monotone"
          dataKey={dataKey}
          name={name}
          stroke={color}
          strokeWidth={2.5}
          dot={{ r: 3.5, fill: "#fff", stroke: color, strokeWidth: 2 }}
          activeDot={{ r: 5 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

/** Barras horizontais com uma cor por item (valor vendido por campanha). */
export function VividHorizontalChart({ data, currency }: { data: { name: string; value: number }[]; currency?: boolean }) {
  const height = Math.max(160, data.length * 36);
  const hasMounted = useHasMounted();
  if (data.length === 0) return null;
  if (!hasMounted) return <ChartPlaceholder height={height} />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 11, fill: AXIS }} axisLine={{ stroke: GRID }} tickLine={false} tickFormatter={currency ? compact : undefined} />
        <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 10, fill: AXIS }} axisLine={{ stroke: GRID }} tickLine={false} />
        <Tooltip contentStyle={tooltipStyle} formatter={(v) => (currency ? formatCurrency(Number(v)) : v)} />
        <Bar dataKey="value" radius={[0, 6, 6, 0]} maxBarSize={26}>
          {data.map((_, i) => (
            <Cell key={i} fill={VIVID[i % VIVID.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
