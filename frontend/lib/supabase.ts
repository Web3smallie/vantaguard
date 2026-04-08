import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://waljgojrqgpkheufekna.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndhbGpnb2pycWdwa2hldWZla25hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1NzcxODYsImV4cCI6MjA5MTE1MzE4Nn0.jpW9izTPkZ1RqukLboOfFXsTzwzkBjZNkeQYZ-9pHuo";

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

export type SecurityStatus = {
  id: number;
  vibe_score: number;
  is_locked: boolean;
  last_action: string;
  strategy_mode: number;
  signal_gas: number;
  signal_mempool: number;
  signal_volatility: number;
  signal_liquidity: number;
  reaction_speed_ms: number;
  vibe_threshold: number;
  user_email: string;
  total_exits: number;
  best_reaction_ms: number;
};

export type ReflexLog = {
  id: number;
  threat_detected_ms: number;
  tx_broadcast_ms: number;
  tx_confirmed_ms: number;
  reaction_speed_ms: number;
  vibe_score_at_trigger: number;
  strategy_mode: number;
  tx_hash: string;
  created_at: string;
};