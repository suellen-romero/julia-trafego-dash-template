"use client";

import { useEffect, useState } from "react";
import { supabase, type AccountSnap } from "@/lib/supabase";
import { LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

export default function Historico() {
  const [rows, setRows] = useState<AccountSnap[]>([]);
  const [days, setDays] = useState(30);

  useEffect(() => {
    (async () => {
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const { data } = await supabase
        .from("meta.account_snapshot")
        .select("*")
        .gte("metric_date", since)
        .order("metric_date", { ascending: true });
      setRows((data || []) as AccountSnap[]);
    })();
  }, [days]);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Histórico</h1>
          <p className="text-muted text-sm">Evolução dos últimos {days} dias</p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          {[7, 30, 90].map(d => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-3 py-1 rounded-md border border-line ${days === d ? "bg-accent text-white border-accent" : "bg-white text-ink"}`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="stat-label mb-3">Gasto (R$)</div>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={rows}>
            <CartesianGrid stroke="#E8E5DD" />
            <XAxis dataKey="metric_date" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Line type="monotone" dataKey="spend" stroke="#2A4D3F" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card">
          <div className="stat-label mb-3">Conversas / dia</div>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={rows}>
              <CartesianGrid stroke="#E8E5DD" />
              <XAxis dataKey="metric_date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Line type="monotone" dataKey="conversions" stroke="#C89A3A" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="card">
          <div className="stat-label mb-3">CPA (R$ por conversa)</div>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={rows}>
              <CartesianGrid stroke="#E8E5DD" />
              <XAxis dataKey="metric_date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Line type="monotone" dataKey="cost_per_conv" stroke="#B23A48" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
