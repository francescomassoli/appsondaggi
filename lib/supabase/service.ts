import "server-only"; // garanzia a build-time: mai importabile da codice client
import { createClient } from "@supabase/supabase-js";

/**
 * Client Supabase con service_role key. BYPASSA la RLS.
 * USO ESCLUSIVAMENTE SERVER (server actions / route handler) e solo per i
 * flussi partecipante, con validazioni esplicite nel codice chiamante:
 *   - token sondaggio valido
 *   - sondaggio non 'draft'
 *   - scritture consentite solo se status='open' e now() < closes_at
 * La chiave non ha prefisso NEXT_PUBLIC_ e non viene mai inviata al browser.
 */
export function createSupabaseServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );
}
