import { redirect } from "next/navigation";
import { createClient } from "@/app/utils/supabase/server";
import ClientSummaryClient from "./client-summary-client";

export default async function ClientSummaryPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    redirect("/login");
  }

  return <ClientSummaryClient />;
}
