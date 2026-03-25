import { redirect } from "next/navigation";
import { createClient } from "@/app/utils/supabase/server";
import EmployeesClient from "./employees-client";

export default async function EmployeesPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");

  return <EmployeesClient />;
}