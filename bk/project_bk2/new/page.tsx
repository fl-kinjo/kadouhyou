import { redirect } from "next/navigation";
import { createClient } from "@/app/utils/supabase/server";
import ProjectNewClient from "./project-new-client";

export default async function ProjectNewPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();

  if (!data.user) redirect("/login");

  return <ProjectNewClient />;
}
