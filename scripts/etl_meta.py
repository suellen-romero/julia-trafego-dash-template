#!/usr/bin/env python3
"""
ETL Meta Ads → Supabase
=======================
Roda 1× por dia (8:00 BRT via cron) e popula:
  - meta.account_snapshot   (1 row/dia, métricas da conta)
  - meta.campaign_snapshot  (1 row/dia/campanha)
  - meta.budget_changes     (detecta variações >2× em 24h)
  - meta.etl_runs           (log de execução)

Modo backfill:
    python3 etl_meta.py --backfill 7    # popula últimos 7 dias

Modo padrão:
    python3 etl_meta.py                  # só de ontem

Dependências:
    pip install requests supabase python-dateutil

Variáveis lidas de ~/.meta_ads_env (chmod 600):
    META_AD_ACCOUNT_ID    (ex: act_1234567890)
    META_ACCESS_TOKEN     (token nunca-expira do Business Manager)
    META_API_VERSION      (ex: v21.0)
    META_TIMEZONE         (ex: America/Sao_Paulo)

Variáveis lidas de ~/.julia_supabase_env:
    SUPABASE_URL
    SUPABASE_SERVICE_ROLE_KEY
"""
from __future__ import annotations
import argparse, json, os, sys, time, datetime as dt
from typing import Any, Dict, List
import requests
from dateutil import tz

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
def _load_env(path: str) -> Dict[str,str]:
    env: Dict[str,str] = {}
    if not os.path.exists(path):
        sys.exit(f"[etl_meta] env file ausente: {path}")
    with open(path) as fh:
        for line in fh:
            line = line.strip()
            if not line or line.startswith("#"): continue
            if line.startswith("export "): line = line[7:]
            if "=" in line:
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip().strip('"').strip("'")
    return env

META = _load_env(os.path.expanduser("~/.meta_ads_env"))
SB   = _load_env(os.path.expanduser("~/.julia_supabase_env"))

ACCOUNT_ID = META["META_AD_ACCOUNT_ID"]
TOKEN      = META["META_ACCESS_TOKEN"]
API_VER    = META.get("META_API_VERSION", "v21.0")
TZ_NAME    = META.get("META_TIMEZONE", "America/Sao_Paulo")
TZ         = tz.gettz(TZ_NAME)

GRAPH = f"https://graph.facebook.com/{API_VER}"

# ---------------------------------------------------------------------------
# Supabase helpers (REST direto, sem SDK pra evitar dep extra)
# ---------------------------------------------------------------------------
SB_URL = SB["SUPABASE_URL"].rstrip("/")
SB_KEY = SB["SUPABASE_SERVICE_ROLE_KEY"]
SB_HEADERS = {
    "apikey": SB_KEY,
    "Authorization": f"Bearer {SB_KEY}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates,return=minimal",
}

def sb_upsert(table: str, rows: List[Dict[str,Any]], on_conflict: str) -> int:
    if not rows: return 0
    url = f"{SB_URL}/rest/v1/{table}?on_conflict={on_conflict}"
    r = requests.post(url, headers=SB_HEADERS, json=rows, timeout=30)
    if r.status_code >= 400:
        raise RuntimeError(f"supabase upsert {table} {r.status_code}: {r.text}")
    return len(rows)

def sb_insert(table: str, row: Dict[str,Any]) -> Dict[str,Any]:
    h = dict(SB_HEADERS); h["Prefer"] = "return=representation"
    url = f"{SB_URL}/rest/v1/{table}"
    r = requests.post(url, headers=h, json=row, timeout=30)
    r.raise_for_status()
    return r.json()[0]

def sb_patch(table: str, row_id: int, patch: Dict[str,Any]) -> None:
    url = f"{SB_URL}/rest/v1/{table}?id=eq.{row_id}"
    r = requests.patch(url, headers=SB_HEADERS, json=patch, timeout=30)
    r.raise_for_status()

def sb_get(path: str) -> List[Dict[str,Any]]:
    url = f"{SB_URL}/rest/v1/{path}"
    r = requests.get(url, headers=SB_HEADERS, timeout=30)
    r.raise_for_status()
    return r.json()

