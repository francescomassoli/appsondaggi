import { redirect } from "next/navigation";

// La home reindirizza all'area amministratore.
// I partecipanti accedono esclusivamente tramite il link pubblico /s/[token].
export default function Home() {
  redirect("/admin");
}
