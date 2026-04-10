import { redirect } from "next/navigation";
import { createClient } from "@/app/utils/supabase/server";
import JobDetailClient from "./job-detail-client";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function JobDetailPage(props: PageProps) {
  const { id } = await props.params;

  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");

  return <JobDetailClient jobId={id} />;
}
