-- =========================================================================
-- Migration 002: tabela de vendas + view agregada diária
-- Aplica DEPOIS de 001_meta_dashboard_julia.sql
-- =========================================================================

-- Vendas individuais (1 row por pedido/transação)
CREATE TABLE IF NOT EXISTS meta.sales (
  id            BIGSERIAL PRIMARY KEY,
  external_id   TEXT,                          -- id do pedido na fonte (Stripe charge_id, Hotmart transaction, etc)
  source        TEXT NOT NULL,                 -- 'stripe' | 'hotmart' | 'kiwify' | 'eduzz' | 'cakto' | 'manual' | 'custom'
  occurred_at   TIMESTAMPTZ NOT NULL,
  metric_date   DATE NOT NULL,                 -- data no timezone da operação
  revenue       NUMERIC(12,2) NOT NULL,
  fee           NUMERIC(12,2) DEFAULT 0,       -- taxa da plataforma (Stripe/Hotmart cobram %)
  net_revenue   NUMERIC(12,2),                 -- revenue - fee
  customer_id   TEXT,                          -- email ou id do cliente (anonimizar se sensível)
  product_name  TEXT,
  utm_source    TEXT,                          -- pra cruzar com Meta (utm_source=facebook etc)
  utm_campaign  TEXT,                          -- nome da campanha Meta correspondente
  campaign_id   TEXT,                          -- id Meta se conseguir mapear via UTM ou click_id
  status        TEXT DEFAULT 'paid',           -- 'paid' | 'refunded' | 'chargeback' | 'pending'
  raw           JSONB,
  fetched_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE (source, external_id)
);
CREATE INDEX IF NOT EXISTS idx_sales_date ON meta.sales (metric_date DESC);
CREATE INDEX IF NOT EXISTS idx_sales_campaign ON meta.sales (campaign_id, metric_date DESC);

-- View agregada diária — alimenta /vendas no dashboard + bloco vendas/ROAS no briefing
CREATE OR REPLACE VIEW meta.sales_daily AS
SELECT
  metric_date,
  source,
  COUNT(*) FILTER (WHERE status = 'paid')                  AS orders,
  COALESCE(SUM(revenue) FILTER (WHERE status = 'paid'), 0) AS revenue,
  COALESCE(SUM(net_revenue) FILTER (WHERE status = 'paid'), 0) AS net_revenue,
  COUNT(*) FILTER (WHERE status = 'refunded')              AS refunded
FROM meta.sales
GROUP BY metric_date, source
ORDER BY metric_date DESC, source;

-- RLS
ALTER TABLE meta.sales ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS read_anon_sales ON meta.sales;
CREATE POLICY read_anon_sales ON meta.sales FOR SELECT TO anon USING (true);
