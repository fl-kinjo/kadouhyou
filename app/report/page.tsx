import { redirect } from "next/navigation";
import { createClient } from "@/app/utils/supabase/server";
import ReportClient from "./report-client";

type PageProps = {
  searchParams?: Promise<{ date?: string }>;
};

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default async function ReportPage(props: PageProps) {
  const sp = (await props.searchParams) ?? {};
  const date = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : todayISO();

  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");

  return <ReportClient initialDate={date} />;
}
