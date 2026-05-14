"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/app/utils/supabase/client";
import styles from "./expenses-management-client.module.css";

type ExpenseRow = {
  id: string;
  profile_id: string;
  project_id: string | null;
  category: number | null;
  expense_name: string | null;
  amount: number | null;
  expense_date: string | null;
  invoice: boolean | number | null;
  purpose: string | null;
  application_status: number;
  request_group_id: string;
  created_at: string;
  updated_by: string | null;
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

type JobRow = {
  id: string;
  name: string;
};

type ProjectRow = {
  id: string;
  name: string;
};

type MainTab = "employee" | "request";
type CategoryFilter = "all" | "direct" | "indirect";

type GroupedExpenseRequest = {
  requestGroupId: string;
  profileId: string;
  applicantName: string;
  createdAt: string;
  applicationStatus: number;
  totalAmount: number;
  projectName: string;
  category: number | null;
  items: {
    id: string;
    expenseDate: string;
    expenseName: string;
    amount: number;
    purpose: string;
    invoice: boolean;
  }[];
};

type EmployeeSummaryRow = {
  profileId: string;
  name: string;
  teamName: string;
  totalAmount: number;
  requestCount: number;
  pendingCount: number;
  approvedAmount: number;
  rejectedAmount: number;
};

const APPLICATION_STATUS_LABELS: Record<number, string> = {
  0: "承認待ち",
  1: "承認済み",
  2: "却下",
  3: "取消",
};

function formatMonthTitle(date: Date) {
  return `${date.getFullYear()}年${date.getMonth() + 1}月`;
}

function getMonthStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function getMonthEnd(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 1);
}

function formatDateJP(value: string | null | undefined) {
  if (!value) return "-";
  return value.slice(0, 10).replaceAll("-", "/");
}

function formatCurrency(value: number) {
  return `¥${Math.round(value).toLocaleString("ja-JP")}`;
}

function fullName(profile: ProfileRow | null | undefined) {
  if (!profile) return "";
  const name = `${profile.last_name ?? ""}${profile.first_name ?? ""}`.trim();
  return name || profile.email || "";
}

function getStatusClass(status: number) {
  switch (status) {
    case 1:
      return styles.statusApproved;
    case 2:
    case 3:
      return styles.statusRejected;
    default:
      return styles.statusPending;
  }
}

function matchesCategoryFilter(category: number | null, filter: CategoryFilter) {
  if (filter === "all") return true;
  if (filter === "direct") return category === 0;
  return category === 1;
}

