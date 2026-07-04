import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Tipo locale per gli item passati a setAll, compatibile con le opzioni cookie
// di Next.js (Partial<ResponseCookie>). Evita l'uso di "any".
type CookieOptionsLike = {
  domain?: string;
  path?: string;
  maxAge?: number;
  expires?: Date;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: boolean | "lax" | "strict" | "none";
  priority?: "low" | "medium" | "high";
};
type CookieToSet = { name: string; value: string; options?: CookieOptionsLike };

/**
 * Client Supabase lato server legato alla sessione admin (cookie).
 * Opera con il ruolo "authenticated" => soggetto alle policy RLS.
 * Usato nelle pagine e nelle azioni admin.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Chiamato da un Server Component: ignorabile, la sessione
            // viene comunque rinfrescata dal middleware.
          }
        },
      },
    }
  );
}
