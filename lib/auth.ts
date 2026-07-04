import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "./supabase/server";

/**
 * Verifica che esista una sessione admin valida.
 * Restituisce il client Supabase (RLS authenticated) e l'utente.
 * Se non autenticato, reindirizza al login.
 */
export async function requireAdmin() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }
  return { supabase, user };
}
