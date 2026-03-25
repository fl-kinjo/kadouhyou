import { redirect } from "next/navigation";
import { createClient } from "@/app/utils/supabase/server";
import PartnersClient from "./partners-client";

type PageProps = {
  searchParams?: Promise<{ q?: string; focus?: string }>;
};

export default async function PartnersPage(props: PageProps) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");

  const sp = (await props.searchParams) ?? {};
  const initialQ = (sp.q ?? "").toString();
  const initialFocusOnly = (sp.focus ?? "").toString() === "1";

  return <PartnersClient initialQ={initialQ} initialFocusOnly={initialFocusOnly} />;
}