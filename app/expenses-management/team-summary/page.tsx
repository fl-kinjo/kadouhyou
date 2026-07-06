import { redirect } from "next/navigation";
import { createClient } from "@/app/utils/supabase/server";
import TeamExpenseSummaryClient from "./team-expense-summary-client";

type TeamExpenseSummaryPageProps = {
  searchParams?: Promise<{ year?: string; month?: string }> | { year?: string; month?: string };
};

function parseInitialMonth(yearValue?: string, monthValue?: string) {
  const now = new Date();
  const year = Number(yearValue);
  const month = Number(monthValue);

  if (Number.isInteger(year) && Number.isInteger(month) && month >= 1 && month <= 12) {
    return { year, month };
  }

  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

export default async function TeamExpenseSummaryPage({ searchParams }: TeamExpenseSummaryPageProps) {
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

  const params = await searchParams;
  const initialMonth = parseInitialMonth(params?.year, params?.month);

  return <TeamExpenseSummaryClient initialYear={initialMonth.year} initialMonth={initialMonth.month} />;
}
