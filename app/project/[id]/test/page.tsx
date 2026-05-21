import { redirect } from "next/navigation";
import { createClient } from "@/app/utils/supabase/server";
import ProjectDetailTestClient from "./project-detail-test-client";

type PageProps = {
  params: Promise<{ id: string }>;
};

type ProjectRow = {
  id: string;
  project_no: number | null;
  name: string;
  client_id: string | null;
  start_date: string | null;
  end_date: string | null;
  project_manager_id: string | null;
  pm_revenue_share: number | null;
  member_revenue_share: number | null;
  status: number | null;
  invoice_amount: number | null;
  invoice_month: string | null;
  payment_due_date: string | null;
  estimate: string | null;
  invoice: string | null;
  created_at: string | null;
  updated_at: string | null;
  updated_by: string | null;
};

type ClientRow = {
  id: string;
  name: string;
};

type ProfileRow = {
  id: string;
  last_name: string | null;
  first_name: string | null;
  email: string | null;
};

type ProjectMemberRow = {
  profile_id: string;
};

type ProfileJobRow = {
  profile_id: string;
  job_id: string;
};

type JobRow = {
  id: string;
  name: string;
};

type PlannedCostRow = {
  id: string;
  category: number | null;
  amount: number | null;
  operating_person_months: number | string | null;
};

type ActualCostRow = {
  id: string;
  category: number | null;
  amount: number | string | null;
};

type ReportRow = {
  id: string;
  profile_id: string;
  work_date: string;
  hours: number | string | null;
};

type SavedRecognitionRow = {
  profile_id: string;
  target_year_month: string;
  amount: number | null;
};

type SalesRecognitionRow = {
  profileId: string;
  roleLabel: string;
  memberName: string;
  monthlyAmounts: number[];
};

type SavedRecognitionCell = {
  profileId: string;
  targetYearMonth: string;
  amount: number;
};

const STATUS_LABELS: Record<number, string> = {
  0: "保留",
  1: "営業中（高）",
  2: "営業中（中）",
  3: "営業中（低）",
  4: "営業中（最終調整）",
  5: "確定前",
  6: "確定",
  7: "進行中",
  8: "完了",
  9: "滞留",
  10: "プリセールス(無償)",
  11: "社内案件(無償)",
};

const LABOR_COST_PER_PERSON_DAY = 35000;
const HOURS_PER_PERSON_DAY = 8;

function toSafeNumber(value: number | string | null | undefined): number {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num : 0;
}

function sumNumbers(values: ReadonlyArray<number | string | null | undefined>): number {
  return values.reduce<number>((sum, value) => sum + toSafeNumber(value), 0);
}

