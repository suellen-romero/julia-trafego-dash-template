import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: true, autoRefreshToken: true } }
);

export type AccountSnap = {
  account_id: string;
  metric_date: string;
  spend: number;
  impressions: number;
  clicks: number;
  reach: number;
  frequency: number;
  ctr: number;
  cpc: number;
  cpm: number;
  conversions: number;
  cost_per_conv: number;
  page_conv_rate: number;
};

export type CampaignSnap = {
  account_id: string;
  campaign_id: string;
  campaign_name: string;
  metric_date: string;
  effective_status: string | null;
  daily_budget: number | null;
  spend: number;
  conversions: number;
  cost_per_conv: number;
  ctr: number;
  cpc: number;
};

export type BudgetChange = {
  campaign_name: string;
  old_daily: number;
  new_daily: number;
  ratio: number;
  changed_at: string;
};
