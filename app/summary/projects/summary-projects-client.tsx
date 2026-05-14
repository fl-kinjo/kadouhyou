"use client";

import Link from "next/link";
import { useMemo, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/app/utils/supabase/client";
import styles from "./summary-projects-client.module.css";

type JobRow = {
  id: string;
  name: string;
  monthly_unit_price: number | null;
};

type ProfileRow = {
  id: string;
  last_name: string | null;
  first_name: string | null;
  email: string | null;
};

type ProfileJobRow = {
  profile_id: string;
  job_id: string;
};

type ProjectRow = {
  id: string;
  name: string;
  invoice_amount: number | null;
  invoice_month: string | null;
  member_revenue_share: number | null;
  pm_revenue_share: number | null;
  project_manager_id: string | null;
  status: number | null;
  start_date: string | null;
  end_date: string | null;
};

type ProjectMemberRow = {
  profile_id: string;
  project_id: string;
};

type ReportRow = {
  profile_id: string;
  project_id: string;
  work_date: string;
  hours: number | string | null;
};

type Mode = "production" | "working" | "billing";
type Metric = "sales" | "paid" | "free";

type DetailRow = {
  projectId: string;
  projectName: string;
  amount: number;
  invoiceMonth: string;
  period: string;
  members: string[];
};

const PERSON_MONTH_HOURS = 160;

function getFiscalMonths(year: number) {
  const result: { key: string; label: string }[] = [];
  for (let month = 6; month <= 12; month += 1) {
    result.push({
      key: `${year}-${String(month).padStart(2, "0")}-01`,
      label: `${year}/${month}`,
    });
  }
  for (let month = 1; month <= 5; month += 1) {
    result.push({
      key: `${year + 1}-${String(month).padStart(2, "0")}-01`,
      label: `${year + 1}/${month}`,
    });
  }
  return result;
}

function getMonthKeyFromDate(dateText: string) {
  return `${dateText.slice(0, 7)}-01`;
}

function getMonthKeysBetween(startDate: string | null, endDate: string | null) {
  if (!startDate || !endDate) return [] as string[];

  const start = new Date(`${startDate.slice(0, 7)}-01T00:00:00`);
  const end = new Date(`${endDate.slice(0, 7)}-01T00:00:00`);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
    return [];
  }

  const result: string[] = [];
  let current = new Date(start.getFullYear(), start.getMonth(), 1);

  while (current <= end) {
    const year = current.getFullYear();
    const month = String(current.getMonth() + 1).padStart(2, "0");
    result.push(`${year}-${month}-01`);
    current = new Date(current.getFullYear(), current.getMonth() + 1, 1);
  }

  return result;
}

function toNumber(value: number | string | null | undefined) {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num : 0;
}

function fullName(profile?: ProfileRow | null) {
  if (!profile) return "";
  const name = `${profile.last_name ?? ""}${profile.first_name ?? ""}`.trim();
  return name || profile.email || "";
}

function formatCurrency(value: number) {
  return `¥${Math.round(value).toLocaleString("ja-JP")}`;
}

function formatMonthLabel(monthKey: string, fiscalMonths: { key: string; label: string }[]) {
  if (monthKey === "annual") return "年間合計";
  return fiscalMonths.find((item) => item.key === monthKey)?.label ?? monthKey;
}

function formatPeriod(startDate: string | null, endDate: string | null) {
  if (!startDate && !endDate) return "-";
  if (startDate && endDate) return `${startDate.slice(0, 7).replace("-", "/")} 〜 ${endDate.slice(0, 7).replace("-", "/")}`;
  return (startDate ?? endDate ?? "-").slice(0, 7).replace("-", "/");
}

