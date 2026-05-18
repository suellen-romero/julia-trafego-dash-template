#!/usr/bin/env python3
"""
Briefing matinal Meta Ads → Telegram
=====================================
Roda 1× por dia (9:03 BRT via cron) e envia pra Júlia:
  - Guardrail (teto de budget)
  - 5 blocos (Dinheiro / Volume / Eficiência / Saúde / Comparativo)
  - 1-3 ações recomendadas

Dependências:
    pip install requests python-dateutil

Variáveis lidas de ~/.julia_supabase_env:
    SUPABASE_URL
    SUPABASE_SERVICE_ROLE_KEY

Variáveis lidas de ~/.julia_briefing_env (chmod 600):
    TELEGRAM_BOT_TOKEN     (bot da Mavi-da-Júlia)
    TELEGRAM_CHAT_ID       (DM da Júlia)
    BUDGET_CAP_DAILY       (teto diário em R$, ex: 500)
    META_ACCOUNT_ID        (ex: act_1234567890)
"""
from __future__ import annotations
import os, sys, json, datetime as dt
from typing import Any, Dict, List
import requests
from dateutil import tz

# ---------------------------------------------------------------------------
def _load_env(path: str) -> Dict[str,str]:
    env: Dict[str,str] = {}
    if not os.path.exists(path):
        sys.exit(f"[briefing] env file ausente: {path}")
    with open(path) as fh:
        for line in fh:
            line = line.strip()
            if not line or line.startswith("#"): continue
            if line.startswith("export "): line = line[7:]
            if "=" in line:
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip().strip('"').strip("'")
    return env

SB = _load_env(os.path.expanduser("~/.julia_supabase_env"))
B  = _load_env(os.path.expanduser("~/.julia_briefing_env"))

SB_URL  = SB["SUPABASE_URL"].rstrip("/")
SB_KEY  = SB["SUPABASE_SERVICE_ROLE_KEY"]
BOT     = B["TELEGRAM_BOT_TOKEN"]
CHAT_ID = B["TELEGRAM_CHAT_ID"]
CAP     = float(B.get("BUDGET_CAP_DAILY", "500"))
ACCT    = B["META_ACCOUNT_ID"]
TZ      = tz.gettz("America/Sao_Paulo")

SB_HEADERS = {
    "apikey": SB_KEY,
    "Authorization": f"Bearer {SB_KEY}",
    "Accept": "application/json",
}

# ---------------------------------------------------------------------------
def sb_get(path: str) -> List[Dict[str,Any]]:
    r = requests.get(f"{SB_URL}/rest/v1/{path}", headers=SB_HEADERS, timeout=30)
    r.raise_for_status()
    return r.json()

def fmt_brl(v: float) -> str:
    s = f"R$ {v:,.2f}"
    return s.replace(",", "X").replace(".", ",").replace("X", ".")

def fmt_int(v: int) -> str:
    return f"{v:,}".replace(",", ".")

def fmt_pct(v: float) -> str:
    return f"{v:.2f}%".replace(".", ",")

