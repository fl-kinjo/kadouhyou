import { redirect } from "next/navigation";
import { createClient } from "@/app/utils/supabase/server";
import EmployeeClient from "./employee-client";

export default async function EmployeePage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();

  if (!data.user) {
    redirect("/login");
  }

  return <EmployeeClient />;
}