function fullName(profile?: ProfileRow | null | undefined): string {
  if (!profile) return "-";
  const name = `${profile.last_name ?? ""}${profile.first_name ?? ""}`.trim();
  return name || profile.email || "-";
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${y}/${m}/${d} ${hh}:${mm}`;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "-";
  return value.replaceAll("-", "/");
}

function formatMonth(value: string | null | undefined): string {
  if (!value) return "-";
  return value.slice(0, 7).replace("-", "/");
}

function formatPeriod(
  startDate: string | null | undefined,
  endDate: string | null | undefined
): string {
  if (!startDate && !endDate) return "-";
  const start = startDate ? startDate.slice(0, 7).replace("-", "/") : "";
  const end = endDate ? endDate.slice(0, 7).replace("-", "/") : "";
  if (start && end) return `${start}〜${end}`;
  return start || end || "-";
}

function getMonthKeysBetween(
  startDate: string | null | undefined,
  endDate: string | null | undefined
): string[] {
  if (!startDate || !endDate) return [];

  const start = new Date(`${startDate.slice(0, 7)}-01T00:00:00`);
  const end = new Date(`${endDate.slice(0, 7)}-01T00:00:00`);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
    return [];
  }

  const result: string[] = [];
  let current = new Date(start.getFullYear(), start.getMonth(), 1);

  while (current <= end) {
    const y = current.getFullYear();
    const m = String(current.getMonth() + 1).padStart(2, "0");
    result.push(`${y}-${m}-01`);
    current = new Date(current.getFullYear(), current.getMonth() + 1, 1);
  }

  return result;
}

function diffDaysFromToday(targetDate: string | null | undefined): number | null {
  if (!targetDate) return null;
  const today = new Date();
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const target = new Date(`${targetDate}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  const diffMs = target.getTime() - base.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

export default async function ProjectDetailTestPage(props: PageProps) {
  const { id } = await props.params;

  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();

  if (authError || !authData.user) {
    redirect("/login");
  }

  const { data: project, error: projectError } = await supabase
    .from("project")
    .select(
      "id,project_no,name,client_id,start_date,end_date,project_manager_id,pm_revenue_share,member_revenue_share,status,invoice_amount,invoice_month,payment_due_date,estimate,invoice,created_at,updated_at,updated_by"
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
    { data: profileJobs, error: profileJobsError },
    { data: jobs, error: jobsError },
    { data: plannedCosts, error: plannedCostsError },
    { data: actualCosts, error: actualCostsError },
    { data: reports, error: reportsError },
    { data: savedRecognitions, error: savedRecognitionsError },
  ] = await Promise.all([
    supabase.from("client").select("id,name").eq("id", project.client_id).maybeSingle(),
    supabase.from("project_member").select("profile_id").eq("project_id", id),
    supabase
      .from("profiles_2")
      .select("id,last_name,first_name,email")
      .order("created_at", { ascending: true }),
    supabase.from("profile_job").select("profile_id,job_id"),
    supabase.from("job").select("id,name"),
    supabase
      .from("project_planned_cost")
      .select("id,category,amount,operating_person_months")
      .eq("project_id", id),
    supabase
      .from("project_actual_cost")
      .select("id,category,amount")
      .eq("project_id", id),
    supabase
      .from("report")
      .select("id,profile_id,work_date,hours")
      .eq("project_id", id),
    supabase
      .from("project_sales_recognition")
      .select("profile_id,target_year_month,amount")
      .eq("project_id", id),
  ]);

  if (membersError) throw new Error(membersError.message);
  if (profilesError) throw new Error(profilesError.message);
  if (profileJobsError) throw new Error(profileJobsError.message);
  if (jobsError) throw new Error(jobsError.message);
  if (plannedCostsError) throw new Error(plannedCostsError.message);
  if (actualCostsError) throw new Error(actualCostsError.message);
  if (reportsError) throw new Error(reportsError.message);
  if (savedRecognitionsError) throw new Error(savedRecognitionsError.message);

  const projectRow = project as ProjectRow;
  const clientRow = (client ?? null) as ClientRow | null;
  const allProfiles = (profiles ?? []) as ProfileRow[];
  const memberRows = (members ?? []) as ProjectMemberRow[];
  const profileJobRows = (profileJobs ?? []) as ProfileJobRow[];
  const jobRows = (jobs ?? []) as JobRow[];
  const plannedCostRows = (plannedCosts ?? []) as PlannedCostRow[];
  const actualCostRows = (actualCosts ?? []) as ActualCostRow[];
  const reportRows = (reports ?? []) as ReportRow[];
  const savedRecognitionRows = (savedRecognitions ?? []) as SavedRecognitionRow[];

  const profileMap = new Map<string, ProfileRow>(allProfiles.map((profile) => [profile.id, profile]));
  const jobMap = new Map<string, string>(jobRows.map((job) => [job.id, job.name]));
  const profileJobMap = new Map<string, string>();

  for (const row of profileJobRows) {
    if (!profileJobMap.has(row.profile_id)) {
      profileJobMap.set(row.profile_id, row.job_id);
    }
  }

  const projectManagerProfile: ProfileRow | null = projectRow.project_manager_id
    ? profileMap.get(projectRow.project_manager_id) ?? null
    : null;

  const projectMemberIds: string[] = memberRows
    .map((row) => row.profile_id)
    .filter((profileId) => profileId !== projectRow.project_manager_id);

  const projectMemberProfiles: ProfileRow[] = projectMemberIds
    .map((profileId) => profileMap.get(profileId))
    .filter((profile): profile is ProfileRow => !!profile);

  const memberShareCount: number = projectMemberIds.length;
  const perMemberSharePercent: number =
    memberShareCount > 0 ? toSafeNumber(projectRow.member_revenue_share) / memberShareCount : 0;

  const plannedLabor: number = sumNumbers(
    plannedCostRows.filter((row) => row.category === 2).map((row) => row.amount)
  );
  const plannedExpense: number = sumNumbers(
    plannedCostRows.filter((row) => row.category === 0).map((row) => row.amount)
  );
  const plannedExternal: number = sumNumbers(
    plannedCostRows.filter((row) => row.category === 1).map((row) => row.amount)
  );
  const plannedTotal: number = plannedLabor + plannedExpense + plannedExternal;

  const actualExpense: number = sumNumbers(
    actualCostRows.filter((row) => row.category === 0).map((row) => row.amount)
  );
  const actualExternal: number = sumNumbers(
    actualCostRows.filter((row) => row.category === 1).map((row) => row.amount)
  );
  const totalReportHours: number = sumNumbers(reportRows.map((row) => row.hours));
  const actualPersonDays: number = totalReportHours / HOURS_PER_PERSON_DAY;
  const actualLabor: number = actualPersonDays * LABOR_COST_PER_PERSON_DAY;
  const actualTotal: number = actualLabor + actualExpense + actualExternal;

  const invoiceAmount: number = toSafeNumber(projectRow.invoice_amount);
  const plannedGrossProfit: number = invoiceAmount - plannedTotal;
  const actualGrossProfit: number = invoiceAmount - actualTotal;
  const plannedGrossProfitRate: number =
    invoiceAmount > 0 ? (plannedGrossProfit / invoiceAmount) * 100 : 0;
  const actualGrossProfitRate: number =
    invoiceAmount > 0 ? (actualGrossProfit / invoiceAmount) * 100 : 0;

  const overdueDays: number | null = diffDaysFromToday(projectRow.payment_due_date);
  const overdueLabel =
    overdueDays == null
      ? "-"
      : overdueDays < 0
        ? `${Math.abs(overdueDays)}日超過`
        : overdueDays === 0
          ? "本日期日"
          : `残${overdueDays}日`;

  const autoSalesMonths = getMonthKeysBetween(projectRow.start_date, projectRow.end_date);
  const salesMonths =
    autoSalesMonths.length > 0
      ? autoSalesMonths
      : projectRow.invoice_month
        ? [projectRow.invoice_month]
        : [];
  const monthCount = salesMonths.length > 0 ? salesMonths.length : 1;

  const pmTotalShareAmount: number =
    invoiceAmount * (toSafeNumber(projectRow.pm_revenue_share) / 100);
  const memberTotalShareAmount: number =
    invoiceAmount * (toSafeNumber(projectRow.member_revenue_share) / 100);
  const perMemberTotalShareAmount: number =
    memberShareCount > 0 ? memberTotalShareAmount / memberShareCount : 0;

  const autoRows: SalesRecognitionRow[] = [];

  if (projectManagerProfile) {
    const autoMonthlyAmount = pmTotalShareAmount / monthCount;
    autoRows.push({
      profileId: projectManagerProfile.id,
      roleLabel: "PM",
      memberName: fullName(projectManagerProfile),
      monthlyAmounts: salesMonths.map(() => autoMonthlyAmount),
    });
  }

  for (const memberProfile of projectMemberProfiles) {
    const jobName = jobMap.get(profileJobMap.get(memberProfile.id) ?? "") ?? "メンバー";
    const autoMonthlyAmount = perMemberTotalShareAmount / monthCount;

    autoRows.push({
      profileId: memberProfile.id,
      roleLabel: jobName,
      memberName: fullName(memberProfile),
      monthlyAmounts: salesMonths.map(() => autoMonthlyAmount),
    });
  }

  const savedCells: SavedRecognitionCell[] = savedRecognitionRows.map((row) => ({
    profileId: row.profile_id,
    targetYearMonth: row.target_year_month,
    amount: toSafeNumber(row.amount),
  }));

  const savedAmountMap = new Map<string, number>();
  for (const cell of savedCells) {
    savedAmountMap.set(`${cell.profileId}_${cell.targetYearMonth}`, cell.amount);
  }

  const currentRows: SalesRecognitionRow[] = autoRows.map((row) => ({
    ...row,
    monthlyAmounts: row.monthlyAmounts.map((amount, monthIndex) => {
      const monthKey = salesMonths[monthIndex];
      const savedAmount = monthKey ? savedAmountMap.get(`${row.profileId}_${monthKey}`) : undefined;
      return savedAmount ?? amount;
    }),
  }));

  const registrationProfile = projectRow.updated_by
    ? profileMap.get(projectRow.updated_by) ?? null
    : null;
  const updaterProfile = projectRow.updated_by
    ? profileMap.get(projectRow.updated_by) ?? null
    : null;

  return (
    <ProjectDetailTestClient
      initialData={{
        projectId: projectRow.id,
        header: {
          title: projectRow.name,
          projectNo: projectRow.project_no,
          createdByName: fullName(registrationProfile),
          createdAt: formatDateTime(projectRow.created_at),
          updatedByName: fullName(updaterProfile),
          updatedAt: formatDateTime(projectRow.updated_at),
          statusLabel: STATUS_LABELS[projectRow.status ?? 0] ?? "-",
        },
        summary: {
          invoiceAmount,
          invoiceMonthLabel: formatMonth(projectRow.invoice_month),
          plannedGrossProfit,
          plannedGrossProfitRate,
          actualGrossProfit,
          actualGrossProfitRate,
          paymentDueDateLabel: formatDate(projectRow.payment_due_date),
          overdueLabel,
        },
        basicInfo: {
          periodLabel: formatPeriod(projectRow.start_date, projectRow.end_date),
          clientName: clientRow?.name ?? "-",
          pmLabel: projectManagerProfile
            ? `${fullName(projectManagerProfile)}（${toSafeNumber(projectRow.pm_revenue_share)}%）`
            : "-",
          directorLabel:
            projectMemberProfiles.length > 0
              ? projectMemberProfiles
                  .map((profile) => `${fullName(profile)}（${perMemberSharePercent}%）`)
                  .join("、")
              : "-",
          invoiceUrl: projectRow.invoice,
        },
        profitSummary: {
          plannedTotal,
          plannedLabor,
          plannedExpense,
          plannedExternal,
          actualTotal,
          actualLabor,
          actualExpense,
          actualExternal,
        },
        sales: {
          monthKeys: salesMonths,
          autoRows,
          currentRows,
          savedCells,
          invoiceAmount,
        },
      }}
    />
  );
}