# ---------------------------------------------------------------------------
def build_briefing(target: dt.date) -> str:
    iso = target.isoformat()
    acc = sb_get(f"meta.account_snapshot?account_id=eq.{ACCT}&metric_date=eq.{iso}&select=*")
    if not acc:
        return f"⚠️ Briefing {iso}: sem dados de ontem ainda. ETL não rodou ou conta vazia."
    a = acc[0]
    avg = sb_get(f"meta.v_account_7d?account_id=eq.{ACCT}&select=*")
    avg = avg[0] if avg else {}

    # campanhas: melhor + pior por CPA (com pelo menos 1 conversão)
    camps = sb_get(
        f"meta.campaign_snapshot?account_id=eq.{ACCT}&metric_date=eq.{iso}&conversions=gt.0"
        f"&select=campaign_name,spend,conversions,cost_per_conv,daily_budget&order=cost_per_conv.asc"
    )
    best = camps[0]  if camps else None
    worst = camps[-1] if camps and len(camps) > 1 else None

    # budget total ativo + mudanças últimas 24h
    active_camps = sb_get(
        f"meta.campaign_snapshot?account_id=eq.{ACCT}&metric_date=eq.{iso}"
        f"&effective_status=eq.ACTIVE&select=daily_budget"
    )
    total_active_budget = sum(float(c.get("daily_budget") or 0) for c in active_camps)

    since = (dt.datetime.now(TZ) - dt.timedelta(hours=24)).isoformat()
    changes = sb_get(
        f"meta.budget_changes?detected_at=gte.{since}"
        f"&select=campaign_name,old_daily,new_daily,ratio,changed_at"
    )

    # guardrail line
    violated = total_active_budget > CAP
    if violated:
        guard = f"🛡️ GUARDRAIL · 🔴 TETO VIOLADO: {fmt_brl(total_active_budget)} ativo (limite {fmt_brl(CAP)})"
    else:
        guard = f"🛡️ GUARDRAIL · Tudo dentro do teto ({fmt_brl(total_active_budget)} ativo / limite {fmt_brl(CAP)}) ✅"
    if changes:
        chg_lines = []
        for c in changes:
            chg_lines.append(
                f"  • {c['campaign_name']} · {fmt_brl(float(c['old_daily']))} → "
                f"{fmt_brl(float(c['new_daily']))} (ratio {float(c['ratio']):.1f}×) ⚠️"
            )
        guard += "\nMudanças últimas 24h:\n" + "\n".join(chg_lines)
    else:
        guard += "\nSem mudanças de budget nas últimas 24h ✅"

    # alerts
    ctr_alert = " 🔴" if float(a["ctr"] or 0) < 1.0 else " ✅"
    freq_alert = " 🔴" if float(a["frequency"] or 0) > 3.0 else " ✅"

    # ações
    actions = build_actions(a, camps, avg)

    out = []
    out.append(guard)
    out.append("")
    out.append("💰 DINHEIRO")
    out.append(f"  Gasto ontem ({target.strftime('%d/%m')}): {fmt_brl(float(a['spend']))}")
    out.append(f"  CPA por conversa: {fmt_brl(float(a['cost_per_conv']))}")
    out.append("")
    out.append("📊 VOLUME")
    out.append(f"  Impressões: {fmt_int(int(a['impressions']))}")
    out.append(f"  Cliques: {fmt_int(int(a['clicks']))}")
    out.append(f"  Conversas iniciadas: {fmt_int(int(a['conversions']))}")
    out.append("")
    out.append("⚙️ EFICIÊNCIA")
    out.append(f"  CTR: {fmt_pct(float(a['ctr']))}{ctr_alert}")
    out.append(f"  CPC: {fmt_brl(float(a['cpc']))}")
    out.append(f"  CPM: {fmt_brl(float(a['cpm']))}")
    out.append(f"  Conversão da página: {fmt_pct(float(a['page_conv_rate']))}")
    out.append("")
    out.append("🩺 SAÚDE")
    out.append(f"  Frequência: {float(a['frequency']):.2f}{freq_alert} (Reach {fmt_int(int(a['reach']))})")
    out.append("  Ads com queda CTR >20% em 7d: (a implementar — query ad-level)")
    out.append("")
    out.append("📈 COMPARATIVO")
    if avg:
        avg_spend = float(avg.get("avg_spend_7d") or 0)
        spend_pct = ((float(a['spend']) - avg_spend) / avg_spend * 100) if avg_spend > 0 else 0
        out.append(f"  Ontem vs média 7d:")
        out.append(f"    Gasto:     {fmt_brl(float(a['spend']))} vs {fmt_brl(avg_spend)}/d  ({spend_pct:+.0f}%)")
        out.append(f"    Conversas: {int(a['conversions'])}      vs {float(avg.get('avg_conversions_7d') or 0):.1f}/d")
        out.append(f"    CTR:       {fmt_pct(float(a['ctr']))}   vs {fmt_pct(float(avg.get('avg_ctr_7d') or 0))}")
        out.append(f"    CPC:       {fmt_brl(float(a['cpc']))} vs {fmt_brl(float(avg.get('avg_cpc_7d') or 0))}")
    if best:
        out.append(f"  Melhor campanha: {best['campaign_name']} → CPA {fmt_brl(float(best['cost_per_conv']))} "
                   f"({int(best['conversions'])} conv em {fmt_brl(float(best['spend']))})")
    if worst and worst is not best:
        out.append(f"  Pior campanha:   {worst['campaign_name']}  → CPA {fmt_brl(float(worst['cost_per_conv']))} "
                   f"({int(worst['conversions'])} conv em {fmt_brl(float(worst['spend']))})")
    out.append("")
    out.append("🧠 AÇÕES")
    for i, act in enumerate(actions, 1):
        out.append(f"  {i}. {act}")
    out.append("")
    out.append("— Mavi")
    return "\n".join(out)

