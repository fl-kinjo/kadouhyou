import { redirect } from "next/navigation";
import { createClient } from "@/app/utils/supabase/server";
import AttendanceManagementClient from "./attendance-management-client";

export default async function AttendanceManagementPage() {
  const supabase = await createClient();

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    redirect("/login");
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles_2")
    .select("id,is_admin")
    .eq("id", authData.user.id)
    .maybeSingle();

  if (profileError || !profile || profile.is_admin !== 1) {
    redirect("/");
  }

  return <AttendanceManagementClient />;
}