# ---------------------------------------------------------------------------
# Meta API helpers (com backoff exponencial + rate limit awareness)
# ---------------------------------------------------------------------------
def meta_get(path: str, params: Dict[str,Any], attempt: int = 1) -> Dict[str,Any]:
    full = f"{GRAPH}/{path.lstrip('/')}"
    p = dict(params); p["access_token"] = TOKEN
    r = requests.get(full, params=p, timeout=60)
    if r.status_code == 200:
        # log BUC headers pra observabilidade
        buc = r.headers.get("X-Business-Use-Case-Usage")
        if buc:
            print(f"[meta] BUC: {buc[:140]}", file=sys.stderr)
        return r.json()
    # tratamento de rate limit (error code 17/4/32/613)
    try: err = r.json().get("error", {})
    except Exception: err = {}
    code = err.get("code")
    if code in (17, 4, 32, 613) and attempt < 6:
        sleep_s = 2 ** attempt
        print(f"[meta] rate limit code={code} attempt={attempt} sleep={sleep_s}s", file=sys.stderr)
        time.sleep(sleep_s)
        return meta_get(path, params, attempt+1)
    raise RuntimeError(f"meta {r.status_code} {err}")

def meta_paginate(path: str, params: Dict[str,Any]) -> List[Dict[str,Any]]:
    out: List[Dict[str,Any]] = []
    next_url = None
    while True:
        if next_url:
            r = requests.get(next_url, timeout=60)
            r.raise_for_status()
            data = r.json()
        else:
            data = meta_get(path, params)
        out.extend(data.get("data", []))
        next_url = data.get("paging", {}).get("next")
        if not next_url:
            break
    return out

# ---------------------------------------------------------------------------
# Coleta
# ---------------------------------------------------------------------------
INSIGHT_FIELDS = (
    "spend,impressions,clicks,reach,frequency,ctr,cpc,cpm,"
    "actions,cost_per_action_type"
)

def conversions_from_actions(actions: List[Dict[str,Any]] | None) -> int:
    """Soma actions de tipos relacionados a conversa/lead. Ajustável."""
    if not actions: return 0
    interest_types = {
        "onsite_conversion.messaging_conversation_started_7d",
        "onsite_conversion.messaging_first_reply",
        "lead",
        "onsite_web_lead",
        "submit_application_total",
    }
    total = 0
    for a in actions:
        if a.get("action_type") in interest_types:
            try: total += int(float(a.get("value", 0)))
            except Exception: pass
    return total

def cpa_from_cost_per_action(arr: List[Dict[str,Any]] | None) -> float:
    """Pega o primeiro cost_per_action_type relevante (conversa/lead)."""
    if not arr: return 0.0
    interest = {
        "onsite_conversion.messaging_conversation_started_7d",
        "lead",
    }
    for x in arr:
        if x.get("action_type") in interest:
            try: return float(x.get("value", 0))
            except Exception: return 0.0
    return 0.0

def fetch_account_insights(metric_date: dt.date) -> Dict[str,Any]:
    iso = metric_date.isoformat()
    data = meta_get(f"{ACCOUNT_ID}/insights", {
        "level": "account",
        "fields": INSIGHT_FIELDS,
        "time_range": json.dumps({"since": iso, "until": iso}),
        "time_increment": 1,
    })
    rows = data.get("data", [])
    if not rows:
        return {"account_id": ACCOUNT_ID, "metric_date": iso, "spend": 0}
    r = rows[0]
    convs = conversions_from_actions(r.get("actions"))
    cpa   = cpa_from_cost_per_action(r.get("cost_per_action_type"))
    return {
        "account_id":     ACCOUNT_ID,
        "metric_date":    iso,
        "spend":          float(r.get("spend") or 0),
        "impressions":    int(r.get("impressions") or 0),
        "clicks":         int(r.get("clicks") or 0),
        "reach":          int(r.get("reach") or 0),
        "frequency":      float(r.get("frequency") or 0),
        "ctr":            float(r.get("ctr") or 0),
        "cpc":            float(r.get("cpc") or 0),
        "cpm":            float(r.get("cpm") or 0),
        "conversions":    convs,
        "cost_per_conv":  cpa,
        "page_conv_rate": (convs / int(r.get("clicks") or 1) * 100) if int(r.get("clicks") or 0) else 0,
        "raw":            r,
    }

