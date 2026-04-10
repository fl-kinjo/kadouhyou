import { redirect } from "next/navigation";
import { createClient } from "@/app/utils/supabase/server";
import PartnerClient from "./partner-client";

export default async function PartnerPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");

  return <PartnerClient />;
}
