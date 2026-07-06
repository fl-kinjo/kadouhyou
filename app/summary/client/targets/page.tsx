import { redirect } from "next/navigation";
import { createClient } from "@/app/utils/supabase/server";
import ClientTargetsClient from "./client-targets-client";

type ClientTargetsPageProps = {
  searchParams?: Promise<{ year?: string }> | { year?: string };
};

export default async function ClientTargetsPage({ searchParams }: ClientTargetsPageProps) {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    redirect("/login");
  }

  const params = await searchParams;
  const parsedYear = Number(params?.year);
  const initialYear = Number.isFinite(parsedYear) ? parsedYear : new Date().getFullYear();

  return <ClientTargetsClient initialYear={initialYear} />;
}
