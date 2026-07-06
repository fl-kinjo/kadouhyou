"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/app/utils/supabase/client";
import styles from "./team-expense-summary-client.module.css";

type TeamRow = {
  id: string;
  name: string;
  department_code: string | null;
  parent_id: string | null;
};

type TeamLeaderRow = {
  team_id: string;
  profile_id: string;
};

type ExpenseRow = {
  id: string;
  team_id: string | null;
  amount: number | null;
  application_status: number | null;
  request_group_id: string | null;
  created_at: string | null;
};

type TeamSummaryRow = {
  teamId: string | null;
  departmentLabel: string;
  totalAmount: number;
  pendingAmount: number;
  approvedAmount: number;
  rejectedAmount: number;
  canceledAmount: number;
  requestCount: number;
  itemCount: number;
};

function getMonthStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function getMonthEnd(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 1);
}

function formatMonthTitle(date: Date) {
  return `${date.getFullYear()}年${date.getMonth() + 1}月`;
}

function formatCurrency(value: number) {
  return `¥${Math.round(value).toLocaleString("ja-JP")}`;
}

function formatTeamLabel(team: TeamRow | null | undefined) {
  if (!team) return "部門未設定";
  if (team.department_code) {
    return `${team.department_code} / ${team.name}`;
  }
  return team.name;
}

