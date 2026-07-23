import { redirect } from "next/navigation";
import { createClient } from "@/app/utils/supabase/server";
import ExpensesManagementClient from "./expenses-management-client";

export default async function ExpensesManagementPage() {
  const supabase = await createClient();

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    redirect("/login");
  }

  const { data: canAccessData, error: canAccessError } = await supabase.rpc(
    "can_access_expense_management"
  );

  if (canAccessError || canAccessData !== true) {
    redirect("/");
  }

  return <ExpensesManagementClient initialHasApprovalAccess />;
}
