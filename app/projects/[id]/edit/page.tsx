import { redirect } from "next/navigation";
import { createClient } from "@/app/utils/supabase/server";
import ProjectEditClient from "./project-edit-client";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function ProjectEditPage(props: PageProps) {
  const { id } = await props.params;

  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");

  return <ProjectEditClient projectId={id} />;
}