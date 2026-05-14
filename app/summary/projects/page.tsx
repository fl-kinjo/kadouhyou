import { redirect } from "next/navigation";
import { createClient } from "@/app/utils/supabase/server";
import SummaryProjectsClient from "./summary-projects-client";

export default async function SummaryProjectsPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();

  if (!data.user) {
    redirect("/login");
  }

  return <SummaryProjectsClient />;
}