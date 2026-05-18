import { supabase } from "@/lib/supabase";

export const revalidate = 1800;

type SaleRow = {
  metric_date: string;
  source: string;
  revenue: number;
  orders: number;
};

async function getData() {
  const { data: sales } = await supabase
    .from("meta.sales_daily")
    .select("*")
    .order("metric_date", { ascending: false })
    .limit(30);

  const { data: spend } = await supabase
    .from("meta.account_snapshot")
    .select("metric_date,spend")
    .order("metric_date", { ascending: false })
    .limit(30);

  // ROAS por dia = revenue / spend
  const spendMap = new Map((spend || []).map(s => [s.metric_date, Number(s.spend) || 0]));
  const rows = ((sales || []) as SaleRow[]).map(s => ({
    ...s,
    spend: spendMap.get(s.metric_date) || 0,
    roas: spendMap.get(s.metric_date)
      ? Number(s.revenue) / spendMap.get(s.metric_date)!
      : 0,
  }));
  return rows;
}

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default async function Vendas() {
  const rows = await getData();
  const totalRev = rows.reduce((a, b) => a + Number(b.revenue || 0), 0);
  const totalSpend = rows.reduce((a, b) => a + Number(b.spend || 0), 0);
  const totalRoas = totalSpend > 0 ? totalRev / totalSpend : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Vendas & ROAS</h1>
        <p className="text-muted text-sm">Últimos 30 dias</p>
      </div>

      {rows.length === 0 ? (
        <div className="card">
          <h2 className="font-semibold mb-2">Sem dados de vendas ainda</h2>
          <p className="text-muted text-sm">
            Pra ver vendas aqui, a Mavi precisa conectar sua ferramenta de vendas (Stripe / Hotmart /
            Kiwify / Eduzz / Cakto / WhatsApp manual / próprio). Manda mensagem pra ela: "Mavi, conecta
            minha ferramenta de vendas pro dashboard."
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="card">
              <div className="stat-label">Receita 30d</div>
              <div className="stat-value">{brl(totalRev)}</div>
            </div>
            <div className="card">
              <div className="stat-label">Gasto Ads 30d</div>
              <div className="stat-value">{brl(totalSpend)}</div>
            </div>
            <div className="card">
              <div className="stat-label">ROAS 30d</div>
              <div className="stat-value">{totalRoas.toFixed(2)}×</div>
            </div>
          </div>
          <div className="card overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead className="bg-bg/60 text-muted text-xs uppercase tracking-wider">
                <tr>
                  <th className="text-left px-4 py-3">Dia</th>
                  <th className="text-left px-4 py-3">Origem</th>
                  <th className="text-right px-4 py-3">Pedidos</th>
                  <th className="text-right px-4 py-3">Receita</th>
                  <th className="text-right px-4 py-3">Gasto Ads</th>
                  <th className="text-right px-4 py-3">ROAS</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-t border-line">
                    <td className="px-4 py-3">{r.metric_date}</td>
                    <td className="px-4 py-3">{r.source}</td>
                    <td className="px-4 py-3 text-right">{r.orders}</td>
                    <td className="px-4 py-3 text-right">{brl(Number(r.revenue))}</td>
                    <td className="px-4 py-3 text-right">{brl(Number(r.spend))}</td>
                    <td className={`px-4 py-3 text-right ${r.roas < 1 ? "text-danger" : "text-accent"}`}>
                      {r.roas.toFixed(2)}×
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
