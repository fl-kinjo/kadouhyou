import { redirect } from "next/navigation";
import { createClient } from "@/app/utils/supabase/server";
import AttendanceClient from "./attendance-client";

export default async function AttendancePage() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    redirect("/login");
  }

  return <AttendanceClient />;
}