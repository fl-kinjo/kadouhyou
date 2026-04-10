import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/app/utils/supabase/server";
import ProjectDetailActions from "./project-detail-actions";
import PlannedCostSection from "./planned-cost-section";
import ActualCostSection from "./actual-cost-section";
import styles from "./page.module.css";

type PageProps = {
  params: Promise<{ id: string }>;
};

type Profile = {
  id: string;
  last_name: string | null;
  first_name: string | null;
  status: number | null;
};

type ProjectPlannedCost = {
  id: string;
  project_id: string;
  category: number;
  expense_name: string | null;
  partner_id: string | null;
  job_id: string | null;
  profile_id: string | null;
  operating_person_months: number | string | null;
  target_year_month: string;
  amount: number | null;
};

type ProjectActualCost = {
  id: string;
  project_id: string;
  category: number;
  expense_name: string | null;
  partner_id: string | null;
  target_year_month: string;
  amount: number | string | null;
};

type ReportRow = {
  id: string;
  profile_id: string;
  project_id: string;
  work_date: string;
  hours: number | string;
};

const STATUS_LABELS: Record<number, string> = {
  0: "保留",
  1: "営業中",
  2: "確定前",
  3: "確定",
  4: "進行中",
  5: "完了",
  6: "滞留",
  7: "プリセールス(無償)",
  8: "社内案件(無償)",
};

function formatDate(value: string | null) {
  return value ?? "-";
}

function formatPeriod(startDate: string | null, endDate: string | null) {
  if (!startDate && !endDate) return "-";
  if (startDate && endDate) return `${startDate}〜${endDate}`;
  return startDate ?? endDate ?? "-";
}

function formatYen(value: number | string | null) {
  if (value == null) return "-";
  const numberValue = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(numberValue)) return String(value);
  return `¥${Math.round(numberValue).toLocaleString("ja-JP")}`;
}

function formatMonth(value: string | null) {
  if (!value) return "-";
  const [year, month] = value.split("-");
  if (!year || !month) return value;
  return `${year}/${month}`;
}

function formatPercent(value: number | string | null) {
  if (value == null) return "-";
  const numberValue = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(numberValue)) return String(value);
  return `${numberValue}%`;
}

function fullName(lastName: string | null | undefined, firstName: string | null | undefined) {
  const name = `${lastName ?? ""} ${firstName ?? ""}`.trim();
  return name || "-";
}

function isUrl(value: string | null) {
  return !!value && /^https?:\/\//i.test(value);
}

