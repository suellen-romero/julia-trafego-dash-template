import { supabase, type CampaignSnap } from "@/lib/supabase";

export const revalidate = 1800;

async function getData() {
  const { data: last } = await supabase
    .from("meta.campaign_snapshot")
    .select("metric_date")
    .order("metric_date", { ascending: false })
    .limit(1);
  const lastDate = last?.[0]?.metric_date as string | undefined;
  if (!lastDate) return { rows: [] as CampaignSnap[], lastDate: null };

  const { data } = await supabase
    .from("meta.campaign_snapshot")
    .select("*")
    .eq("metric_date", lastDate)
    .order("spend", { ascending: false });

  return { rows: (data || []) as CampaignSnap[], lastDate };
}

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const pct = (v: number) => `${v.toFixed(2).replace(".", ",")}%`;

export default async function Campanhas() {
  const { rows, lastDate } = await getData();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Campanhas</h1>
        <p className="text-muted text-sm">Ranking por gasto · {lastDate}</p>
      </div>
      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="bg-bg/60 text-muted text-xs uppercase tracking-wider">
            <tr>
              <th className="text-left px-4 py-3">Campanha</th>
              <th className="text-right px-4 py-3">Gasto</th>
              <th className="text-right px-4 py-3">Conv.</th>
              <th className="text-right px-4 py-3">CPA</th>
              <th className="text-right px-4 py-3">CTR</th>
              <th className="text-right px-4 py-3">CPC</th>
              <th className="text-right px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.campaign_id} className="border-t border-line">
                <td className="px-4 py-3 font-medium">{c.campaign_name}</td>
                <td className="px-4 py-3 text-right">{brl(c.spend)}</td>
                <td className="px-4 py-3 text-right">{c.conversions}</td>
                <td className="px-4 py-3 text-right">{brl(c.cost_per_conv)}</td>
                <td className={`px-4 py-3 text-right ${c.ctr < 1 ? "text-danger" : ""}`}>{pct(c.ctr)}</td>
                <td className="px-4 py-3 text-right">{brl(c.cpc)}</td>
                <td className="px-4 py-3 text-right">
                  <span className={c.effective_status === "ACTIVE" ? "chip-ok" : "chip-warn"}>
                    {c.effective_status || "—"}
                  </span>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-6 text-center text-muted">Sem campanhas pra esse dia.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