export default function ExpensesManagementClient() {
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [savingGroupId, setSavingGroupId] = useState("");
  const [message, setMessage] = useState("");
  const [displayMonth, setDisplayMonth] = useState(() => getMonthStart(new Date()));
  const [activeMainTab, setActiveMainTab] = useState<MainTab>("employee");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [selectedProfileId, setSelectedProfileId] = useState("");

  const [expenseRows, setExpenseRows] = useState<ExpenseRow[]>([]);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [profileJobs, setProfileJobs] = useState<ProfileJobRow[]>([]);
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [projects, setProjects] = useState<ProjectRow[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setMessage("");

    try {
      const monthStart = getMonthStart(displayMonth);
      const monthEnd = getMonthEnd(displayMonth);

      const from = monthStart.toISOString();
      const to = monthEnd.toISOString();

      const [
        { data: expenseData, error: expenseError },
        { data: profileData, error: profileError },
        { data: profileJobData, error: profileJobError },
        { data: jobData, error: jobError },
        { data: projectData, error: projectError },
      ] = await Promise.all([
        supabase
          .from("project_actual_cost")
          .select(
            "id,profile_id,project_id,category,expense_name,amount,expense_date,invoice,purpose,application_status,request_group_id,created_at,updated_by"
          )
          .not("profile_id", "is", null)
          .not("request_group_id", "is", null)
          .gte("created_at", from)
          .lt("created_at", to)
          .order("created_at", { ascending: false }),
        supabase
          .from("profiles_2")
          .select("id,last_name,first_name,email")
          .order("created_at", { ascending: true }),
        supabase.from("profile_job").select("profile_id,job_id"),
        supabase.from("job").select("id,name").order("created_at", { ascending: true }),
        supabase.from("project").select("id,name").order("created_at", { ascending: true }),
      ]);

      if (expenseError) throw new Error(expenseError.message);
      if (profileError) throw new Error(profileError.message);
      if (profileJobError) throw new Error(profileJobError.message);
      if (jobError) throw new Error(jobError.message);
      if (projectError) throw new Error(projectError.message);

      setExpenseRows((expenseData ?? []) as ExpenseRow[]);
      setProfiles((profileData ?? []) as ProfileRow[]);
      setProfileJobs((profileJobData ?? []) as ProfileJobRow[]);
      setJobs((jobData ?? []) as JobRow[]);
      setProjects((projectData ?? []) as ProjectRow[]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }, [displayMonth, supabase]);

  useEffect(() => {
    load();
  }, [load]);

  const groupedRequests = useMemo<GroupedExpenseRequest[]>(() => {
    const profileMap = new Map(profiles.map((profile) => [profile.id, profile]));
    const projectMap = new Map(projects.map((project) => [project.id, project.name]));
    const map = new Map<string, GroupedExpenseRequest>();

    for (const row of expenseRows) {
      const current = map.get(row.request_group_id);
      const amount = Number(row.amount ?? 0);
      const invoice = row.invoice === true || row.invoice === 1;
      const projectName = row.project_id ? projectMap.get(row.project_id) ?? "-" : "-";

      if (!current) {
        map.set(row.request_group_id, {
          requestGroupId: row.request_group_id,
          profileId: row.profile_id,
          applicantName: fullName(profileMap.get(row.profile_id)),
          createdAt: row.created_at,
          applicationStatus: row.application_status,
          totalAmount: amount,
          projectName,
          category: row.category ?? null,
          items: [
            {
              id: row.id,
              expenseDate: row.expense_date ?? "",
              expenseName: row.expense_name ?? "-",
              amount,
              purpose: row.purpose ?? "",
              invoice,
            },
          ],
        });
      } else {
        current.totalAmount += amount;
        current.items.push({
          id: row.id,
          expenseDate: row.expense_date ?? "",
          expenseName: row.expense_name ?? "-",
          amount,
          purpose: row.purpose ?? "",
          invoice,
        });

        if (current.projectName !== projectName) {
          current.projectName = "複数案件";
        }

        if (current.category !== (row.category ?? null)) {
          current.category = null;
        }
      }
    }

    const result = Array.from(map.values());
    for (const group of result) {
      group.items.sort((a, b) => a.expenseDate.localeCompare(b.expenseDate, "ja"));
    }

    result.sort((a, b) => b.createdAt.localeCompare(a.createdAt, "ja"));
    return result;
  }, [expenseRows, profiles, projects]);

  const employeeSummaries = useMemo<EmployeeSummaryRow[]>(() => {
    const jobMap = new Map(jobs.map((job) => [job.id, job.name]));
    const profileJobMap = new Map<string, string>();

    for (const row of profileJobs) {
      if (!profileJobMap.has(row.profile_id)) {
        profileJobMap.set(row.profile_id, jobMap.get(row.job_id) ?? "-");
      }
    }

    const groupMap = new Map<string, GroupedExpenseRequest[]>();
    for (const group of groupedRequests) {
      if (!groupMap.has(group.profileId)) {
        groupMap.set(group.profileId, []);
      }
      groupMap.get(group.profileId)!.push(group);
    }

    return profiles
      .map((profile) => {
        const groups = groupMap.get(profile.id) ?? [];
        const totalAmount = groups.reduce((sum, group) => sum + group.totalAmount, 0);
        const pendingCount = groups.filter((group) => group.applicationStatus === 0).length;
        const approvedAmount = groups
          .filter((group) => group.applicationStatus === 1)
          .reduce((sum, group) => sum + group.totalAmount, 0);
        const rejectedAmount = groups
          .filter((group) => group.applicationStatus === 2)
          .reduce((sum, group) => sum + group.totalAmount, 0);

        return {
          profileId: profile.id,
          name: fullName(profile) || "-",
          teamName: profileJobMap.get(profile.id) ?? "-",
          totalAmount,
          requestCount: groups.length,
          pendingCount,
          approvedAmount,
          rejectedAmount,
        };
      })
      .filter((row) => row.requestCount > 0)
      .sort((a, b) => a.name.localeCompare(b.name, "ja"));
  }, [groupedRequests, jobs, profileJobs, profiles]);

  const selectedEmployeeSummary = useMemo(
    () => employeeSummaries.find((row) => row.profileId === selectedProfileId) ?? null,
    [employeeSummaries, selectedProfileId]
  );

  const employeeGroupedRequests = useMemo(() => {
    return groupedRequests.filter((group) => group.profileId === selectedProfileId);
  }, [groupedRequests, selectedProfileId]);

  const filteredAllRequests = useMemo(() => {
    return groupedRequests.filter((group) => matchesCategoryFilter(group.category, categoryFilter));
  }, [categoryFilter, groupedRequests]);

  const updateApplicationStatus = async (requestGroupId: string, applicationStatus: 1 | 2 | 3) => {
    setSavingGroupId(requestGroupId);
    setMessage("");

    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw new Error(authError.message);

      const userId = authData.user?.id;
      if (!userId) throw new Error("ログインユーザーを取得できません。");

      const { error } = await supabase
        .from("project_actual_cost")
        .update({
          application_status: applicationStatus,
          updated_by: userId,
        })
        .eq("request_group_id", requestGroupId);

      if (error) throw new Error(error.message);

      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setSavingGroupId("");
    }
  };

  const renderRequestCards = (requestList: GroupedExpenseRequest[]) => {
    if (loading) {
      return <div className={styles.emptyState}>読み込み中...</div>;
    }

    if (requestList.length === 0) {
      return <div className={styles.emptyState}>申請データがありません。</div>;
    }

    return (
      <div className={styles.requestList}>
        {requestList.map((group) => (
          <div key={group.requestGroupId} className={styles.requestCard}>
            <div className={styles.requestHeader}>
              <div>
                <div className={styles.requestDate}>{formatDateJP(group.createdAt)}</div>
                <div className={styles.requestAmount}>{formatCurrency(group.totalAmount)}</div>
                <div className={styles.requestMeta}>申請者：{group.applicantName || "-"}</div>
                <div className={styles.requestMeta}>案件名：{group.projectName || "-"}</div>
              </div>

              <div className={`${styles.statusBadge} ${getStatusClass(group.applicationStatus)}`}>
                {APPLICATION_STATUS_LABELS[group.applicationStatus] ?? String(group.applicationStatus)}
              </div>
            </div>

            <div className={styles.requestItems}>
              {group.items.map((item) => (
                <div key={item.id} className={styles.requestItemRow}>
                  <div className={styles.requestItemDate}>{formatDateJP(item.expenseDate)}</div>
                  <div className={styles.requestItemName}>{item.expenseName}</div>
                  <div className={styles.requestItemAmount}>{formatCurrency(item.amount)}</div>
                  <div className={styles.requestItemPurpose}>{item.purpose || "-"}</div>
                  <div className={styles.requestItemInvoice}>
                    {item.invoice ? <span className={styles.invoiceBadge}>インボイス有</span> : ""}
                  </div>
                </div>
              ))}
            </div>

            <div className={styles.actionRow}>
              <button
                type="button"
                className={styles.actionButton}
                disabled={savingGroupId === group.requestGroupId}
                onClick={() => updateApplicationStatus(group.requestGroupId, 1)}
              >
                承認
              </button>
              <button
                type="button"
                className={styles.actionButton}
                disabled={savingGroupId === group.requestGroupId}
                onClick={() => updateApplicationStatus(group.requestGroupId, 2)}
              >
                却下
              </button>
              <button
                type="button"
                className={styles.actionButton}
                disabled={savingGroupId === group.requestGroupId}
                onClick={() => updateApplicationStatus(group.requestGroupId, 3)}
              >
                取消
              </button>
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <main className={styles.page}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>経費申請承認</h1>
      </div>

      <div className={styles.monthRow}>
        <button
          type="button"
          className={styles.monthButton}
          onClick={() => setDisplayMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))}
        >
          ‹
        </button>
        <div className={styles.monthTitle}>{formatMonthTitle(displayMonth)}</div>
        <button
          type="button"
          className={styles.monthButton}
          onClick={() => setDisplayMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))}
        >
          ›
        </button>
      </div>

      <div className={styles.tabBar}>
        <button
          type="button"
          className={`${styles.tabButton} ${activeMainTab === "employee" ? styles.tabButtonActive : ""}`}
          onClick={() => setActiveMainTab("employee")}
        >
          社員一覧
        </button>
        <button
          type="button"
          className={`${styles.tabButton} ${activeMainTab === "request" ? styles.tabButtonActive : ""}`}
          onClick={() => setActiveMainTab("request")}
        >
          申請一覧
        </button>
      </div>

      {message && <p className={styles.message}>{message}</p>}

      {activeMainTab === "employee" ? (
        <>
          {!selectedProfileId ? (
            <section className={styles.employeeSection}>
              {loading ? (
                <div className={styles.emptyState}>読み込み中...</div>
              ) : employeeSummaries.length === 0 ? (
                <div className={styles.emptyState}>社員データがありません。</div>
              ) : (
                <div className={styles.employeeTableFrame}>
                  <table className={styles.employeeTable}>
                    <thead>
                      <tr>
                        <th>氏名</th>
                        <th>チーム</th>
                        <th>申請総額</th>
                        <th>件数</th>
                        <th>承認待ち</th>
                        <th>承認済</th>
                        <th>却下</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {employeeSummaries.map((row) => (
                        <tr key={row.profileId}>
                          <td>{row.name}</td>
                          <td>{row.teamName}</td>
                          <td>{formatCurrency(row.totalAmount)}</td>
                          <td>{row.requestCount}件</td>
                          <td>{row.pendingCount > 0 ? `${row.pendingCount}件` : "-"}</td>
                          <td>{row.approvedAmount > 0 ? formatCurrency(row.approvedAmount) : "-"}</td>
                          <td>{row.rejectedAmount > 0 ? formatCurrency(row.rejectedAmount) : "-"}</td>
                          <td>
                            <button
                              type="button"
                              className={styles.detailButton}
                              onClick={() => setSelectedProfileId(row.profileId)}
                            >
                              詳細
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          ) : (
            <section className={styles.detailSection}>
              <div className={styles.breadcrumbRow}>
                <button type="button" className={styles.breadcrumbButton} onClick={() => setSelectedProfileId("")}>
                  社員一覧
                </button>
                <span className={styles.breadcrumbArrow}>›</span>
                <span className={styles.breadcrumbCurrent}>{selectedEmployeeSummary?.name ?? "-"}</span>
              </div>

              <div className={styles.summaryCards}>
                <div className={styles.summaryCard}>
                  <div className={styles.summaryLabel}>申請総額</div>
                  <div className={styles.summaryValue}>
                    {formatCurrency(selectedEmployeeSummary?.totalAmount ?? 0)}
                  </div>
                </div>
                <div className={styles.summaryCard}>
                  <div className={styles.summaryLabel}>承認済み</div>
                  <div className={styles.summaryValue}>
                    {formatCurrency(selectedEmployeeSummary?.approvedAmount ?? 0)}
                  </div>
                </div>
                <div className={styles.summaryCard}>
                  <div className={styles.summaryLabel}>承認待ち</div>
                  <div className={`${styles.summaryValue} ${styles.pendingText}`}>
                    {formatCurrency(
                      employeeGroupedRequests
                        .filter((group) => group.applicationStatus === 0)
                        .reduce((sum, group) => sum + group.totalAmount, 0)
                    )}
                  </div>
                </div>
                <div className={styles.summaryCard}>
                  <div className={styles.summaryLabel}>却下</div>
                  <div className={styles.summaryValue}>
                    {formatCurrency(selectedEmployeeSummary?.rejectedAmount ?? 0)}
                  </div>
                </div>
              </div>

              {renderRequestCards(employeeGroupedRequests)}
            </section>
          )}
        </>
      ) : (
        <section className={styles.listSection}>
          <div className={styles.subTabBar}>
            <button
              type="button"
              className={`${styles.subTabButton} ${categoryFilter === "all" ? styles.subTabButtonActive : ""}`}
              onClick={() => setCategoryFilter("all")}
            >
              すべて
            </button>
            <button
              type="button"
              className={`${styles.subTabButton} ${categoryFilter === "direct" ? styles.subTabButtonActive : ""}`}
              onClick={() => setCategoryFilter("direct")}
            >
              直接経費
            </button>
            <button
              type="button"
              className={`${styles.subTabButton} ${categoryFilter === "indirect" ? styles.subTabButtonActive : ""}`}
              onClick={() => setCategoryFilter("indirect")}
            >
              間接経費
            </button>
          </div>

          {renderRequestCards(filteredAllRequests)}
        </section>
      )}
    </main>
  );
}