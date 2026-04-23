import { redirect } from "next/navigation";
import { createClient } from "@/app/utils/supabase/server";
import ExpensesClient from "./expenses-client";

export default async function ExpensesPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    redirect("/login");
  }

  return <ExpensesClient />;
}