export default function TeamExpenseSummaryClient({
  initialYear,
  initialMonth,
}: {
  initialYear: number;
  initialMonth: number;
}) {
  const supabase = createClient();

  const [displayMonth, setDisplayMonth] = useState(() => new Date(initialYear, initialMonth - 1, 1));
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [isTeamLeader, setIsTeamLeader] = useState(false);
  const [leaderTeamIds, setLeaderTeamIds] = useState<Set<string>>(new Set());
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [expenseRows, setExpenseRows] = useState<ExpenseRow[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setMessage("");

    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw new Error(authError.message);

      const userId = authData.user?.id;
      if (!userId) throw new Error("ログインユーザーを取得できません。");

      const monthStart = getMonthStart(displayMonth);
      const monthEnd = getMonthEnd(displayMonth);
      const from = monthStart.toISOString();
      const to = monthEnd.toISOString();

      const [
        { data: currentProfileData, error: currentProfileError },
        { data: teamLeaderData, error: teamLeaderError },
        { data: teamData, error: teamError },
        { data: expenseData, error: expenseError },
      ] = await Promise.all([
        supabase.from("profiles_2").select("id,is_admin").eq("id", userId).maybeSingle(),
        supabase.from("team_leader").select("team_id,profile_id").eq("profile_id", userId),
        supabase.from("team").select("id,name,department_code,parent_id").order("name", { ascending: true }),
        supabase
          .from("project_actual_cost")
          .select("id,team_id,amount,application_status,request_group_id,created_at")
          .eq("expense_type", 1)
          .not("request_group_id", "is", null)
          .gte("created_at", from)
          .lt("created_at", to)
          .order("created_at", { ascending: false }),
      ]);

      if (currentProfileError) throw new Error(currentProfileError.message);
      if (teamLeaderError) throw new Error(teamLeaderError.message);
      if (teamError) throw new Error(teamError.message);
      if (expenseError) throw new Error(expenseError.message);

      const nextIsAdmin = currentProfileData?.is_admin === 1;
      const nextLeaderTeamIds = new Set(((teamLeaderData ?? []) as TeamLeaderRow[]).map((leader) => leader.team_id));
      const nextIsTeamLeader = nextLeaderTeamIds.size > 0;

      setIsAdmin(nextIsAdmin);
      setIsTeamLeader(nextIsTeamLeader);
      setLeaderTeamIds(nextLeaderTeamIds);
      setTeams((teamData ?? []) as TeamRow[]);

      if (!nextIsAdmin && !nextIsTeamLeader) {
        setExpenseRows([]);
        setMessage("部門ごとの経費総額確認は管理者または所属組織リーダーのみ利用できます。");
        return;
      }

      setExpenseRows((expenseData ?? []) as ExpenseRow[]);
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

  const visibleExpenseRows = useMemo(() => {
    if (isAdmin) return expenseRows;
    return expenseRows.filter((row) => row.team_id !== null && leaderEffectiveTeamIds.has(row.team_id));
  }, [expenseRows, isAdmin, leaderEffectiveTeamIds]);

  const teamSummaryRows = useMemo<TeamSummaryRow[]>(() => {
    const teamMap = new Map(teams.map((team) => [team.id, team]));
    const summaryMap = new Map<string, TeamSummaryRow & { requestGroupIds: Set<string> }>();

    for (const row of visibleExpenseRows) {
      const key = row.team_id ?? "__no_team__";
      const amount = Number(row.amount ?? 0);
      const status = row.application_status ?? 0;
      const current =
        summaryMap.get(key) ??
        {
          teamId: row.team_id,
          departmentLabel: formatTeamLabel(row.team_id ? teamMap.get(row.team_id) : null),
          totalAmount: 0,
          pendingAmount: 0,
          approvedAmount: 0,
          rejectedAmount: 0,
          canceledAmount: 0,
          requestCount: 0,
          itemCount: 0,
          requestGroupIds: new Set<string>(),
        };

      current.totalAmount += amount;
      current.itemCount += 1;

      if (row.request_group_id) {
        current.requestGroupIds.add(row.request_group_id);
      }

      if (status === 1) {
        current.approvedAmount += amount;
      } else if (status === 2) {
        current.rejectedAmount += amount;
      } else if (status === 3) {
        current.canceledAmount += amount;
      } else {
        current.pendingAmount += amount;
      }

      summaryMap.set(key, current);
    }

    return Array.from(summaryMap.values())
      .map(({ requestGroupIds, ...row }) => ({
        ...row,
        requestCount: requestGroupIds.size,
      }))
      .sort((a, b) => b.totalAmount - a.totalAmount || a.departmentLabel.localeCompare(b.departmentLabel, "ja"));
  }, [teams, visibleExpenseRows]);

  const totals = useMemo(() => {
    return teamSummaryRows.reduce(
      (sum, row) => ({
        totalAmount: sum.totalAmount + row.totalAmount,
        pendingAmount: sum.pendingAmount + row.pendingAmount,
        approvedAmount: sum.approvedAmount + row.approvedAmount,
        rejectedAmount: sum.rejectedAmount + row.rejectedAmount,
        canceledAmount: sum.canceledAmount + row.canceledAmount,
        requestCount: sum.requestCount + row.requestCount,
        itemCount: sum.itemCount + row.itemCount,
      }),
      {
        totalAmount: 0,
        pendingAmount: 0,
        approvedAmount: 0,
        rejectedAmount: 0,
        canceledAmount: 0,
        requestCount: 0,
        itemCount: 0,
      }
    );
  }, [teamSummaryRows]);

  const updateUrlForMonth = (nextDate: Date) => {
    const url = new URL(window.location.href);
    url.searchParams.set("year", String(nextDate.getFullYear()));
    url.searchParams.set("month", String(nextDate.getMonth() + 1));
    window.history.replaceState(null, "", url.toString());
  };

  const moveMonth = (offset: number) => {
    setDisplayMonth((current) => {
      const nextDate = new Date(current.getFullYear(), current.getMonth() + offset, 1);
      updateUrlForMonth(nextDate);
      return nextDate;
    });
  };

  return (
    <main className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <p className={styles.kicker}>経費申請承認</p>
          <h1 className={styles.pageTitle}>部門ごとの経費総額確認</h1>
        </div>
        <Link href="/expenses-management" className={styles.backButton}>
          経費管理へ戻る
        </Link>
      </div>

      <div className={styles.monthRow}>
        <button type="button" className={styles.monthButton} onClick={() => moveMonth(-1)}>
          ‹
        </button>
        <div className={styles.monthTitle}>{formatMonthTitle(displayMonth)}</div>
        <button type="button" className={styles.monthButton} onClick={() => moveMonth(1)}>
          ›
        </button>
      </div>

      {message && <p className={styles.message}>{message}</p>}

      {!loading && !isAdmin && !isTeamLeader ? (
        <section className={styles.emptyState}>管理者または所属組織リーダーのみ利用できます。</section>
      ) : (
        <>
          <section className={styles.summaryCards}>
            <div className={styles.summaryCard}>
              <div className={styles.summaryLabel}>間接経費総額</div>
              <div className={styles.summaryValue}>{formatCurrency(totals.totalAmount)}</div>
            </div>
            <div className={styles.summaryCard}>
              <div className={styles.summaryLabel}>承認済み</div>
              <div className={styles.summaryValue}>{formatCurrency(totals.approvedAmount)}</div>
            </div>
            <div className={styles.summaryCard}>
              <div className={styles.summaryLabel}>承認待ち</div>
              <div className={styles.summaryValue}>{formatCurrency(totals.pendingAmount)}</div>
            </div>
            <div className={styles.summaryCard}>
              <div className={styles.summaryLabel}>申請件数</div>
              <div className={styles.summaryValue}>{totals.requestCount.toLocaleString("ja-JP")}件</div>
            </div>
          </section>

          {loading ? (
            <section className={styles.emptyState}>読み込み中...</section>
          ) : teamSummaryRows.length === 0 ? (
            <section className={styles.emptyState}>対象月の間接経費データがありません。</section>
          ) : (
            <section className={styles.tableFrame}>
              <table className={styles.summaryTable}>
                <thead>
                  <tr>
                    <th>部門</th>
                    <th>経費総額</th>
                    <th>承認済み</th>
                    <th>承認待ち</th>
                    <th>却下</th>
                    <th>取消</th>
                    <th>申請件数</th>
                    <th>明細件数</th>
                  </tr>
                </thead>
                <tbody>
                  {teamSummaryRows.map((row) => (
                    <tr key={row.teamId ?? "no-team"}>
                      <td>{row.departmentLabel}</td>
                      <td>{formatCurrency(row.totalAmount)}</td>
                      <td>{row.approvedAmount > 0 ? formatCurrency(row.approvedAmount) : "-"}</td>
                      <td>{row.pendingAmount > 0 ? formatCurrency(row.pendingAmount) : "-"}</td>
                      <td>{row.rejectedAmount > 0 ? formatCurrency(row.rejectedAmount) : "-"}</td>
                      <td>{row.canceledAmount > 0 ? formatCurrency(row.canceledAmount) : "-"}</td>
                      <td>{row.requestCount.toLocaleString("ja-JP")}件</td>
                      <td>{row.itemCount.toLocaleString("ja-JP")}件</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
        </>
      )}
    </main>
  );
}