def fetch_campaign_insights(metric_date: dt.date) -> List[Dict[str,Any]]:
    iso = metric_date.isoformat()
    insights = meta_paginate(f"{ACCOUNT_ID}/insights", {
        "level": "campaign",
        "fields": INSIGHT_FIELDS + ",campaign_name,campaign_id",
        "time_range": json.dumps({"since": iso, "until": iso}),
        "time_increment": 1,
        "limit": 100,
    })
    # cruza com /campaigns pra trazer budget + status
    camps = meta_paginate(f"{ACCOUNT_ID}/campaigns", {
        "fields": "id,name,daily_budget,lifetime_budget,effective_status,updated_time",
        "limit": 200,
    })
    cmap = {c["id"]: c for c in camps}
    out = []
    for r in insights:
        cid = r.get("campaign_id")
        meta_c = cmap.get(cid, {})
        convs = conversions_from_actions(r.get("actions"))
        cpa   = cpa_from_cost_per_action(r.get("cost_per_action_type"))
        # budgets em Meta vêm em CENTAVOS
        db = meta_c.get("daily_budget")
        lb = meta_c.get("lifetime_budget")
        out.append({
            "account_id":       ACCOUNT_ID,
            "campaign_id":      cid,
            "campaign_name":    r.get("campaign_name") or meta_c.get("name") or cid,
            "metric_date":      iso,
            "effective_status": meta_c.get("effective_status"),
            "daily_budget":     (float(db)/100) if db else None,
            "lifetime_budget":  (float(lb)/100) if lb else None,
            "spend":            float(r.get("spend") or 0),
            "impressions":      int(r.get("impressions") or 0),
            "clicks":           int(r.get("clicks") or 0),
            "reach":            int(r.get("reach") or 0),
            "frequency":        float(r.get("frequency") or 0),
            "ctr":              float(r.get("ctr") or 0),
            "cpc":              float(r.get("cpc") or 0),
            "cpm":              float(r.get("cpm") or 0),
            "conversions":      convs,
            "cost_per_conv":    cpa,
            "raw":              {"insight": r, "campaign": meta_c},
        })
    return out

def detect_budget_changes(today_rows: List[Dict[str,Any]]) -> List[Dict[str,Any]]:
    """
    Detecta mudanças de daily_budget comparando o snapshot de hoje com o do dia anterior.
    Considera mudança se ratio (new/old) > 2 ou < 0.5.
    """
    if not today_rows: return []
    metric_date = today_rows[0]["metric_date"]
    prev = (dt.date.fromisoformat(metric_date) - dt.timedelta(days=1)).isoformat()
    prev_rows = sb_get(
        f"meta.campaign_snapshot?metric_date=eq.{prev}&select=campaign_id,daily_budget,campaign_name"
    )
    prev_map = {r["campaign_id"]: r for r in prev_rows}
    changes = []
    for r in today_rows:
        cid = r["campaign_id"]
        new_db = r.get("daily_budget")
        old_db = (prev_map.get(cid) or {}).get("daily_budget")
        if new_db and old_db and float(old_db) > 0:
            ratio = float(new_db) / float(old_db)
            if ratio > 2 or ratio < 0.5:
                changes.append({
                    "account_id":     ACCOUNT_ID,
                    "campaign_id":    cid,
                    "campaign_name":  r["campaign_name"],
                    "changed_at":     dt.datetime.now(TZ).isoformat(),
                    "old_daily":      float(old_db),
                    "new_daily":      float(new_db),
                    "ratio":          ratio,
                    "source":         "etl-diff-vs-prev",
                })
    return changes

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def run_for_date(d: dt.date) -> Dict[str,int]:
    print(f"[etl_meta] processando {d.isoformat()}", file=sys.stderr)
    acc_row  = fetch_account_insights(d)
    camp_rows = fetch_campaign_insights(d)
    n_acc  = sb_upsert("meta.account_snapshot", [acc_row], "account_id,metric_date")
    n_camp = sb_upsert("meta.campaign_snapshot", camp_rows, "campaign_id,metric_date")
    changes = detect_budget_changes(camp_rows)
    n_bud  = sb_upsert("meta.budget_changes", changes, "campaign_id,detected_at") if changes else 0
    return {"rows_account": n_acc, "rows_campaign": n_camp, "rows_budget": n_bud}

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--backfill", type=int, default=0,
                    help="Quantos dias retroativos puxar (0 = só ontem)")
    args = ap.parse_args()

    today = dt.datetime.now(TZ).date()
    targets = []
    if args.backfill > 0:
        for i in range(args.backfill, 0, -1):
            targets.append(today - dt.timedelta(days=i))
    else:
        targets.append(today - dt.timedelta(days=1))

    run = sb_insert("meta.etl_runs", {"status": "running"})
    totals = {"rows_account": 0, "rows_campaign": 0, "rows_budget": 0}
    try:
        for d in targets:
            r = run_for_date(d)
            for k in totals: totals[k] += r[k]
        sb_patch("meta.etl_runs", run["id"], {
            **totals,
            "status": "ok",
            "finished_at": dt.datetime.now(TZ).isoformat(),
            "notes": f"dates={[d.isoformat() for d in targets]}",
        })
        print(f"[etl_meta] OK · {totals}", file=sys.stderr)
    except Exception as e:
        sb_patch("meta.etl_runs", run["id"], {
            "status": "error",
            "finished_at": dt.datetime.now(TZ).isoformat(),
            "error": str(e)[:1000],
        })
        print(f"[etl_meta] ERROR · {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
