"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * Client Supabase lato browser. Usa la sola chiave pubblica "anon".
 * Impiegato esclusivamente per il LOGIN admin (auth). Non legge dati sensibili:
 * tutte le tabelle hanno RLS che nega l'accesso al ruolo "anon".
 */
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
