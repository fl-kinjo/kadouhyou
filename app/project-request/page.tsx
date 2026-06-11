import { redirect } from "next/navigation";
import { createClient } from "@/app/utils/supabase/server";
import ProjectRequestClient from "./project-request-client";

export default async function ProjectRequestPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    redirect("/login");
  }

  return <ProjectRequestClient />;
}