export default async function ProjectDetailPage(props: PageProps) {
  const { id } = await props.params;

  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    redirect("/login");
  }

  const { data: project, error: projectError } = await supabase
    .from("project")
    .select(
      "id,name,client_id,start_date,end_date,project_manager_id,pm_revenue_share,member_revenue_share,status,invoice_amount,invoice_month,payment_due_date,estimate,invoice,created_at,updated_at,updated_by"
    )
    .eq("id", id)
    .single();

  if (projectError || !project) {
    throw new Error(projectError?.message ?? "案件が見つかりません。");
  }

  const [
    { data: client },
    { data: members, error: membersError },
    { data: profiles, error: profilesError },
    { data: plannedCosts, error: plannedCostsError },
    { data: actualCosts, error: actualCostsError },
    { data: reports, error: reportsError },
    { data: partners, error: partnersError },
    { data: jobs, error: jobsError },
  ] = await Promise.all([
    supabase.from("client").select("id,name").eq("id", project.client_id).maybeSingle(),
    supabase.from("project_member").select("profile_id").eq("project_id", id),
    supabase
      .from("profiles_2")
      .select("id,last_name,first_name,status")
      .order("created_at", { ascending: true }),
    supabase
      .from("project_planned_cost")
      .select(
        "id,project_id,category,expense_name,partner_id,job_id,profile_id,operating_person_months,target_year_month,amount"
      )
      .eq("project_id", id)
      .order("target_year_month", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase
      .from("project_actual_cost")
      .select("id,project_id,category,expense_name,partner_id,target_year_month,amount")
      .eq("project_id", id)
      .order("target_year_month", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase
      .from("report")
      .select("id,profile_id,project_id,work_date,hours")
      .eq("project_id", id)
      .order("work_date", { ascending: true }),
    supabase.from("partner").select("id,name").order("name", { ascending: true }),
    supabase.from("job").select("id,name").order("name", { ascending: true }),
  ]);

  if (membersError) throw new Error(membersError.message);
  if (profilesError) throw new Error(profilesError.message);
  if (plannedCostsError) throw new Error(plannedCostsError.message);
  if (actualCostsError) throw new Error(actualCostsError.message);
  if (reportsError) throw new Error(reportsError.message);
  if (partnersError) throw new Error(partnersError.message);
  if (jobsError) throw new Error(jobsError.message);

  const allProfiles = (profiles ?? []) as Profile[];
  const profileMap = new Map(allProfiles.map((profile) => [profile.id, profile]));
  const projectManager = project.project_manager_id ? profileMap.get(project.project_manager_id) : null;
  const memberNames = (members ?? [])
    .map((member) => profileMap.get(member.profile_id))
    .filter(Boolean)
    .map((profile) => fullName(profile?.last_name, profile?.first_name));

  return (
    <main className={styles.page}>
      <div className={styles.backRow}>
        <Link href="/project" className={styles.backLink}>
          ← 戻る
        </Link>
      </div>

      <div className={styles.topBorder} />

      <div className={styles.headerRow}>
        <div>
          <h1 className={styles.pageTitle}>{project.name}</h1>
          <div className={styles.metaRow}>
            <span>登録日: {formatDate(project.created_at)}</span>
            <span>最終更新日: {formatDate(project.updated_at)}</span>
          </div>
        </div>

        <ProjectDetailActions projectId={project.id} />
      </div>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>基本情報</h2>
        <div className={styles.infoTable}>
          <div className={styles.labelCell}>案件期間</div>
          <div className={styles.valueCell}>{formatPeriod(project.start_date, project.end_date)}</div>

          <div className={styles.labelCell}>クライアント</div>
          <div className={styles.valueCell}>{client?.name ?? "-"}</div>

          <div className={styles.labelCell}>状態</div>
          <div className={styles.valueCell}>{STATUS_LABELS[project.status ?? 0] ?? "-"}</div>

          <div className={styles.labelCell}>案件責任者</div>
          <div className={styles.valueCell}>{fullName(projectManager?.last_name, projectManager?.first_name)}</div>

          <div className={styles.labelCell}>案件メンバー</div>
          <div className={styles.valueCell}>{memberNames.length > 0 ? memberNames.join("、") : "-"}</div>

          <div className={styles.labelCell}>PM按分率</div>
          <div className={styles.valueCell}>{formatPercent(project.pm_revenue_share)}</div>

          <div className={styles.labelCell}>メンバー按分率</div>
          <div className={styles.valueCell}>{formatPercent(project.member_revenue_share)}</div>
        </div>
      </section>

      <section className={styles.gridSection}>
        <div>
          <h2 className={styles.sectionTitle}>請求情報</h2>
          <div className={styles.infoTable}>
            <div className={styles.labelCell}>請求額</div>
            <div className={styles.valueCell}>{formatYen(project.invoice_amount)}</div>

            <div className={styles.labelCell}>請求月</div>
            <div className={styles.valueCell}>{formatMonth(project.invoice_month)}</div>

            <div className={styles.labelCell}>支払期日</div>
            <div className={styles.valueCell}>{formatDate(project.payment_due_date)}</div>

            <div className={styles.labelCell}>見積書</div>
            <div className={styles.valueCell}>
              {isUrl(project.estimate) ? (
                <a href={project.estimate!} target="_blank" rel="noreferrer" className={styles.docLink}>
                  見積書リンク
                </a>
              ) : (
                "-"
              )}
            </div>

            <div className={styles.labelCell}>請求書</div>
            <div className={styles.valueCell}>
              {isUrl(project.invoice) ? (
                <a href={project.invoice!} target="_blank" rel="noreferrer" className={styles.docLink}>
                  請求書リンク
                </a>
              ) : (
                "-"
              )}
            </div>
          </div>
        </div>
      </section>

      <PlannedCostSection
        projectId={project.id}
        startDate={project.start_date}
        endDate={project.end_date}
        initialCosts={(plannedCosts ?? []) as ProjectPlannedCost[]}
        partners={partners ?? []}
        jobs={jobs ?? []}
        profiles={allProfiles}
      />

      <ActualCostSection
        projectId={project.id}
        startDate={project.start_date}
        endDate={project.end_date}
        initialCosts={(actualCosts ?? []) as ProjectActualCost[]}
        reports={(reports ?? []) as ReportRow[]}
        partners={partners ?? []}
        profiles={allProfiles}
      />
    </main>
  );
}
