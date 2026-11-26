import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

// Substitua pelas credenciais reais do seu projeto Supabase (Project Settings > API)
const SUPABASE_URL = 'https://ftdghuawoyzfldmuaowi.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_jLg0edyTd_83QIXpzE6lJA_-5pEpPxA'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)