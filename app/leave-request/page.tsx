import { redirect } from "next/navigation";
import { createClient } from "@/app/utils/supabase/server";
import LeaveRequestClient from "./leave-request-client";

export default async function LeaveRequestPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    redirect("/login");
  }

  return <LeaveRequestClient />;
}