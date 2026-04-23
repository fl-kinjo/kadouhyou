import { redirect } from "next/navigation";
import { createClient } from "@/app/utils/supabase/server";
import TopClient from "./top-client";

export default async function TopPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    redirect("/login");
  }

  return <TopClient />;
}