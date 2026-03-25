import { redirect } from "next/navigation";
import { createClient } from "@/app/utils/supabase/server";
import ClientsClient from "./clients-client";

export default async function ClientsPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");

  return <ClientsClient />;
}