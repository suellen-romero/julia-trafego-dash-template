-- =========================================================================
-- Schema: dashboard tráfego Meta — Júlia Pretti
-- Aplicar via Supabase Studio > SQL Editor OU via Supabase CLI/MCP
-- Projeto Supabase sugerido: `julia-trafego`
-- =========================================================================

CREATE SCHEMA IF NOT EXISTS meta;

-- ---------------------------------------------------------------------------
-- 1) Snapshot diário no nível CONTA (1 row por dia)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS meta.account_snapshot (
  id              BIGSERIAL PRIMARY KEY,
  account_id      TEXT        NOT NULL,
  metric_date     DATE        NOT NULL,
  spend           NUMERIC(12,2) DEFAULT 0,
  impressions     BIGINT      DEFAULT 0,
  clicks          BIGINT      DEFAULT 0,
  reach           BIGINT      DEFAULT 0,
  frequency       NUMERIC(6,3) DEFAULT 0,
  ctr             NUMERIC(6,3) DEFAULT 0,
  cpc             NUMERIC(8,2) DEFAULT 0,
  cpm             NUMERIC(8,2) DEFAULT 0,
  conversions     INT         DEFAULT 0,
  cost_per_conv   NUMERIC(8,2) DEFAULT 0,
  page_conv_rate  NUMERIC(6,3) DEFAULT 0,
  fetched_at      TIMESTAMPTZ DEFAULT now(),
  raw             JSONB,
  UNIQUE (account_id, metric_date)
);
CREATE INDEX IF NOT EXISTS idx_account_snap_date
  ON meta.account_snapshot (metric_date DESC);

-- ---------------------------------------------------------------------------
-- 2) Snapshot diário por CAMPANHA
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS meta.campaign_snapshot (
  id              BIGSERIAL PRIMARY KEY,
  account_id      TEXT        NOT NULL,
  campaign_id     TEXT        NOT NULL,
  campaign_name   TEXT        NOT NULL,
  metric_date     DATE        NOT NULL,
  effective_status TEXT,
  daily_budget    NUMERIC(12,2),
  lifetime_budget NUMERIC(12,2),
  spend           NUMERIC(12,2) DEFAULT 0,
  impressions     BIGINT      DEFAULT 0,
  clicks          BIGINT      DEFAULT 0,
  reach           BIGINT      DEFAULT 0,
  frequency       NUMERIC(6,3) DEFAULT 0,
  ctr             NUMERIC(6,3) DEFAULT 0,
  cpc             NUMERIC(8,2) DEFAULT 0,
  cpm             NUMERIC(8,2) DEFAULT 0,
  conversions     INT         DEFAULT 0,
  cost_per_conv   NUMERIC(8,2) DEFAULT 0,
  fetched_at      TIMESTAMPTZ DEFAULT now(),
  raw             JSONB,
  UNIQUE (campaign_id, metric_date)
);
CREATE INDEX IF NOT EXISTS idx_camp_snap_date
  ON meta.campaign_snapshot (metric_date DESC);
CREATE INDEX IF NOT EXISTS idx_camp_snap_acct_date
  ON meta.campaign_snapshot (account_id, metric_date DESC);

-- ---------------------------------------------------------------------------
-- 3) Mudanças de budget detectadas — alimenta o GUARDRAIL
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS meta.budget_changes (
  id              BIGSERIAL PRIMARY KEY,
  account_id      TEXT NOT NULL,
  campaign_id     TEXT NOT NULL,
  campaign_name   TEXT NOT NULL,
  detected_at     TIMESTAMPTZ DEFAULT now(),
  changed_at      TIMESTAMPTZ,
  old_daily       NUMERIC(12,2),
  new_daily       NUMERIC(12,2),
  ratio           NUMERIC(8,3),
  source          TEXT DEFAULT 'etl-diff',
  raw             JSONB
);
CREATE INDEX IF NOT EXISTS idx_budget_chg_detected
  ON meta.budget_changes (detected_at DESC);

-- ---------------------------------------------------------------------------
-- 4) Log das execuções do ETL
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS meta.etl_runs (
  id            BIGSERIAL PRIMARY KEY,
  started_at    TIMESTAMPTZ DEFAULT now(),
  finished_at   TIMESTAMPTZ,
  status        TEXT NOT NULL CHECK (status IN ('running','ok','error')),
  rows_account  INT,
  rows_campaign INT,
  rows_budget   INT,
  error         TEXT,
  notes         TEXT
);
CREATE INDEX IF NOT EXISTS idx_etl_started
  ON meta.etl_runs (started_at DESC);

-- ---------------------------------------------------------------------------
-- VIEW: média 7 dias por conta (usada pelo briefing matinal)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW meta.v_account_7d AS
SELECT
  account_id,
  AVG(spend)::NUMERIC(12,2)        AS avg_spend_7d,
  AVG(conversions)::NUMERIC(6,2)   AS avg_conversions_7d,
  AVG(ctr)::NUMERIC(6,3)           AS avg_ctr_7d,
  AVG(cpc)::NUMERIC(8,2)           AS avg_cpc_7d,
  AVG(cost_per_conv)::NUMERIC(8,2) AS avg_cpa_7d
FROM meta.account_snapshot
WHERE metric_date >= CURRENT_DATE - INTERVAL '7 days'
  AND metric_date <  CURRENT_DATE
GROUP BY account_id;

-- ---------------------------------------------------------------------------
-- RLS: leitura permitida via ANON (dashboard front lê com anon key)
--      escrita só via SERVICE ROLE (ETL roda no servidor)
-- ---------------------------------------------------------------------------
ALTER TABLE meta.account_snapshot  ENABLE ROW LEVEL SECURITY;
ALTER TABLE meta.campaign_snapshot ENABLE ROW LEVEL SECURITY;
ALTER TABLE meta.budget_changes    ENABLE ROW LEVEL SECURITY;
ALTER TABLE meta.etl_runs          ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS read_anon_account ON meta.account_snapshot;
CREATE POLICY read_anon_account ON meta.account_snapshot
  FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS read_anon_campaign ON meta.campaign_snapshot;
CREATE POLICY read_anon_campaign ON meta.campaign_snapshot
  FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS read_anon_budget ON meta.budget_changes;
CREATE POLICY read_anon_budget ON meta.budget_changes
  FOR SELECT TO anon USING (true);

-- etl_runs: anon NÃO lê (é log operacional). Só service_role escreve/lê.

-- ---------------------------------------------------------------------------
-- Fim do schema.
-- Validação rápida:
--   SELECT COUNT(*) FROM meta.account_snapshot;   -- deve retornar 0 inicialmente
--   SELECT * FROM meta.v_account_7d;              -- deve retornar 0 rows até ter dados
-- ---------------------------------------------------------------------------
