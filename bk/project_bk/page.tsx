import { redirect } from "next/navigation";
import { createClient } from "@/app/utils/supabase/server";
import ProjectClient from "./project-client";

export default async function ProjectPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    redirect("/login");
  }

  return <ProjectClient />;
}
