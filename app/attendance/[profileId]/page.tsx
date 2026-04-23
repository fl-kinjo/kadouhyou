import { redirect } from "next/navigation";
import { createClient } from "@/app/utils/supabase/server";
import AttendanceDetailClient from "./attendance-detail-client";

type PageProps = {
  params: Promise<{ profileId: string }>;
};

export default async function AttendanceDetailPage(props: PageProps) {
  const { profileId } = await props.params;

  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();

  if (authError || !authData.user) {
    redirect("/login");
  }

  const { data: currentProfile, error: profileError } = await supabase
    .from("profiles_2")
    .select("id,is_admin")
    .eq("id", authData.user.id)
    .maybeSingle();

  if (profileError || !currentProfile || currentProfile.is_admin !== 1) {
    redirect("/");
  }

  return <AttendanceDetailClient profileId={profileId} />;
}