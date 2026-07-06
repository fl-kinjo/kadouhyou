"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/app/utils/supabase/client";
import styles from "./expenses-management-client.module.css";

type ExpenseRow = {
  id: string;
  profile_id: string;
  project_id: string | null;
  team_id: string | null;
  expense_type: number | null;
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
  receipt_file_path: string | null;
  receipt_file_name: string | null;
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

type TeamLeaderRow = {
  team_id: string;
  profile_id: string;
};

type ProfileTeamRow = {
  profile_id: string;
  team_id: string;
};

type JobRow = {
  id: string;
  name: string;
};

type ProjectRow = {
  id: string;
  name: string;
};

type TeamRow = {
  id: string;
  name: string;
  department_code: string | null;
  parent_id: string | null;
};

type MainTab = "employee" | "request";
type ExpenseTypeFilter = "all" | "direct" | "indirect";

type GroupedExpenseRequest = {
  requestGroupId: string;
  profileId: string;
  applicantName: string;
  createdAt: string;
  applicationStatus: number;
  totalAmount: number;
  targetLabel: string;
  expenseType: number | null;
  items: {
    id: string;
    expenseDate: string;
    expenseName: string;
    amount: number;
    purpose: string;
    invoice: boolean;
    receiptFilePath: string | null;
    receiptFileName: string | null;
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

function matchesExpenseTypeFilter(expenseType: number | null, filter: ExpenseTypeFilter) {
  if (filter === "all") return true;
  if (filter === "direct") return expenseType === 0;
  return expenseType === 1;
}

function formatExpenseTypeLabel(expenseType: number | null) {
  return expenseType === 1 ? "間接経費" : "直接経費";
}

function formatTeamLabel(team: TeamRow | null | undefined) {
  if (!team) return "-";
  if (team.department_code) {
    return `${team.department_code} / ${team.name}`;
  }
  return team.name;
}

export default function ExpensesManagementClient() {
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [savingGroupId, setSavingGroupId] = useState("");
  const [downloadingReceiptPath, setDownloadingReceiptPath] = useState("");
  const [message, setMessage] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [isTeamLeader, setIsTeamLeader] = useState(false);
  const [displayMonth, setDisplayMonth] = useState(() => getMonthStart(new Date()));
  const [activeMainTab, setActiveMainTab] = useState<MainTab>("employee");
  const [expenseTypeFilter, setExpenseTypeFilter] = useState<ExpenseTypeFilter>("all");
  const [selectedProfileId, setSelectedProfileId] = useState("");

  const [expenseRows, setExpenseRows] = useState<ExpenseRow[]>([]);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [profileJobs, setProfileJobs] = useState<ProfileJobRow[]>([]);
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [profileTeams, setProfileTeams] = useState<ProfileTeamRow[]>([]);
  const [leaderTeamIds, setLeaderTeamIds] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setMessage("");

    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw new Error(authError.message);

      const userId = authData.user?.id;
      if (!userId) throw new Error("ログインユーザーを取得できません。");

      const [
        { data: currentProfileData, error: currentProfileError },
        { data: teamLeaderData, error: teamLeaderError },
      ] = await Promise.all([
        supabase.from("profiles_2").select("id,is_admin").eq("id", userId).maybeSingle(),
        supabase.from("team_leader").select("team_id,profile_id").eq("profile_id", userId),
      ]);

      if (currentProfileError) throw new Error(currentProfileError.message);
      if (teamLeaderError) throw new Error(teamLeaderError.message);

      const nextIsAdmin = currentProfileData?.is_admin === 1;
      const nextLeaderTeamIds = new Set(((teamLeaderData ?? []) as TeamLeaderRow[]).map((leader) => leader.team_id));
      const nextIsTeamLeader = nextLeaderTeamIds.size > 0;

      setIsAdmin(nextIsAdmin);
      setIsTeamLeader(nextIsTeamLeader);
      setLeaderTeamIds(nextLeaderTeamIds);

      if (!nextIsAdmin && !nextIsTeamLeader) {
        setExpenseRows([]);
        setProfiles([]);
        setProfileJobs([]);
        setJobs([]);
        setProjects([]);
        setTeams([]);
        setProfileTeams([]);
        setMessage("経費申請承認は管理者または所属組織リーダーのみ利用できます。");
        return;
      }

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
        { data: teamData, error: teamError },
        { data: profileTeamData, error: profileTeamError },
      ] = await Promise.all([
        supabase
          .from("project_actual_cost")
          .select(
            "id,profile_id,project_id,team_id,expense_type,category,expense_name,amount,expense_date,invoice,purpose,application_status,request_group_id,created_at,updated_by,receipt_file_path,receipt_file_name"
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
        supabase.from("team").select("id,name,department_code,parent_id").order("name", { ascending: true }),
        supabase.from("profile_team").select("profile_id,team_id"),
      ]);

      if (expenseError) throw new Error(expenseError.message);
      if (profileError) throw new Error(profileError.message);
      if (profileJobError) throw new Error(profileJobError.message);
      if (jobError) throw new Error(jobError.message);
      if (projectError) throw new Error(projectError.message);
      if (teamError) throw new Error(teamError.message);
      if (profileTeamError) throw new Error(profileTeamError.message);

      setExpenseRows((expenseData ?? []) as ExpenseRow[]);
      setProfiles((profileData ?? []) as ProfileRow[]);
      setProfileJobs((profileJobData ?? []) as ProfileJobRow[]);
      setJobs((jobData ?? []) as JobRow[]);
      setProjects((projectData ?? []) as ProjectRow[]);
      setTeams((teamData ?? []) as TeamRow[]);
      setProfileTeams((profileTeamData ?? []) as ProfileTeamRow[]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }, [displayMonth, supabase]);

  useEffect(() => {
    load();
  }, [load]);

  const leaderEffectiveTeamIds = useMemo(() => {
    const result = new Set(leaderTeamIds);
    const walk = (parentId: string) => {
      for (const team of teams) {
        if (team.parent_id !== parentId || result.has(team.id)) continue;
        result.add(team.id);
        walk(team.id);
      }
    };

    for (const teamId of leaderTeamIds) {
      walk(teamId);
    }

    return result;
  }, [leaderTeamIds, teams]);

  const leaderManagedProfileIds = useMemo(() => {
    const result = new Set<string>();
    if (leaderEffectiveTeamIds.size === 0) return result;

    for (const relation of profileTeams) {
      if (leaderEffectiveTeamIds.has(relation.team_id)) {
        result.add(relation.profile_id);
      }
    }

    return result;
  }, [leaderEffectiveTeamIds, profileTeams]);

  const visibleProfiles = useMemo(() => {
    if (isAdmin) return profiles;
    return profiles.filter((profile) => leaderManagedProfileIds.has(profile.id));
  }, [isAdmin, leaderManagedProfileIds, profiles]);


  const visibleExpenseRows = useMemo(() => {
    if (isAdmin) return expenseRows;
    return expenseRows.filter((row) => leaderManagedProfileIds.has(row.profile_id));
  }, [expenseRows, isAdmin, leaderManagedProfileIds]);

  const groupedRequests = useMemo<GroupedExpenseRequest[]>(() => {
    const profileMap = new Map(profiles.map((profile) => [profile.id, profile]));
    const projectMap = new Map(projects.map((project) => [project.id, project.name]));
    const teamMap = new Map(teams.map((team) => [team.id, team]));
    const map = new Map<string, GroupedExpenseRequest>();

    for (const row of visibleExpenseRows) {
      const current = map.get(row.request_group_id);
      const amount = Number(row.amount ?? 0);
      const invoice = row.invoice === true || row.invoice === 1;

      const targetLabel =
        row.expense_type === 1
          ? formatTeamLabel(row.team_id ? teamMap.get(row.team_id) : null)
          : row.project_id
            ? projectMap.get(row.project_id) ?? "-"
            : "-";

      if (!current) {
        map.set(row.request_group_id, {
          requestGroupId: row.request_group_id,
          profileId: row.profile_id,
          applicantName: fullName(profileMap.get(row.profile_id)),
          createdAt: row.created_at,
          applicationStatus: row.application_status,
          totalAmount: amount,
          targetLabel,
          expenseType: row.expense_type ?? 0,
          items: [
            {
              id: row.id,
              expenseDate: row.expense_date ?? "",
              expenseName: row.expense_name ?? "-",
              amount,
              purpose: row.purpose ?? "",
              invoice,
              receiptFilePath: row.receipt_file_path,
              receiptFileName: row.receipt_file_name,
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
          receiptFilePath: row.receipt_file_path,
          receiptFileName: row.receipt_file_name,
        });

        if (current.targetLabel !== targetLabel) {
          current.targetLabel = "複数";
        }

        if (current.expenseType !== (row.expense_type ?? 0)) {
          current.expenseType = null;
        }
      }
    }

    const result = Array.from(map.values());
    for (const group of result) {
      group.items.sort((a, b) => a.expenseDate.localeCompare(b.expenseDate, "ja"));
    }

    result.sort((a, b) => b.createdAt.localeCompare(a.createdAt, "ja"));
    return result;
  }, [profiles, projects, teams, visibleExpenseRows]);

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

    return visibleProfiles
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
  }, [groupedRequests, jobs, profileJobs, visibleProfiles]);

  const selectedEmployeeSummary = useMemo(
    () => employeeSummaries.find((row) => row.profileId === selectedProfileId) ?? null,
    [employeeSummaries, selectedProfileId]
  );

  const employeeGroupedRequests = useMemo(() => {
    return groupedRequests.filter((group) => group.profileId === selectedProfileId);
  }, [groupedRequests, selectedProfileId]);

  const filteredAllRequests = useMemo(() => {
    return groupedRequests.filter((group) =>
      matchesExpenseTypeFilter(group.expenseType, expenseTypeFilter)
    );
  }, [expenseTypeFilter, groupedRequests]);

  const teamSummaryHref = useMemo(() => {
    const params = new URLSearchParams({
      year: String(displayMonth.getFullYear()),
      month: String(displayMonth.getMonth() + 1),
    });
    return `/expenses-management/team-summary?${params.toString()}`;
  }, [displayMonth]);

  const updateApplicationStatus = async (requestGroupId: string, applicationStatus: 1 | 2 | 3) => {
    setSavingGroupId(requestGroupId);
    setMessage("");

    try {
      const { error } = await supabase.rpc("review_project_actual_cost_group", {
        target_request_group_id: requestGroupId,
        target_application_status: applicationStatus,
      });

      if (error) throw new Error(error.message);

      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setSavingGroupId("");
    }
  };

  const downloadReceipt = async (filePath: string, fileName?: string | null) => {
    setMessage("");
    setDownloadingReceiptPath(filePath);

    try {
      const { data, error } = await supabase.storage
        .from("expense-receipts")
        .createSignedUrl(filePath, 60);

      if (error) throw new Error(error.message);

      const response = await fetch(data.signedUrl);
      if (!response.ok) {
        throw new Error("領収書ファイルの取得に失敗しました。");
      }

      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);

      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = fileName || filePath.split("/").pop() || "receipt";
      document.body.appendChild(link);
      link.click();
      link.remove();

      window.URL.revokeObjectURL(blobUrl);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setDownloadingReceiptPath("");
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
                <div className={styles.requestMeta}>申請種別：{formatExpenseTypeLabel(group.expenseType)}</div>
                <div className={styles.requestMeta}>案件 / 部門：{group.targetLabel || "-"}</div>
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
                  <div className={styles.requestItemReceipt}>
                    {item.receiptFilePath ? (
                      <button
                        type="button"
                        className={styles.receiptDownloadButton}
                        onClick={() => downloadReceipt(item.receiptFilePath!, item.receiptFileName)}
                        disabled={downloadingReceiptPath === item.receiptFilePath}
                      >
                        {downloadingReceiptPath === item.receiptFilePath
                          ? "保存中..."
                          : "領収書を保存"}
                      </button>
                    ) : item.invoice ? (
                      <span className={styles.invoiceBadge}>領収書あり</span>
                    ) : (
                      "-"
                    )}
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
        <Link href={teamSummaryHref} className={styles.teamSummaryButton}>
          部門ごとの経費総額確認
        </Link>
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

      {!loading && !isAdmin && !isTeamLeader ? (
        <section className={styles.employeeSection}>
          <div className={styles.emptyState}>管理者または所属組織リーダーのみ利用できます。</div>
        </section>
      ) : activeMainTab === "employee" ? (
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
              className={`${styles.subTabButton} ${expenseTypeFilter === "all" ? styles.subTabButtonActive : ""}`}
              onClick={() => setExpenseTypeFilter("all")}
            >
              すべて
            </button>
            <button
              type="button"
              className={`${styles.subTabButton} ${expenseTypeFilter === "direct" ? styles.subTabButtonActive : ""}`}
              onClick={() => setExpenseTypeFilter("direct")}
            >
              直接経費
            </button>
            <button
              type="button"
              className={`${styles.subTabButton} ${expenseTypeFilter === "indirect" ? styles.subTabButtonActive : ""}`}
              onClick={() => setExpenseTypeFilter("indirect")}
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