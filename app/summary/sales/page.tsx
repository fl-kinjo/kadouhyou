import { redirect } from "next/navigation";
import { createClient } from "@/app/utils/supabase/server";
import SalesSummaryClient from "./sales-summary-client";

export default async function SalesSummaryPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();

  if (!data.user) {
    redirect("/login");
  }

  return <SalesSummaryClient />;
}