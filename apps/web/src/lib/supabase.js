import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://nyclgbtrkkegcdkrxaeq.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_5d4b7Ra3NfqCacJIVkR73w_iNRyxGrD'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
