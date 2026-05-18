import { supabase, type AccountSnap, type BudgetChange } from "@/lib/supabase";

export const revalidate = 1800; // ISR 30 min

async function getData() {
  const { data: last } = await supabase
    .from("meta.account_snapshot")
    .select("*")
    .order("metric_date", { ascending: false })
    .limit(1);
  const acc = (last?.[0] as AccountSnap) || null;

  const { data: avg } = await supabase.from("meta.v_account_7d").select("*").limit(1);
  const avg7 = avg?.[0] || null;

  const { data: changes } = await supabase
    .from("meta.budget_changes")
    .select("*")
    .order("detected_at", { ascending: false })
    .limit(5);

  return { acc, avg7, changes: (changes || []) as BudgetChange[] };
}

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const pct = (v: number) => `${v.toFixed(2).replace(".", ",")}%`;
const num = (v: number) => v.toLocaleString("pt-BR");

export default async function Home() {
  const { acc, avg7, changes } = await getData();
  if (!acc) {
    return (
      <div className="card">
        <h1 className="text-2xl font-semibold mb-2">Sem dados ainda</h1>
        <p className="text-muted">O ETL ainda não rodou. Espera o cron de 8h ou rode manual.</p>
      </div>
    );
  }
  const spendDelta = avg7?.avg_spend_7d ? ((acc.spend - avg7.avg_spend_7d) / avg7.avg_spend_7d) * 100 : 0;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Ontem · {acc.metric_date}</h1>
        <p className="text-muted text-sm">Comparado à média dos últimos 7 dias</p>
      </div>

      {changes.length > 0 && (
        <div className="card border-l-4 border-l-warning">
          <h2 className="font-semibold mb-2">Mudanças de budget últimas 24h</h2>
          <ul className="text-sm space-y-1">
            {changes.map((c, i) => (
              <li key={i} className="text-ink">
                <span className="font-medium">{c.campaign_name}</span> · {brl(c.old_daily)} → {brl(c.new_daily)}
                {" "}<span className="chip-warn">ratio {c.ratio.toFixed(1)}×</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="Gasto" value={brl(acc.spend)} delta={spendDelta} />
        <Stat label="Conversas" value={num(acc.conversions)} />
        <Stat label="CPA" value={brl(acc.cost_per_conv)} />
        <Stat label="CTR" value={pct(acc.ctr)} flagDanger={acc.ctr < 1} />
        <Stat label="CPC" value={brl(acc.cpc)} />
        <Stat label="CPM" value={brl(acc.cpm)} />
        <Stat label="Frequência" value={acc.frequency.toFixed(2)} flagDanger={acc.frequency > 3} />
        <Stat label="Conv. Página" value={pct(acc.page_conv_rate)} />
      </div>
    </div>
  );
}

function Stat({
  label, value, delta, flagDanger,
}: { label: string; value: string; delta?: number; flagDanger?: boolean }) {
  return (
    <div className="card">
      <div className="stat-label">{label}</div>
      <div className={`stat-value ${flagDanger ? "text-danger" : ""}`}>{value}</div>
      {delta !== undefined && (
        <div className={`text-xs mt-1 ${delta >= 0 ? "stat-delta-up" : "stat-delta-down"}`}>
          {delta >= 0 ? "+" : ""}{delta.toFixed(0)}% vs média 7d
        </div>
      )}
    </div>
  );
}