def build_actions(acc: Dict, camps: List[Dict], avg: Dict) -> List[str]:
    """Regras simples — máx 3 ações priorizadas por impacto."""
    actions = []
    # 1) Campanha com CPA <50% do médio → sugerir escalar 20%
    if camps and avg:
        avg_cpa = float(avg.get("avg_cpa_7d") or 0)
        if avg_cpa > 0:
            for c in camps[:3]:
                cpa = float(c["cost_per_conv"] or 0)
                if cpa > 0 and cpa < avg_cpa * 0.6:
                    actions.append(
                        f"Subir budget {c['campaign_name']} em 20%. CPA {fmt_brl(cpa)} "
                        f"está bem abaixo da média 7d ({fmt_brl(avg_cpa)}) — escalar com calma."
                    )
                    break
    # 2) Frequência alta → renovar criativo
    if float(acc.get("frequency") or 0) > 2.5:
        actions.append(
            f"Frequência {float(acc['frequency']):.2f} subindo. Pedir 2 variações novas "
            f"pros ads de maior gasto pra evitar fadiga."
        )
    # 3) Conversão da página baixa
    pcr = float(acc.get("page_conv_rate") or 0)
    if 0 < pcr < 5.0:
        actions.append(
            f"Conversão da página {pcr:.1f}%. Testar variação do hook do hero "
            f"— pode chegar a 6-8% só trocando a primeira linha."
        )
    # 4) Worst campaign acima da meta — sinalizar
    if camps and len(camps) > 1:
        worst = camps[-1]
        cpa_worst = float(worst["cost_per_conv"] or 0)
        if cpa_worst > 50:
            actions.append(
                f"Avaliar {worst['campaign_name']} (CPA {fmt_brl(cpa_worst)}). "
                f"Se manter padrão 3 dias, pausar."
            )
    # fallback
    if not actions:
        actions.append("Sem anomalia hoje. Métricas estáveis. Seguir o plano da semana.")
    return actions[:3]

# ---------------------------------------------------------------------------
def send_telegram(text: str) -> None:
    url = f"https://api.telegram.org/bot{BOT}/sendMessage"
    # Telegram tem limite de 4096 chars — quebra se necessário
    chunks = [text[i:i+3900] for i in range(0, len(text), 3900)]
    for chunk in chunks:
        r = requests.post(url, json={
            "chat_id": CHAT_ID,
            "text": chunk,
            "parse_mode": "",       # texto plano, evita problema com markdown
            "disable_web_page_preview": True,
        }, timeout=30)
        if r.status_code != 200:
            print(f"[briefing] telegram {r.status_code}: {r.text}", file=sys.stderr)

def main():
    target = (dt.datetime.now(TZ) - dt.timedelta(days=1)).date()
    text = build_briefing(target)
    send_telegram(text)
    print(f"[briefing] enviado · {len(text)} chars", file=sys.stderr)

if __name__ == "__main__":
    main()
