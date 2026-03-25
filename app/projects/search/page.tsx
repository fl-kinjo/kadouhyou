import { redirect } from "next/navigation";
import { createClient } from "@/app/utils/supabase/server";
import ProjectsSearchClient from "./search-client";

export default async function ProjectsSearchPage() {
  const supabase = await createClient();
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) redirect("/login");

  return <ProjectsSearchClient />;
}