export default function SummaryProjectsClient() {
  const supabase = createClient();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [profileJobs, setProfileJobs] = useState<ProfileJobRow[]>([]);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [projectMembers, setProjectMembers] = useState<ProjectMemberRow[]>([]);
  const [reports, setReports] = useState<ReportRow[]>([]);

  const year = Number(searchParams.get("year") ?? new Date().getFullYear());
  const jobId = searchParams.get("jobId") ?? "";
  const mode = (searchParams.get("mode") ?? "production") as Mode;
  const metric = (searchParams.get("metric") ?? "sales") as Metric;
  const month = searchParams.get("month") ?? "annual";
  const profileId = searchParams.get("profileId") ?? "";

  const fiscalMonths = useMemo(() => getFiscalMonths(year), [year]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setErrorMsg("");

      try {
        const fromMonth = fiscalMonths[0]?.key;
        const toMonth = fiscalMonths[fiscalMonths.length - 1]?.key;
        const fromDate = fromMonth;
        const toDate = toMonth ? `${toMonth.slice(0, 7)}-31` : undefined;

        const [
          jobsRes,
          profilesRes,
          profileJobsRes,
          projectsRes,
          projectMembersRes,
          reportsRes,
        ] = await Promise.all([
          supabase.from("job").select("id,name,monthly_unit_price"),
          supabase.from("profiles_2").select("id,last_name,first_name,email"),
          supabase.from("profile_job").select("profile_id,job_id"),
          supabase
            .from("project")
            .select("id,name,invoice_amount,invoice_month,member_revenue_share,pm_revenue_share,project_manager_id,status,start_date,end_date"),
          supabase.from("project_member").select("profile_id,project_id"),
          supabase
            .from("report")
            .select("profile_id,project_id,work_date,hours")
            .gte("work_date", fromDate)
            .lte("work_date", toDate),
        ]);

        if (jobsRes.error) throw new Error(jobsRes.error.message);
        if (profilesRes.error) throw new Error(profilesRes.error.message);
        if (profileJobsRes.error) throw new Error(profileJobsRes.error.message);
        if (projectsRes.error) throw new Error(projectsRes.error.message);
        if (projectMembersRes.error) throw new Error(projectMembersRes.error.message);
        if (reportsRes.error) throw new Error(reportsRes.error.message);

        setJobs((jobsRes.data ?? []) as JobRow[]);
        setProfiles((profilesRes.data ?? []) as ProfileRow[]);
        setProfileJobs((profileJobsRes.data ?? []) as ProfileJobRow[]);
        setProjects((projectsRes.data ?? []) as ProjectRow[]);
        setProjectMembers((projectMembersRes.data ?? []) as ProjectMemberRow[]);
        setReports((reportsRes.data ?? []) as ReportRow[]);
      } catch (error) {
        setErrorMsg(error instanceof Error ? error.message : String(error));
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [fiscalMonths, supabase]);

  const selectedJob = useMemo(() => jobs.find((job) => job.id === jobId) ?? null, [jobs, jobId]);
  const selectedJobLabel = selectedJob?.name ?? "-";
  const monthlyUnitPrice = Number(selectedJob?.monthly_unit_price ?? 0);
  const hourlyUnitPrice = monthlyUnitPrice > 0 ? monthlyUnitPrice / PERSON_MONTH_HOURS : 0;

  const targetMonthKeys = useMemo(() => {
    if (month === "annual") {
      return new Set(fiscalMonths.map((item) => item.key));
    }
    return new Set([month]);
  }, [fiscalMonths, month]);

  const jobProfileIds = useMemo(
    () => profileJobs.filter((row) => row.job_id === jobId).map((row) => row.profile_id),
    [profileJobs, jobId]
  );

  const selectedProfileIds = useMemo(() => {
    if (profileId) return new Set([profileId]);
    return new Set(jobProfileIds);
  }, [jobProfileIds, profileId]);

  const profileMap = useMemo(() => new Map(profiles.map((profile) => [profile.id, profile])), [profiles]);

  const memberCountsByProject = useMemo(() => {
    const map = new Map<string, number>();
    for (const relation of projectMembers) {
      map.set(relation.project_id, (map.get(relation.project_id) ?? 0) + 1);
    }
    return map;
  }, [projectMembers]);

  const memberProjectMap = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const relation of projectMembers) {
      if (!map.has(relation.profile_id)) {
        map.set(relation.profile_id, new Set());
      }
      map.get(relation.profile_id)!.add(relation.project_id);
    }
    return map;
  }, [projectMembers]);

  const detailRows = useMemo<DetailRow[]>(() => {
    const map = new Map<
      string,
      {
        projectId: string;
        projectName: string;
        amount: number;
        invoiceMonth: string;
        period: string;
        members: Set<string>;
      }
    >();

    const append = (project: ProjectRow, amount: number, contributorProfileId: string) => {
      if (amount === 0) return;

      const current = map.get(project.id);
      if (!current) {
        map.set(project.id, {
          projectId: project.id,
          projectName: project.name,
          amount,
          invoiceMonth: project.invoice_month ? project.invoice_month.slice(0, 7).replace("-", "/") : "-",
          period: formatPeriod(project.start_date, project.end_date),
          members: new Set([fullName(profileMap.get(contributorProfileId))]),
        });
      } else {
        current.amount += amount;
        current.members.add(fullName(profileMap.get(contributorProfileId)));
      }
    };

    if (mode === "production") {
      const projectMap = new Map(projects.map((project) => [project.id, project]));

      for (const report of reports) {
        if (!selectedProfileIds.has(report.profile_id)) continue;

        const monthKey = getMonthKeyFromDate(report.work_date);
        if (!targetMonthKeys.has(monthKey)) continue;

        const project = projectMap.get(report.project_id);
        if (!project) continue;

        const isFree = project.status === 7 || project.status === 8;
        if (metric === "paid" && isFree) continue;
        if (metric === "free" && !isFree) continue;

        const amount = toNumber(report.hours) * hourlyUnitPrice;
        append(project, amount, report.profile_id);
      }
    }

    if (mode === "billing") {
      for (const project of projects) {
        if (!project.invoice_month || !targetMonthKeys.has(project.invoice_month)) continue;

        const memberCountForProject = memberCountsByProject.get(project.id) ?? 1;
        const perMemberAmount =
          memberCountForProject > 0
            ? (toNumber(project.invoice_amount) * (toNumber(project.member_revenue_share) / 100)) / memberCountForProject
            : 0;
        const pmAmount = toNumber(project.invoice_amount) * (toNumber(project.pm_revenue_share) / 100);

        for (const selectedProfileId of selectedProfileIds) {
          const memberProjects = memberProjectMap.get(selectedProfileId) ?? new Set<string>();
          let amount = 0;

          if (project.project_manager_id === selectedProfileId) {
            amount += pmAmount;
          }
          if (memberProjects.has(project.id)) {
            amount += perMemberAmount;
          }

          append(project, amount, selectedProfileId);
        }
      }
    }

    if (mode === "working") {
      for (const project of projects) {
        const matchedMonths = getMonthKeysBetween(project.start_date, project.end_date).filter((monthKey) =>
          targetMonthKeys.has(monthKey)
        );
        if (matchedMonths.length === 0) continue;

        const memberCountForProject = memberCountsByProject.get(project.id) ?? 0;
        const perMemberTotal =
          memberCountForProject > 0
            ? (toNumber(project.invoice_amount) * (toNumber(project.member_revenue_share) / 100)) / memberCountForProject
            : 0;
        const pmTotal = toNumber(project.invoice_amount) * (toNumber(project.pm_revenue_share) / 100);

        const perMemberMonthlyAmount = matchedMonths.length > 0
          ? perMemberTotal / getMonthKeysBetween(project.start_date, project.end_date).length
          : 0;
        const pmMonthlyAmount = matchedMonths.length > 0
          ? pmTotal / getMonthKeysBetween(project.start_date, project.end_date).length
          : 0;

        for (const selectedProfileId of selectedProfileIds) {
          const memberProjects = memberProjectMap.get(selectedProfileId) ?? new Set<string>();
          const isPm = project.project_manager_id === selectedProfileId;
          const isMember = memberProjects.has(project.id);

          if (!isPm && !isMember) continue;

          let amount = 0;
          if (isPm) amount += pmMonthlyAmount * matchedMonths.length;
          if (isMember) amount += perMemberMonthlyAmount * matchedMonths.length;

          append(project, amount, selectedProfileId);
        }
      }
    }

    return Array.from(map.values())
      .map((row) => ({
        projectId: row.projectId,
        projectName: row.projectName,
        amount: row.amount,
        invoiceMonth: row.invoiceMonth,
        period: row.period,
        members: Array.from(row.members).filter(Boolean).sort((a, b) => a.localeCompare(b, "ja")),
      }))
      .sort((a, b) => b.amount - a.amount);
  }, [
    hourlyUnitPrice,
    memberCountsByProject,
    memberProjectMap,
    metric,
    mode,
    profileMap,
    profiles,
    projects,
    reports,
    selectedProfileIds,
    targetMonthKeys,
  ]);

  const title = useMemo(() => {
    const modeLabel =
      mode === "production" ? "生産稼働率" : mode === "working" ? "稼働売上" : "請求売上";

    const metricLabel =
      metric === "paid" ? "有償" : metric === "free" ? "無償" : "売上 / 金額";

    const profileLabel = profileId ? fullName(profileMap.get(profileId)) : "チーム全体";

    return `${selectedJobLabel} / ${modeLabel} / ${metricLabel} / ${profileLabel} / ${formatMonthLabel(month, fiscalMonths)}`;
  }, [fiscalMonths, metric, mode, month, profileId, profileMap, selectedJobLabel]);

  return (
    <main className={styles.page}>
      <div className={styles.headerRow}>
        <div>
          <h1 className={styles.pageTitle}>関連案件一覧</h1>
          <p className={styles.lead}>{title}</p>
        </div>
        <button type="button" className={styles.backButton} onClick={() => router.back()}>
          戻る
        </button>
      </div>

      {errorMsg && <p className={styles.errorText}>{errorMsg}</p>}

      <div className={styles.tableFrame}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>案件名</th>
              <th>対象額</th>
              <th>請求月</th>
              <th>期間</th>
              <th>対象者</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6}>読み込み中...</td>
              </tr>
            ) : detailRows.length === 0 ? (
              <tr>
                <td colSpan={6}>対象案件がありません。</td>
              </tr>
            ) : (
              detailRows.map((row) => (
                <tr key={row.projectId}>
                  <td>{row.projectName}</td>
                  <td>{formatCurrency(row.amount)}</td>
                  <td>{row.invoiceMonth}</td>
                  <td>{row.period}</td>
                  <td>{row.members.join("、") || "-"}</td>
                  <td>
                    <Link href={`/project/${row.projectId}`} className={styles.detailLink}>
                      案件詳細
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}