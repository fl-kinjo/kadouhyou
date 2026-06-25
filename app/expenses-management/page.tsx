import { redirect } from "next/navigation";
import { createClient } from "@/app/utils/supabase/server";
import ExpensesManagementClient from "./expenses-management-client";

export default async function ExpensesManagementPage() {
  const supabase = await createClient();

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    redirect("/login");
  }

  const [
    { data: profile, error: profileError },
    { data: teamLeaderData, error: teamLeaderError },
  ] = await Promise.all([
    supabase
      .from("profiles_2")
      .select("id,is_admin")
      .eq("id", authData.user.id)
      .maybeSingle(),
    supabase
      .from("team_leader")
      .select("id")
      .eq("profile_id", authData.user.id)
      .limit(1),
  ]);

  const isAdmin = profile?.is_admin === 1;
  const isTeamLeader = (teamLeaderData?.length ?? 0) > 0;

  if (profileError || teamLeaderError || !profile || (!isAdmin && !isTeamLeader)) {
    redirect("/");
  }

  return <ExpensesManagementClient />;
}