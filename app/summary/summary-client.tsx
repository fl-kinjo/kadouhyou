"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/app/utils/supabase/client";
import styles from "./summary-client.module.css";

type JobRow = { id: string; name: string; monthly_unit_price: number | null };
type ProfileRow = { id: string; last_name: string | null; first_name: string | null; email: string | null };
type ProfileJobRow = { profile_id: string; job_id: string };
type ProjectRow = {
  id: string;
  invoice_amount: number | null;
  invoice_month: string | null;
  member_revenue_share: number | null;
  pm_revenue_share: number | null;
  project_manager_id: string | null;
  status: number | null;
};
type ProjectMemberRow = { profile_id: string; project_id: string };
type ManMonthRow = { profile_id: string; target_year_month: string; operating_person_months: number | string };
type ProjectPlannedCostRow = { project_id: string; profile_id: string | null; target_year_month: string; amount: number | null };
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

function getFiscalMonths(year: number) {
  const result: { key: string; label: string }[] = [];
  for (let month = 6; month <= 12; month += 1) result.push({ key: `${year}-${String(month).padStart(2, "0")}-01`, label: `${year}/${month}` });
  for (let month = 1; month <= 5; month += 1) result.push({ key: `${year + 1}-${String(month).padStart(2, "0")}-01`, label: `${year + 1}/${month}` });
  return result;
}
const formatPercent = (value: number) => `${value.toFixed(2)}%`;
const formatCurrency = (value: number) => `¥${value.toLocaleString("ja-JP")}`;
const average = (values: number[]) => (values.length ? values.reduce((s, v) => s + v, 0) / values.length : 0);
function toGrade(rate: number) { if (rate >= 1.1) return "S"; if (rate >= 1.0) return "A"; if (rate >= 0.9) return "B"; if (rate >= 0.8) return "C"; if (rate >= 0.7) return "D"; return "E"; }
function toDesignerGrade(rate: number) { if (rate >= 1.0) return "S"; if (rate >= 0.9) return "A"; if (rate >= 0.8) return "B"; if (rate >= 0.7) return "C"; if (rate >= 0.6) return "D"; return "E"; }
function fullName(lastName?: string | null, firstName?: string | null, email?: string | null) { const name = `${lastName ?? ""}${firstName ?? ""}`.trim(); return name || email || ""; }

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
  const [projectPlannedCosts, setProjectPlannedCosts] = useState<ProjectPlannedCostRow[]>([]);
  const [selectedJobId, setSelectedJobId] = useState("");
  const [displayYear, setDisplayYear] = useState(new Date().getFullYear());

  const fiscalMonths = useMemo(() => getFiscalMonths(displayYear), [displayYear]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setErrorMsg("");
      try {
        const fromMonth = fiscalMonths[0]?.key;
        const toMonth = fiscalMonths[fiscalMonths.length - 1]?.key;
        const [jobsRes, profilesRes, profileJobsRes, projectsRes, projectMembersRes, manMonthsRes, plannedCostsRes] = await Promise.all([
          supabase.from("job").select("id,name,monthly_unit_price").order("created_at", { ascending: true }),
          supabase.from("profiles_2").select("id,last_name,first_name,email").order("created_at", { ascending: true }),
          supabase.from("profile_job").select("profile_id,job_id"),
          supabase.from("project").select("id,invoice_amount,invoice_month,member_revenue_share,pm_revenue_share,project_manager_id,status"),
          supabase.from("project_member").select("profile_id,project_id"),
          supabase.from("man_month").select("profile_id,target_year_month,operating_person_months").gte("target_year_month", fromMonth).lte("target_year_month", toMonth),
          supabase.from("project_planned_cost").select("project_id,profile_id,target_year_month,amount").gte("target_year_month", fromMonth).lte("target_year_month", toMonth),
        ]);
        if (jobsRes.error) throw new Error(jobsRes.error.message);
        if (profilesRes.error) throw new Error(profilesRes.error.message);
        if (profileJobsRes.error) throw new Error(profileJobsRes.error.message);
        if (projectsRes.error) throw new Error(projectsRes.error.message);
        if (projectMembersRes.error) throw new Error(projectMembersRes.error.message);
        if (manMonthsRes.error) throw new Error(manMonthsRes.error.message);
        if (plannedCostsRes.error) throw new Error(plannedCostsRes.error.message);
        const nextJobs = (jobsRes.data ?? []) as JobRow[];
        setJobs(nextJobs);
        setProfiles((profilesRes.data ?? []) as ProfileRow[]);
        setProfileJobs((profileJobsRes.data ?? []) as ProfileJobRow[]);
        setProjects((projectsRes.data ?? []) as ProjectRow[]);
        setProjectMembers((projectMembersRes.data ?? []) as ProjectMemberRow[]);
        setManMonths((manMonthsRes.data ?? []) as ManMonthRow[]);
        setProjectPlannedCosts((plannedCostsRes.data ?? []) as ProjectPlannedCostRow[]);
        if (nextJobs.length > 0) setSelectedJobId((current) => current || nextJobs[0].id);
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
  const isDesigner = selectedJobLabel === "デザイナー";

  const jobProfileIds = useMemo(() => profileJobs.filter((row) => row.job_id === selectedJobId).map((row) => row.profile_id), [profileJobs, selectedJobId]);
  const selectedProfiles = useMemo(() => {
    const profileIdSet = new Set(jobProfileIds);
    return profiles.filter((profile) => profileIdSet.has(profile.id)).sort((a, b) => fullName(a.last_name, a.first_name, a.email).localeCompare(fullName(b.last_name, b.first_name, b.email), "ja"));
  }, [jobProfileIds, profiles]);
  const memberCount = jobProfileIds.length;

  const memberCountsByProject = useMemo(() => {
    const map = new Map<string, number>();
    for (const relation of projectMembers) map.set(relation.project_id, (map.get(relation.project_id) ?? 0) + 1);
    return map;
  }, [projectMembers]);
  const manMonthMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of manMonths) map.set(`${row.profile_id}_${row.target_year_month}`, Number(row.operating_person_months ?? 1));
    return map;
  }, [manMonths]);

  const genericIndividualRows = useMemo<IndividualRow[]>(() => {
    const projectMap = new Map(projects.map((project) => [project.id, project]));
    const memberProjectMap = new Map<string, string[]>();
    for (const relation of projectMembers) {
      if (!memberProjectMap.has(relation.profile_id)) memberProjectMap.set(relation.profile_id, []);
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
        const invoiceAmount = Number(project.invoice_amount ?? 0);
        const memberShareRate = Number(project.member_revenue_share ?? 0) / 100;
        const memberCountForProject = memberCountsByProject.get(project.id) ?? 1;
        let amount = (invoiceAmount * memberShareRate) / (memberCountForProject > 0 ? memberCountForProject : 1);
        if (project.project_manager_id === profile.id) {
          amount += invoiceAmount * (Number(project.pm_revenue_share ?? 0) / 100);
          handledPmProjects.add(project.id);
        }
        monthMap.set(project.invoice_month, (monthMap.get(project.invoice_month) ?? 0) + amount);
      }
      for (const project of projects) {
        if (project.project_manager_id !== profile.id || handledPmProjects.has(project.id) || !project.invoice_month || !monthMap.has(project.invoice_month)) continue;
        const amount = Number(project.invoice_amount ?? 0) * (Number(project.pm_revenue_share ?? 0) / 100);
        monthMap.set(project.invoice_month, (monthMap.get(project.invoice_month) ?? 0) + amount);
      }
      const months = fiscalMonths.map((month) => monthMap.get(month.key) ?? 0);
      const total = months.reduce((sum, value) => sum + value, 0);
      const rates = months.map((value) => (monthlyUnitPrice > 0 ? value / monthlyUnitPrice : 0));
      return { profileId: profile.id, name: fullName(profile.last_name, profile.first_name, profile.email), paidMonths: months, freeMonths: fiscalMonths.map(() => 0), paidTotal: total, freeTotal: 0, months, total, rates, avgRate: average(rates) };
    });
  }, [fiscalMonths, memberCountsByProject, monthlyUnitPrice, projectMembers, projects, selectedProfiles]);

  const designerIndividualRows = useMemo<IndividualRow[]>(() => {
    const projectMap = new Map(projects.map((project) => [project.id, project]));
    return selectedProfiles.map((profile) => {
      const paidMap = new Map<string, number>();
      const freeMap = new Map<string, number>();
      for (const month of fiscalMonths) { paidMap.set(month.key, 0); freeMap.set(month.key, 0); }
      for (const cost of projectPlannedCosts) {
        if (cost.profile_id !== profile.id || !paidMap.has(cost.target_year_month)) continue;
        const project = projectMap.get(cost.project_id);
        if (!project) continue;
        const amount = Number(cost.amount ?? 0);
        if (project.status === 7 || project.status === 8) freeMap.set(cost.target_year_month, (freeMap.get(cost.target_year_month) ?? 0) + amount);
        else paidMap.set(cost.target_year_month, (paidMap.get(cost.target_year_month) ?? 0) + amount);
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
      return { profileId: profile.id, name: fullName(profile.last_name, profile.first_name, profile.email), paidMonths, freeMonths, paidTotal, freeTotal, months, total, rates, avgRate: average(rates) };
    });
  }, [fiscalMonths, manMonthMap, monthlyUnitPrice, projectPlannedCosts, projects, selectedProfiles]);

  const individualRows = isDesigner ? designerIndividualRows : genericIndividualRows;

  const genericSalesByMonth = useMemo(() => {
    const map = new Map<string, number>();
    fiscalMonths.forEach((month, index) => map.set(month.key, genericIndividualRows.reduce((sum, row) => sum + (row.months[index] ?? 0), 0)));
    return map;
  }, [fiscalMonths, genericIndividualRows]);

  const genericTargetByMonth = useMemo(() => {
    const map = new Map<string, number>();
    const monthlyTarget = memberCount * monthlyUnitPrice;
    for (const month of fiscalMonths) map.set(month.key, monthlyTarget);
    return map;
  }, [fiscalMonths, memberCount, monthlyUnitPrice]);

  const genericMonthlyRows = useMemo(() => fiscalMonths.map((month) => {
    const sales = genericSalesByMonth.get(month.key) ?? 0;
    const target = genericTargetByMonth.get(month.key) ?? 0;
    const rate = target > 0 ? sales / target : 0;
    return { key: month.key, sales, target, rate, grade: toGrade(rate), diff: sales - target, paid: 0, free: 0 };
  }), [fiscalMonths, genericSalesByMonth, genericTargetByMonth]);

  const designerMonthlyRows = useMemo(() => fiscalMonths.map((month, index) => {
    const paid = designerIndividualRows.reduce((sum, row) => sum + (row.paidMonths[index] ?? 0), 0);
    const free = designerIndividualRows.reduce((sum, row) => sum + (row.freeMonths[index] ?? 0), 0);
    const sales = paid + free;
    let denominator = 0;
    for (const profileId of jobProfileIds) {
      const personMonths = manMonthMap.get(`${profileId}_${month.key}`) ?? 1;
      denominator += monthlyUnitPrice * personMonths;
    }
    const rate = denominator > 0 ? sales / denominator : 0;
    return { key: month.key, sales, target: 0, rate, grade: toDesignerGrade(rate), diff: 0, paid, free };
  }), [designerIndividualRows, fiscalMonths, jobProfileIds, manMonthMap, monthlyUnitPrice]);

  const monthlyRows = isDesigner ? designerMonthlyRows : genericMonthlyRows;
  const annualSales = monthlyRows.reduce((sum, row) => sum + row.sales, 0);
  const annualTarget = monthlyRows.reduce((sum, row) => sum + row.target, 0);
  const annualRate = average(monthlyRows.map((row) => row.rate));
  const annualDiff = monthlyRows.reduce((sum, row) => sum + row.diff, 0);
  const annualGrade = isDesigner ? toDesignerGrade(annualRate) : toGrade(annualRate);
  const annualPaid = isDesigner ? designerMonthlyRows.reduce((sum, row) => sum + row.paid, 0) : 0;
  const annualFree = isDesigner ? designerMonthlyRows.reduce((sum, row) => sum + row.free, 0) : 0;

  return (
    <main className={styles.page}>
      <div className={styles.topRow}>
        <h1 className={styles.pageTitle}>サマリー</h1>
        <div className={styles.controls}>
          <div className={styles.selectorWrap}>
            <label className={styles.controlLabel}>職種</label>
            <select value={selectedJobId} onChange={(event) => setSelectedJobId(event.target.value)} className={styles.select} disabled={loading || jobs.length === 0}>
              {jobs.length === 0 ? <option value="">職種がありません</option> : jobs.map((job) => <option key={job.id} value={job.id}>{job.name}</option>)}
            </select>
          </div>
          <div className={styles.yearNav}>
            <button type="button" onClick={() => setDisplayYear((current) => current - 1)} className={styles.yearButton}>‹</button>
            <div className={styles.yearLabel}>{displayYear}年</div>
            <button type="button" onClick={() => setDisplayYear((current) => current + 1)} className={styles.yearButton}>›</button>
          </div>
        </div>
      </div>

      <div className={styles.topBorder} />
      {errorMsg && <p className={styles.errorText}>{errorMsg}</p>}

      <div className={styles.sectionHeader}>
        <div>
          <h2 className={styles.sectionTitle}>{selectedJobLabel ? `${selectedJobLabel} 売上稼働率` : "職種サマリー"}</h2>
          <p className={styles.sectionSubTitle}>{isDesigner ? "デザイナー表示" : "売上稼働率 ＝ 稼働売上 / 稼働目標"}</p>
        </div>
      </div>

      <div className={styles.noteArea}><span>{isDesigner ? "評価基準: S=1.0 / A=0.9 / B=0.8 / C=0.7 / D=0.6 / E=0.59以下" : "評価基準: S=1.1 / A=1.0 / B=0.9 / C=0.8 / D=0.7 / E=0.69以下"}</span></div>

      <div className={styles.tableFrame}><div className={styles.tableScroll}><table className={styles.table}><thead><tr><th className={styles.thFixed}>項目</th>{fiscalMonths.map((month) => <th key={month.key} className={styles.thMonth}>{month.label}</th>)}<th className={styles.thTotal}>年間合計</th></tr></thead><tbody>
        <tr><td className={styles.tdFixed}>稼働率</td>{monthlyRows.map((row) => <td key={row.key} className={styles.tdMonth}>{formatPercent(row.rate * 100)}</td>)}<td className={styles.tdTotal}>{formatPercent(annualRate * 100)}</td></tr>
        <tr><td className={styles.tdFixed}>評価</td>{monthlyRows.map((row) => <td key={row.key} className={styles.tdMonth}>{row.grade}</td>)}<td className={styles.tdTotal}>{annualGrade}</td></tr>
        <tr><td className={styles.tdFixed}>稼働売上</td>{monthlyRows.map((row) => <td key={row.key} className={styles.tdMonth}>{formatCurrency(Math.round(row.sales))}</td>)}<td className={styles.tdTotal}>{formatCurrency(Math.round(annualSales))}</td></tr>
        {isDesigner && <tr><td className={styles.tdFixed}>有償</td>{designerMonthlyRows.map((row) => <td key={`paid-${row.key}`} className={styles.tdMonth}>{formatCurrency(Math.round(row.paid))}</td>)}<td className={styles.tdTotal}>{formatCurrency(Math.round(annualPaid))}</td></tr>}
        {isDesigner && <tr><td className={styles.tdFixed}>無償</td>{designerMonthlyRows.map((row) => <td key={`free-${row.key}`} className={styles.tdMonth}>{formatCurrency(Math.round(row.free))}</td>)}<td className={styles.tdTotal}>{formatCurrency(Math.round(annualFree))}</td></tr>}
        {!isDesigner && <tr><td className={styles.tdFixed}>稼働目標</td>{monthlyRows.map((row) => <td key={row.key} className={styles.tdMonth}>{formatCurrency(Math.round(row.target))}</td>)}<td className={styles.tdTotal}>{formatCurrency(Math.round(annualTarget))}</td></tr>}
        {!isDesigner && <tr><td className={styles.tdFixed}>差分</td>{monthlyRows.map((row) => <td key={row.key} className={styles.tdMonth}>{formatCurrency(Math.round(row.diff))}</td>)}<td className={styles.tdTotal}>{formatCurrency(Math.round(annualDiff))}</td></tr>}
      </tbody></table></div></div>

      <div className={styles.subSection}>
        <h3 className={styles.subSectionTitle}>{isDesigner ? "個人生産稼働率" : "個人売上稼働率"}</h3>
        <div className={styles.tableFrame}><div className={styles.tableScroll}><table className={styles.table}><thead><tr><th className={styles.thFixed}>氏名</th>{fiscalMonths.map((month) => <th key={month.key} className={styles.thMonth}>{month.label}</th>)}<th className={styles.thTotal}>年間合計</th></tr></thead><tbody>
          {individualRows.length === 0 ? <tr><td className={styles.emptyCell} colSpan={14}>対象ユーザーがいません。</td></tr> : individualRows.map((row) => <tr key={row.profileId}><td className={styles.tdFixed}>{row.name}</td>{row.rates.map((value, index) => <td key={`${row.profileId}-rate-${index}`} className={styles.tdMonth}>{formatPercent(value * 100)}</td>)}<td className={styles.tdTotal}>{formatPercent(row.avgRate * 100)}</td></tr>)}
        </tbody></table></div></div>
      </div>

      <div className={styles.subSection}>
        <h3 className={styles.subSectionTitle}>{isDesigner ? "個人稼働売上(有償)" : "個人売上"}</h3>
        <div className={styles.tableFrame}><div className={styles.tableScroll}><table className={styles.table}><thead><tr><th className={styles.thFixed}>氏名</th>{fiscalMonths.map((month) => <th key={month.key} className={styles.thMonth}>{month.label}</th>)}<th className={styles.thTotal}>年間合計</th></tr></thead><tbody>
          {individualRows.length === 0 ? <tr><td className={styles.emptyCell} colSpan={14}>対象ユーザーがいません。</td></tr> : individualRows.map((row) => <tr key={row.profileId}><td className={styles.tdFixed}>{row.name}</td>{(isDesigner ? row.paidMonths : row.months).map((value, index) => <td key={`${row.profileId}-paid-${index}`} className={styles.tdMonth}>{formatCurrency(Math.round(value))}</td>)}<td className={styles.tdTotal}>{formatCurrency(Math.round(isDesigner ? row.paidTotal : row.total))}</td></tr>)}
        </tbody></table></div></div>
      </div>

      {isDesigner && <div className={styles.subSection}><h3 className={styles.subSectionTitle}>個人稼働売上(無償)</h3><div className={styles.tableFrame}><div className={styles.tableScroll}><table className={styles.table}><thead><tr><th className={styles.thFixed}>氏名</th>{fiscalMonths.map((month) => <th key={month.key} className={styles.thMonth}>{month.label}</th>)}<th className={styles.thTotal}>年間合計</th></tr></thead><tbody>
        {individualRows.length === 0 ? <tr><td className={styles.emptyCell} colSpan={14}>対象ユーザーがいません。</td></tr> : individualRows.map((row) => <tr key={row.profileId}><td className={styles.tdFixed}>{row.name}</td>{row.freeMonths.map((value, index) => <td key={`${row.profileId}-free-${index}`} className={styles.tdMonth}>{formatCurrency(Math.round(value))}</td>)}<td className={styles.tdTotal}>{formatCurrency(Math.round(row.freeTotal))}</td></tr>)}
      </tbody></table></div></div></div>}
    </main>
  );
}
