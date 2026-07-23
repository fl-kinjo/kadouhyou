import { redirect } from "next/navigation";
import { createClient } from "@/app/utils/supabase/server";
import EmployeeReportClient from "./employee-report-client";

export default async function EmployeeReportPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();

  if (!data.user) {
    redirect("/login");
  }

  return <EmployeeReportClient />;
}
