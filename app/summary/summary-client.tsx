"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/app/utils/supabase/client";
import styles from "./summary-client.module.css";

type JobRow = {
  id: string;
  name: string;
  monthly_unit_price: number | null;
  created_at: string | null;
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

type ManMonthRow = {
  profile_id: string;
  target_year_month: string;
  operating_person_months: number | string;
};

type ReportRow = {
  profile_id: string;
  project_id: string;
  work_date: string;
  hours: number | string | null;
};

type IndividualRow = {
  profileId: string;
  name: string;
  paidMonths: number[];
  freeMonths: number[];
  paidTotal: number;
  freeTotal: number;
  months: number[];
  total: number;
  rates: number[];
  avgRate: number;
};

type DirectorTab = "working" | "billing" | "production";
type DetailMode = "production" | "working" | "billing";
type DetailMetric = "sales" | "paid" | "free";

const JOB_DISPLAY_ORDER = [
  "ディレクター",
  "ディレクター（新規事業部）",
  "ディレクター(オンサイト)",
  "デザイナー",
  "エンジニア",
] as const;

const DIRECTOR_JOB_NAMES = new Set([
  "ディレクター",
  "ディレクター（新規事業部）",
  "ディレクター(オンサイト)",
]);

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

const formatPercent = (value: number) => `${value.toFixed(2)}%`;
const formatCurrency = (value: number) => `¥${value.toLocaleString("ja-JP")}`;
const average = (values: number[]) =>
  values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;

function toSalesGrade(rate: number) {
  if (rate >= 1.1) return "S";
  if (rate >= 1.0) return "A";
  if (rate >= 0.9) return "B";
  if (rate >= 0.8) return "C";
  if (rate >= 0.7) return "D";
  return "E";
}

function toProductionGrade(rate: number) {
  if (rate >= 1.0) return "S";
  if (rate >= 0.9) return "A";
  if (rate >= 0.8) return "B";
  if (rate >= 0.7) return "C";
  if (rate >= 0.6) return "D";
  return "E";
}

function fullName(lastName?: string | null, firstName?: string | null, email?: string | null) {
  const name = `${lastName ?? ""}${firstName ?? ""}`.trim();
  return name || email || "";
}

function toNumber(value: number | string | null | undefined) {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num : 0;
}

function buildSummaryProjectHref(params: {
  jobId: string;
  year: number;
  mode: DetailMode;
  metric: DetailMetric;
  month: string;
  profileId?: string;
}) {
  const search = new URLSearchParams();
  search.set("jobId", params.jobId);
  search.set("year", String(params.year));
  search.set("mode", params.mode);
  search.set("metric", params.metric);
  search.set("month", params.month);

  if (params.profileId) {
    search.set("profileId", params.profileId);
  }

  return `/summary/projects?${search.toString()}`;
}

export default function SummaryClient() {
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [profileJobs, setProfileJobs] = useState<ProfileJobRow[]>([]);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [projectMembers, setProjectMembers] = useState<ProjectMemberRow[]>([]);
  const [manMonths, setManMonths] = useState<ManMonthRow[]>([]);
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [selectedJobId, setSelectedJobId] = useState("");
  const [displayYear, setDisplayYear] = useState(new Date().getFullYear());
  const [directorTab, setDirectorTab] = useState<DirectorTab>("working");

  const fiscalMonths = useMemo(() => getFiscalMonths(displayYear), [displayYear]);

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
          manMonthsRes,
          reportsRes,
        ] = await Promise.all([
          supabase.from("job").select("id,name,monthly_unit_price,created_at").order("created_at", { ascending: true }),
          supabase.from("profiles_2").select("id,last_name,first_name,email").order("created_at", { ascending: true }),
          supabase.from("profile_job").select("profile_id,job_id"),
          supabase
            .from("project")
            .select("id,invoice_amount,invoice_month,member_revenue_share,pm_revenue_share,project_manager_id,status,start_date,end_date"),
          supabase.from("project_member").select("profile_id,project_id"),
          supabase
            .from("man_month")
            .select("profile_id,target_year_month,operating_person_months")
            .gte("target_year_month", fromMonth)
            .lte("target_year_month", toMonth),
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
        if (manMonthsRes.error) throw new Error(manMonthsRes.error.message);
        if (reportsRes.error) throw new Error(reportsRes.error.message);

        const orderMap = new Map<string, number>(JOB_DISPLAY_ORDER.map((name, index) => [name, index]));
        const nextJobs = [...((jobsRes.data ?? []) as JobRow[])].sort((a, b) => {
          const aOrder = orderMap.get(a.name);
          const bOrder = orderMap.get(b.name);

          const aRank = aOrder ?? Number.MAX_SAFE_INTEGER;
          const bRank = bOrder ?? Number.MAX_SAFE_INTEGER;

          if (aRank !== bRank) return aRank - bRank;

          if (aOrder == null && bOrder == null) {
            return String(a.created_at ?? "").localeCompare(String(b.created_at ?? ""), "ja");
          }

          return a.name.localeCompare(b.name, "ja");
        });

        setJobs(nextJobs);
        setProfiles((profilesRes.data ?? []) as ProfileRow[]);
        setProfileJobs((profileJobsRes.data ?? []) as ProfileJobRow[]);
        setProjects((projectsRes.data ?? []) as ProjectRow[]);
        setProjectMembers((projectMembersRes.data ?? []) as ProjectMemberRow[]);
        setManMonths((manMonthsRes.data ?? []) as ManMonthRow[]);
        setReports((reportsRes.data ?? []) as ReportRow[]);

        if (nextJobs.length > 0) {
          setSelectedJobId((current) => current || nextJobs[0].id);
        }
      } catch (error) {
        setErrorMsg(error instanceof Error ? error.message : String(error));
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [supabase, fiscalMonths]);

  const selectedJob = useMemo(() => jobs.find((job) => job.id === selectedJobId) ?? null, [jobs, selectedJobId]);
  const selectedJobLabel = selectedJob?.name ?? "";
  const monthlyUnitPrice = Number(selectedJob?.monthly_unit_price ?? 0);
  const hourlyUnitPrice = monthlyUnitPrice > 0 ? monthlyUnitPrice / PERSON_MONTH_HOURS : 0;

  const isDirectorJob = DIRECTOR_JOB_NAMES.has(selectedJobLabel);
  const isDirectorWorkingTab = isDirectorJob && directorTab === "working";
  const isDirectorBillingTab = isDirectorJob && directorTab === "billing";
  const isDirectorProductionTab = isDirectorJob && directorTab === "production";
  const isProductionMode = !isDirectorJob || isDirectorProductionTab;

  const jobProfileIds = useMemo(
    () => profileJobs.filter((row) => row.job_id === selectedJobId).map((row) => row.profile_id),
    [profileJobs, selectedJobId]
  );

  const selectedProfiles = useMemo(() => {
    const profileIdSet = new Set(jobProfileIds);
    return profiles
      .filter((profile) => profileIdSet.has(profile.id))
      .sort((a, b) =>
        fullName(a.last_name, a.first_name, a.email).localeCompare(
          fullName(b.last_name, b.first_name, b.email),
          "ja"
        )
      );
  }, [jobProfileIds, profiles]);

  const memberCount = jobProfileIds.length;

  const memberCountsByProject = useMemo(() => {
    const map = new Map<string, number>();
    for (const relation of projectMembers) {
      map.set(relation.project_id, (map.get(relation.project_id) ?? 0) + 1);
    }
    return map;
  }, [projectMembers]);

  const manMonthMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of manMonths) {
      map.set(`${row.profile_id}_${row.target_year_month}`, toNumber(row.operating_person_months) || 1);
    }
    return map;
  }, [manMonths]);

  const billingSalesIndividualRows = useMemo<IndividualRow[]>(() => {
    const projectMap = new Map(projects.map((project) => [project.id, project]));
    const memberProjectMap = new Map<string, string[]>();

    for (const relation of projectMembers) {
      if (!memberProjectMap.has(relation.profile_id)) {
        memberProjectMap.set(relation.profile_id, []);
      }
      memberProjectMap.get(relation.profile_id)!.push(relation.project_id);
    }

    return selectedProfiles.map((profile) => {
      const monthMap = new Map<string, number>();
      for (const month of fiscalMonths) monthMap.set(month.key, 0);

      const memberProjectIds = memberProjectMap.get(profile.id) ?? [];
      const handledPmProjects = new Set<string>();

      for (const projectId of memberProjectIds) {
        const project = projectMap.get(projectId);
        if (!project?.invoice_month || !monthMap.has(project.invoice_month)) continue;

        const invoiceAmount = toNumber(project.invoice_amount);
        const memberShareRate = toNumber(project.member_revenue_share) / 100;
        const memberCountForProject = memberCountsByProject.get(project.id) ?? 1;

        let amount =
          (invoiceAmount * memberShareRate) / (memberCountForProject > 0 ? memberCountForProject : 1);

        if (project.project_manager_id === profile.id) {
          amount += invoiceAmount * (toNumber(project.pm_revenue_share) / 100);
          handledPmProjects.add(project.id);
        }

        monthMap.set(project.invoice_month, (monthMap.get(project.invoice_month) ?? 0) + amount);
      }

      for (const project of projects) {
        if (
          project.project_manager_id !== profile.id ||
          handledPmProjects.has(project.id) ||
          !project.invoice_month ||
          !monthMap.has(project.invoice_month)
        ) {
          continue;
        }

        const amount = toNumber(project.invoice_amount) * (toNumber(project.pm_revenue_share) / 100);
        monthMap.set(project.invoice_month, (monthMap.get(project.invoice_month) ?? 0) + amount);
      }

      const months = fiscalMonths.map((month) => monthMap.get(month.key) ?? 0);
      const total = months.reduce((sum, value) => sum + value, 0);
      const rates = months.map((value) => (monthlyUnitPrice > 0 ? value / monthlyUnitPrice : 0));

      return {
        profileId: profile.id,
        name: fullName(profile.last_name, profile.first_name, profile.email),
        paidMonths: months,
        freeMonths: fiscalMonths.map(() => 0),
        paidTotal: total,
        freeTotal: 0,
        months,
        total,
        rates,
        avgRate: average(rates),
      };
    });
  }, [fiscalMonths, memberCountsByProject, monthlyUnitPrice, projectMembers, projects, selectedProfiles]);

  const workingSalesIndividualRows = useMemo<IndividualRow[]>(() => {
    const memberProjectMap = new Map<string, string[]>();

    for (const relation of projectMembers) {
      if (!memberProjectMap.has(relation.profile_id)) {
        memberProjectMap.set(relation.profile_id, []);
      }
      memberProjectMap.get(relation.profile_id)!.push(relation.project_id);
    }

    return selectedProfiles.map((profile) => {
      const monthMap = new Map<string, number>();
      for (const month of fiscalMonths) monthMap.set(month.key, 0);

      const memberProjectIds = new Set(memberProjectMap.get(profile.id) ?? []);

      for (const project of projects) {
        const projectMonthKeys = getMonthKeysBetween(project.start_date, project.end_date).filter((monthKey) =>
          monthMap.has(monthKey)
        );
        if (projectMonthKeys.length === 0) continue;

        const invoiceAmount = toNumber(project.invoice_amount);
        const pmAmountTotal = invoiceAmount * (toNumber(project.pm_revenue_share) / 100);
        const memberAmountTotal = invoiceAmount * (toNumber(project.member_revenue_share) / 100);

        const memberCountForProject = memberCountsByProject.get(project.id) ?? 0;
        const perMemberTotal = memberCountForProject > 0 ? memberAmountTotal / memberCountForProject : 0;

        const fullProjectMonthCount = getMonthKeysBetween(project.start_date, project.end_date).length;
        const pmMonthlyAmount = fullProjectMonthCount > 0 ? pmAmountTotal / fullProjectMonthCount : 0;
        const memberMonthlyAmount = fullProjectMonthCount > 0 ? perMemberTotal / fullProjectMonthCount : 0;

        const isPm = project.project_manager_id === profile.id;
        const isMember = memberProjectIds.has(project.id);

        if (!isPm && !isMember) continue;

        for (const monthKey of projectMonthKeys) {
          let addAmount = 0;
          if (isPm) addAmount += pmMonthlyAmount;
          if (isMember) addAmount += memberMonthlyAmount;
          monthMap.set(monthKey, (monthMap.get(monthKey) ?? 0) + addAmount);
        }
      }

      const months = fiscalMonths.map((month) => monthMap.get(month.key) ?? 0);
      const total = months.reduce((sum, value) => sum + value, 0);
      const rates = months.map((value) => (monthlyUnitPrice > 0 ? value / monthlyUnitPrice : 0));

      return {
        profileId: profile.id,
        name: fullName(profile.last_name, profile.first_name, profile.email),
        paidMonths: months,
        freeMonths: fiscalMonths.map(() => 0),
        paidTotal: total,
        freeTotal: 0,
        months,
        total,
        rates,
        avgRate: average(rates),
      };
    });
  }, [fiscalMonths, memberCountsByProject, monthlyUnitPrice, projectMembers, projects, selectedProfiles]);

  const productionIndividualRows = useMemo<IndividualRow[]>(() => {
    const projectMap = new Map(projects.map((project) => [project.id, project]));

    return selectedProfiles.map((profile) => {
      const paidMap = new Map<string, number>();
      const freeMap = new Map<string, number>();

      for (const month of fiscalMonths) {
        paidMap.set(month.key, 0);
        freeMap.set(month.key, 0);
      }

      for (const report of reports) {
        if (report.profile_id !== profile.id) continue;

        const monthKey = getMonthKeyFromDate(report.work_date);
        if (!paidMap.has(monthKey)) continue;

        const project = projectMap.get(report.project_id);
        if (!project) continue;

        const hours = toNumber(report.hours);
        const amount = hours * hourlyUnitPrice;

        if (project.status === 7 || project.status === 8) {
          freeMap.set(monthKey, (freeMap.get(monthKey) ?? 0) + amount);
        } else {
          paidMap.set(monthKey, (paidMap.get(monthKey) ?? 0) + amount);
        }
      }

      const paidMonths = fiscalMonths.map((month) => paidMap.get(month.key) ?? 0);
      const freeMonths = fiscalMonths.map((month) => freeMap.get(month.key) ?? 0);
      const months = paidMonths.map((value, index) => value + freeMonths[index]);
      const paidTotal = paidMonths.reduce((sum, value) => sum + value, 0);
      const freeTotal = freeMonths.reduce((sum, value) => sum + value, 0);
      const total = months.reduce((sum, value) => sum + value, 0);

      const rates = fiscalMonths.map((month, index) => {
        const personMonths = manMonthMap.get(`${profile.id}_${month.key}`) ?? 1;
        const denominator = monthlyUnitPrice * personMonths;
        return denominator > 0 ? months[index] / denominator : 0;
      });

      return {
        profileId: profile.id,
        name: fullName(profile.last_name, profile.first_name, profile.email),
        paidMonths,
        freeMonths,
        paidTotal,
        freeTotal,
        months,
        total,
        rates,
        avgRate: average(rates),
      };
    });
  }, [fiscalMonths, hourlyUnitPrice, manMonthMap, monthlyUnitPrice, projects, reports, selectedProfiles]);

  const individualRows = useMemo(() => {
    if (isProductionMode) return productionIndividualRows;
    if (isDirectorWorkingTab) return workingSalesIndividualRows;
    return billingSalesIndividualRows;
  }, [
    billingSalesIndividualRows,
    isDirectorWorkingTab,
    isProductionMode,
    productionIndividualRows,
    workingSalesIndividualRows,
  ]);

  const billingSalesByMonth = useMemo(() => {
    const map = new Map<string, number>();
    fiscalMonths.forEach((month, index) => {
      map.set(month.key, billingSalesIndividualRows.reduce((sum, row) => sum + (row.months[index] ?? 0), 0));
    });
    return map;
  }, [billingSalesIndividualRows, fiscalMonths]);

  const workingSalesByMonth = useMemo(() => {
    const map = new Map<string, number>();
    fiscalMonths.forEach((month, index) => {
      map.set(month.key, workingSalesIndividualRows.reduce((sum, row) => sum + (row.months[index] ?? 0), 0));
    });
    return map;
  }, [fiscalMonths, workingSalesIndividualRows]);

  const targetByMonth = useMemo(() => {
    const map = new Map<string, number>();
    const monthlyTarget = memberCount * monthlyUnitPrice;
    for (const month of fiscalMonths) {
      map.set(month.key, monthlyTarget);
    }
    return map;
  }, [fiscalMonths, memberCount, monthlyUnitPrice]);

  const billingSalesMonthlyRows = useMemo(
    () =>
      fiscalMonths.map((month) => {
        const sales = billingSalesByMonth.get(month.key) ?? 0;
        const target = targetByMonth.get(month.key) ?? 0;
        const rate = target > 0 ? sales / target : 0;

        return {
          key: month.key,
          sales,
          target,
          rate,
          grade: toSalesGrade(rate),
          diff: sales - target,
          paid: 0,
          free: 0,
        };
      }),
    [billingSalesByMonth, fiscalMonths, targetByMonth]
  );

  const workingSalesMonthlyRows = useMemo(
    () =>
      fiscalMonths.map((month) => {
        const sales = workingSalesByMonth.get(month.key) ?? 0;
        const target = targetByMonth.get(month.key) ?? 0;
        const rate = target > 0 ? sales / target : 0;

        return {
          key: month.key,
          sales,
          target,
          rate,
          grade: toSalesGrade(rate),
          diff: sales - target,
          paid: 0,
          free: 0,
        };
      }),
    [fiscalMonths, targetByMonth, workingSalesByMonth]
  );

  const productionMonthlyRows = useMemo(
    () =>
      fiscalMonths.map((month, index) => {
        const paid = productionIndividualRows.reduce((sum, row) => sum + (row.paidMonths[index] ?? 0), 0);
        const free = productionIndividualRows.reduce((sum, row) => sum + (row.freeMonths[index] ?? 0), 0);
        const sales = paid + free;

        let denominator = 0;
        for (const profileId of jobProfileIds) {
          const personMonths = manMonthMap.get(`${profileId}_${month.key}`) ?? 1;
          denominator += monthlyUnitPrice * personMonths;
        }

        const rate = denominator > 0 ? sales / denominator : 0;

        return {
          key: month.key,
          sales,
          target: 0,
          rate,
          grade: toProductionGrade(rate),
          diff: 0,
          paid,
          free,
        };
      }),
    [productionIndividualRows, fiscalMonths, jobProfileIds, manMonthMap, monthlyUnitPrice]
  );

  const monthlyRows = useMemo(() => {
    if (isProductionMode) return productionMonthlyRows;
    if (isDirectorWorkingTab) return workingSalesMonthlyRows;
    return billingSalesMonthlyRows;
  }, [
    billingSalesMonthlyRows,
    isDirectorWorkingTab,
    isProductionMode,
    productionMonthlyRows,
    workingSalesMonthlyRows,
  ]);

  const annualSales = monthlyRows.reduce((sum, row) => sum + row.sales, 0);
  const annualTarget = monthlyRows.reduce((sum, row) => sum + row.target, 0);
  const annualRate = average(monthlyRows.map((row) => row.rate));
  const annualDiff = monthlyRows.reduce((sum, row) => sum + row.diff, 0);
  const annualGrade = isProductionMode ? toProductionGrade(annualRate) : toSalesGrade(annualRate);
  const annualPaid = isProductionMode ? productionMonthlyRows.reduce((sum, row) => sum + row.paid, 0) : 0;
  const annualFree = isProductionMode ? productionMonthlyRows.reduce((sum, row) => sum + row.free, 0) : 0;

  const sectionTitle = useMemo(() => {
    if (!selectedJobLabel) return "職種サマリー";
    if (isProductionMode) return `${selectedJobLabel} 生産稼働率`;
    if (isDirectorWorkingTab) return `${selectedJobLabel} 稼働売上`;
    if (isDirectorBillingTab) return `${selectedJobLabel} 請求売上`;
    return `${selectedJobLabel} 請求売上`;
  }, [isDirectorBillingTab, isDirectorWorkingTab, isProductionMode, selectedJobLabel]);

  const firstSubTitle = isProductionMode
    ? "個人生産稼働率"
    : isDirectorWorkingTab
      ? "個人売上稼働率"
      : "個人請求売上稼働率";

  const secondSubTitle = isProductionMode
    ? "個人生産稼働額(有償)"
    : isDirectorWorkingTab
      ? "個人売上"
      : "個人請求売上";

  const currentDetailMode: DetailMode = isProductionMode
    ? "production"
    : isDirectorWorkingTab
      ? "working"
      : "billing";

  const renderAmountLink = (
    value: number,
    params: { metric: DetailMetric; month: string; profileId?: string }
  ) => {
    const rounded = Math.round(value);
    const text = formatCurrency(rounded);

    if (rounded === 0 || !selectedJobId) {
      return text;
    }

    const href = buildSummaryProjectHref({
      jobId: selectedJobId,
      year: displayYear,
      mode: currentDetailMode,
      metric: params.metric,
      month: params.month,
      profileId: params.profileId,
    });

    return (
      <Link href={href} className={styles.valueLink}>
        {text}
      </Link>
    );
  };

  return (
    <main className={styles.page}>
      <div className={styles.topRow}>
        <h1 className={styles.pageTitle}>サマリー</h1>
        <Link href="/summary/sales">営業サマリーへ</Link>
        <div className={styles.controls}>
          <div className={styles.selectorWrap}>
            <label className={styles.controlLabel}>職種</label>
            <select
              value={selectedJobId}
              onChange={(event) => setSelectedJobId(event.target.value)}
              className={styles.select}
              disabled={loading || jobs.length === 0}
            >
              {jobs.length === 0 ? (
                <option value="">職種がありません</option>
              ) : (
                jobs.map((job) => (
                  <option key={job.id} value={job.id}>
                    {job.name}
                  </option>
                ))
              )}
            </select>
          </div>

          <div className={styles.yearNav}>
            <button type="button" onClick={() => setDisplayYear((current) => current - 1)} className={styles.yearButton}>
              ‹
            </button>
            <div className={styles.yearLabel}>{displayYear}年</div>
            <button type="button" onClick={() => setDisplayYear((current) => current + 1)} className={styles.yearButton}>
              ›
            </button>
          </div>
        </div>
      </div>

      <div className={styles.topBorder} />
      {errorMsg && <p className={styles.errorText}>{errorMsg}</p>}

      {isDirectorJob && (
        <div className={styles.tabBar}>
          <button
            type="button"
            className={`${styles.tabButton} ${directorTab === "working" ? styles.tabButtonActive : ""}`}
            onClick={() => setDirectorTab("working")}
          >
            稼働売上
          </button>
          <button
            type="button"
            className={`${styles.tabButton} ${directorTab === "billing" ? styles.tabButtonActive : ""}`}
            onClick={() => setDirectorTab("billing")}
          >
            請求売上
          </button>
          <button
            type="button"
            className={`${styles.tabButton} ${directorTab === "production" ? styles.tabButtonActive : ""}`}
            onClick={() => setDirectorTab("production")}
          >
            生産稼働率
          </button>
        </div>
      )}

      <div className={styles.sectionHeader}>
        <div>
          <h2 className={styles.sectionTitle}>{sectionTitle}</h2>
        </div>
      </div>

      <div className={styles.noteArea}>
        <span>
          {isProductionMode
            ? "評価基準: S=1.0 / A=0.9 / B=0.8 / C=0.7 / D=0.6 / E=0.59以下"
            : "評価基準: S=1.1 / A=1.0 / B=0.9 / C=0.8 / D=0.7 / E=0.69以下"}
        </span>
      </div>

      <div className={styles.tableFrame}>
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.thFixed}>項目</th>
                {fiscalMonths.map((month) => (
                  <th key={month.key} className={styles.thMonth}>
                    {month.label}
                  </th>
                ))}
                <th className={styles.thTotal}>年間合計</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className={styles.tdFixed}>稼働率</td>
                {monthlyRows.map((row) => (
                  <td key={row.key} className={styles.tdMonth}>
                    {formatPercent(row.rate * 100)}
                  </td>
                ))}
                <td className={styles.tdTotal}>{formatPercent(annualRate * 100)}</td>
              </tr>

              <tr>
                <td className={styles.tdFixed}>評価</td>
                {monthlyRows.map((row) => (
                  <td key={row.key} className={styles.tdMonth}>
                    {row.grade}
                  </td>
                ))}
                <td className={styles.tdTotal}>{annualGrade}</td>
              </tr>

              <tr>
                <td className={styles.tdFixed}>{isProductionMode ? "生産稼働額" : "売上"}</td>
                {monthlyRows.map((row) => (
                  <td key={row.key} className={styles.tdMonth}>
                    {renderAmountLink(row.sales, { metric: "sales", month: row.key })}
                  </td>
                ))}
                <td className={styles.tdTotal}>
                  {renderAmountLink(annualSales, { metric: "sales", month: "annual" })}
                </td>
              </tr>

              {isProductionMode && (
                <tr>
                  <td className={styles.tdFixed}>有償</td>
                  {productionMonthlyRows.map((row) => (
                    <td key={`paid-${row.key}`} className={styles.tdMonth}>
                      {renderAmountLink(row.paid, { metric: "paid", month: row.key })}
                    </td>
                  ))}
                  <td className={styles.tdTotal}>
                    {renderAmountLink(annualPaid, { metric: "paid", month: "annual" })}
                  </td>
                </tr>
              )}

              {isProductionMode && (
                <tr>
                  <td className={styles.tdFixed}>無償</td>
                  {productionMonthlyRows.map((row) => (
                    <td key={`free-${row.key}`} className={styles.tdMonth}>
                      {renderAmountLink(row.free, { metric: "free", month: row.key })}
                    </td>
                  ))}
                  <td className={styles.tdTotal}>
                    {renderAmountLink(annualFree, { metric: "free", month: "annual" })}
                  </td>
                </tr>
              )}

              {!isProductionMode && (
                <tr>
                  <td className={styles.tdFixed}>稼働目標</td>
                  {monthlyRows.map((row) => (
                    <td key={row.key} className={styles.tdMonth}>
                      {formatCurrency(Math.round(row.target))}
                    </td>
                  ))}
                  <td className={styles.tdTotal}>{formatCurrency(Math.round(annualTarget))}</td>
                </tr>
              )}

              {!isProductionMode && (
                <tr>
                  <td className={styles.tdFixed}>差分</td>
                  {monthlyRows.map((row) => (
                    <td key={row.key} className={styles.tdMonth}>
                      {formatCurrency(Math.round(row.diff))}
                    </td>
                  ))}
                  <td className={styles.tdTotal}>{formatCurrency(Math.round(annualDiff))}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className={styles.subSection}>
        <h3 className={styles.subSectionTitle}>{firstSubTitle}</h3>
        <div className={styles.tableFrame}>
          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.thFixed}>氏名</th>
                  {fiscalMonths.map((month) => (
                    <th key={month.key} className={styles.thMonth}>
                      {month.label}
                    </th>
                  ))}
                  <th className={styles.thTotal}>年間合計</th>
                </tr>
              </thead>
              <tbody>
                {individualRows.length === 0 ? (
                  <tr>
                    <td className={styles.emptyCell} colSpan={14}>
                      対象ユーザーがいません。
                    </td>
                  </tr>
                ) : (
                  individualRows.map((row) => (
                    <tr key={row.profileId}>
                      <td className={styles.tdFixed}>{row.name}</td>
                      {row.rates.map((value, index) => (
                        <td key={`${row.profileId}-rate-${index}`} className={styles.tdMonth}>
                          {formatPercent(value * 100)}
                        </td>
                      ))}
                      <td className={styles.tdTotal}>{formatPercent(row.avgRate * 100)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className={styles.subSection}>
        <h3 className={styles.subSectionTitle}>{secondSubTitle}</h3>
        <div className={styles.tableFrame}>
          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.thFixed}>氏名</th>
                  {fiscalMonths.map((month) => (
                    <th key={month.key} className={styles.thMonth}>
                      {month.label}
                    </th>
                  ))}
                  <th className={styles.thTotal}>年間合計</th>
                </tr>
              </thead>
              <tbody>
                {individualRows.length === 0 ? (
                  <tr>
                    <td className={styles.emptyCell} colSpan={14}>
                      対象ユーザーがいません。
                    </td>
                  </tr>
                ) : (
                  individualRows.map((row) => (
                    <tr key={row.profileId}>
                      <td className={styles.tdFixed}>{row.name}</td>
                      {(isProductionMode ? row.paidMonths : row.months).map((value, index) => (
                        <td key={`${row.profileId}-amount-${index}`} className={styles.tdMonth}>
                          {renderAmountLink(value, {
                            metric: isProductionMode ? "paid" : "sales",
                            month: fiscalMonths[index].key,
                            profileId: row.profileId,
                          })}
                        </td>
                      ))}
                      <td className={styles.tdTotal}>
                        {renderAmountLink(isProductionMode ? row.paidTotal : row.total, {
                          metric: isProductionMode ? "paid" : "sales",
                          month: "annual",
                          profileId: row.profileId,
                        })}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {isProductionMode && (
        <div className={styles.subSection}>
          <h3 className={styles.subSectionTitle}>個人生産稼働額(無償)</h3>
          <div className={styles.tableFrame}>
            <div className={styles.tableScroll}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th className={styles.thFixed}>氏名</th>
                    {fiscalMonths.map((month) => (
                      <th key={month.key} className={styles.thMonth}>
                        {month.label}
                      </th>
                    ))}
                    <th className={styles.thTotal}>年間合計</th>
                  </tr>
                </thead>
                <tbody>
                  {individualRows.length === 0 ? (
                    <tr>
                      <td className={styles.emptyCell} colSpan={14}>
                        対象ユーザーがいません。
                      </td>
                    </tr>
                  ) : (
                    individualRows.map((row) => (
                      <tr key={row.profileId}>
                        <td className={styles.tdFixed}>{row.name}</td>
                        {row.freeMonths.map((value, index) => (
                          <td key={`${row.profileId}-free-${index}`} className={styles.tdMonth}>
                            {renderAmountLink(value, {
                              metric: "free",
                              month: fiscalMonths[index].key,
                              profileId: row.profileId,
                            })}
                          </td>
                        ))}
                        <td className={styles.tdTotal}>
                          {renderAmountLink(row.freeTotal, {
                            metric: "free",
                            month: "annual",
                            profileId: row.profileId,
                          })}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}