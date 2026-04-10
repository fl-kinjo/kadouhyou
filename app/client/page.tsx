import { redirect } from "next/navigation";
import { createClient } from "@/app/utils/supabase/server";
import ClientClient from "./client-client";

export default async function ClientPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");

  return <ClientClient />;
}
