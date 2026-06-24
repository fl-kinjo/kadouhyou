import { redirect } from "next/navigation";
import { createClient } from "@/app/utils/supabase/server";
import ProjectEditClient from "./project-edit-client";

export default async function ProjectEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();

  if (!data.user) {
    redirect("/login");
  }

  const [
    { data: project, error: projectError },
    { data: members, error: membersError },
    { data: clients, error: clientsError },
    { data: profiles, error: profilesError },
    { data: profileJobs, error: profileJobsError },
    { data: jobs, error: jobsError },
  ] = await Promise.all([
    supabase
      .from("project")
      .select(
        "id,name,client_id,start_date,end_date,project_manager_id,sales_profile_id,pm_revenue_share,member_revenue_share,status,invoice_amount,invoice_month,payment_due_date,estimate,invoice"
      )
      .eq("id", id)
      .single(),
    supabase.from("project_member").select("profile_id").eq("project_id", id),
    supabase
      .from("client")
      .select("id,name,is_focus")
      .order("is_focus", { ascending: false })
      .order("name", { ascending: true }),
    supabase
      .from("profiles_2")
      .select("id,email,last_name,first_name,status")
      .neq("status", 2)
      .order("created_at", { ascending: true }),
    supabase.from("profile_job").select("profile_id,job_id"),
    supabase.from("job").select("id,name"),
  ]);

  if (projectError || !project) {
    throw new Error(projectError?.message ?? "案件が見つかりません。");
  }
  if (membersError) throw new Error(membersError.message);
  if (clientsError) throw new Error(clientsError.message);
  if (profilesError) throw new Error(profilesError.message);
  if (profileJobsError) throw new Error(profileJobsError.message);
  if (jobsError) throw new Error(jobsError.message);

  const nextProfiles = ((profiles ?? []) as Array<{
    id: string;
    email: string | null;
    last_name: string | null;
    first_name: string | null;
    status: number | null;
  }>).filter((profile) => `${profile.last_name ?? ""}${profile.first_name ?? ""}`.trim() !== "");

  const profileJobRows = (profileJobs ?? []) as Array<{ profile_id: string; job_id: string }>;
  const jobRows = (jobs ?? []) as Array<{ id: string; name: string }>;
  const salesJobIds = new Set(jobRows.filter((job) => job.name === "営業").map((job) => job.id));
  const salesProfileIds = new Set(
    profileJobRows.filter((profileJob) => salesJobIds.has(profileJob.job_id)).map((profileJob) => profileJob.profile_id)
  );
  const salesProfiles = nextProfiles.filter((profile) => salesProfileIds.has(profile.id));

  return (
    <ProjectEditClient
      projectId={id}
      initialProject={project}
      initialMemberProfileIds={(members ?? []).map((member) => member.profile_id)}
      clients={(clients ?? []) as Array<{ id: string; name: string; is_focus: number | null }>}
      profiles={nextProfiles}
      salesProfiles={salesProfiles}
    />
  );
}
