import { redirect } from "next/navigation";
import { createClient } from "@/app/utils/supabase/server";
import JobRoleDetailClient from "./job-role-detail-client";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function JobRoleDetailPage(props: PageProps) {
  const { id } = await props.params;

  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");

  return <JobRoleDetailClient jobRoleId={id} />;
}