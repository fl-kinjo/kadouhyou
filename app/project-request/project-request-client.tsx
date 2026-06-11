"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/app/utils/supabase/client";
import styles from "./project-request-client.module.css";

type ProjectRow = {
  id: string;
  name: string;
  client_id: string | null;
  payment_due_date: string | null;
  planned_cost_approval_status: number | null;
  planned_cost_requested_at: string | null;
  planned_cost_reviewed_at: string | null;
  planned_cost_reviewed_by: string | null;
};

type ClientRow = {
  id: string;
  name: string;
};

type PlannedCostRow = {
  id: string;
  project_id: string;
  category: number;
  operating_person_months: number | string | null;
  amount: number | string | null;
};

type ProfileRow = {
  id: string;
  is_admin: number | boolean | null;
};

type RequestRow = ProjectRow & {
  clientName: string;
  plannedLaborAmount: number;
  plannedLaborPersonDays: number;
};

const PLANNED_COST_APPROVAL_STATUS = {
  pending: 1,
  approved: 2,
  rejected: 3,
  canceled: 4,
} as const;

const APPROVAL_STATUS_LABELS: Record<number, string> = {
  1: "予定工数確認依頼中",
  2: "承認済み",
  3: "却下",
  4: "取消",
};

function getMonthStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function getMonthEnd(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function getDateKey(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatMonthLabel(date: Date) {
  return `${date.getFullYear()}年${date.getMonth() + 1}月`;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  return value.slice(0, 10).replaceAll("-", "/");
}

function formatDateTime(value: string | null | undefined) {
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

function formatYen(value: number | string | null | undefined) {
  const num = Number(value ?? 0);
  if (!Number.isFinite(num)) return "-";
  return `¥${Math.round(num).toLocaleString("ja-JP")}`;
}

function formatPersonDays(value: number) {
  return `${Number(value.toFixed(2)).toLocaleString("ja-JP")}人日`;
}

function toSafeNumber(value: number | string | null | undefined) {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num : 0;
}

function getStatusClass(status: number | null | undefined) {
  switch (status) {
    case PLANNED_COST_APPROVAL_STATUS.approved:
      return styles.statusApproved;
    case PLANNED_COST_APPROVAL_STATUS.rejected:
      return styles.statusRejected;
    case PLANNED_COST_APPROVAL_STATUS.canceled:
      return styles.statusCanceled;
    default:
      return styles.statusPending;
  }
}

export default function ProjectRequestClient() {
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [displayMonth, setDisplayMonth] = useState(() => getMonthStart(new Date()));
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [plannedCosts, setPlannedCosts] = useState<PlannedCostRow[]>([]);
  const [actionProjectId, setActionProjectId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setMessage("");

    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw new Error(authError.message);

      const userId = authData.user?.id;
      if (!userId) throw new Error("ログインユーザーを取得できません。");

      const { data: profileData, error: profileError } = await supabase
        .from("profiles_2")
        .select("id,is_admin")
        .eq("id", userId)
        .maybeSingle();

      if (profileError) throw new Error(profileError.message);

      const profile = (profileData ?? null) as ProfileRow | null;
      const nextIsAdmin = profile?.is_admin === true || profile?.is_admin === 1;
      setIsAdmin(nextIsAdmin);

      if (!nextIsAdmin) {
        setProjects([]);
        setClients([]);
        setPlannedCosts([]);
        setMessage("案件申請管理は管理者のみ利用できます。");
        return;
      }

      const monthStart = getMonthStart(displayMonth);
      const monthEnd = getMonthEnd(displayMonth);
      const from = `${getDateKey(monthStart)}T00:00:00+09:00`;
      const to = `${getDateKey(new Date(monthEnd.getFullYear(), monthEnd.getMonth(), monthEnd.getDate() + 1))}T00:00:00+09:00`;

      const [{ data: projectData, error: projectError }, { data: clientData, error: clientError }] =
        await Promise.all([
          supabase
            .from("project")
            .select(
              "id,name,client_id,payment_due_date,planned_cost_approval_status,planned_cost_requested_at,planned_cost_reviewed_at,planned_cost_reviewed_by"
            )
            .in("planned_cost_approval_status", [
              PLANNED_COST_APPROVAL_STATUS.pending,
              PLANNED_COST_APPROVAL_STATUS.approved,
              PLANNED_COST_APPROVAL_STATUS.rejected,
              PLANNED_COST_APPROVAL_STATUS.canceled,
            ])
            .gte("planned_cost_requested_at", from)
            .lt("planned_cost_requested_at", to)
            .order("planned_cost_requested_at", { ascending: false }),
          supabase.from("client").select("id,name"),
        ]);

      if (projectError) throw new Error(projectError.message);
      if (clientError) throw new Error(clientError.message);

      const nextProjects = (projectData ?? []) as ProjectRow[];
      setProjects(nextProjects);
      setClients((clientData ?? []) as ClientRow[]);

      const projectIds = nextProjects.map((project) => project.id);
      if (projectIds.length === 0) {
        setPlannedCosts([]);
      } else {
        const { data: plannedCostData, error: plannedCostError } = await supabase
          .from("project_planned_cost")
          .select("id,project_id,category,operating_person_months,amount")
          .eq("category", 2)
          .in("project_id", projectIds);

        if (plannedCostError) throw new Error(plannedCostError.message);
        setPlannedCosts((plannedCostData ?? []) as PlannedCostRow[]);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }, [displayMonth, supabase]);

  useEffect(() => {
    load();
  }, [load]);

  const clientMap = useMemo(() => new Map(clients.map((client) => [client.id, client.name])), [clients]);

  const rows = useMemo<RequestRow[]>(() => {
    const costMap = new Map<string, { amount: number; personDays: number }>();

    for (const cost of plannedCosts) {
      const current = costMap.get(cost.project_id) ?? { amount: 0, personDays: 0 };
      current.amount += toSafeNumber(cost.amount);
      current.personDays += toSafeNumber(cost.operating_person_months);
      costMap.set(cost.project_id, current);
    }

    return projects.map((project) => {
      const cost = costMap.get(project.id) ?? { amount: 0, personDays: 0 };
      return {
        ...project,
        clientName: project.client_id ? clientMap.get(project.client_id) ?? "-" : "-",
        plannedLaborAmount: cost.amount,
        plannedLaborPersonDays: cost.personDays,
      };
    });
  }, [clientMap, plannedCosts, projects]);

  const updateApprovalStatus = async (projectId: string, status: number) => {
    if (!isAdmin || actionProjectId) return;

    setActionProjectId(projectId);
    setMessage("");

    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw new Error(authError.message);

      const userId = authData.user?.id;
      if (!userId) throw new Error("ログインユーザーを取得できません。");

      const { error } = await supabase
        .from("project")
        .update({
          planned_cost_approval_status: status,
          planned_cost_reviewed_at: new Date().toISOString(),
          planned_cost_reviewed_by: userId,
          updated_by: userId,
        })
        .eq("id", projectId);

      if (error) throw new Error(error.message);

      setProjects((current) =>
        current.map((project) =>
          project.id === projectId
            ? {
                ...project,
                planned_cost_approval_status: status,
                planned_cost_reviewed_at: new Date().toISOString(),
                planned_cost_reviewed_by: userId,
              }
            : project
        )
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setActionProjectId(null);
    }
  };

  return (
    <main className={styles.page}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>案件申請管理</h1>
        <Link href="/project" className={styles.btnGhost}>
          案件一覧へ戻る
        </Link>
      </div>

      {message && <p className={styles.message}>{message}</p>}

      <div className={styles.monthRow}>
        <button
          type="button"
          className={styles.monthButton}
          onClick={() => setDisplayMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))}
        >
          ‹
        </button>
        <div className={styles.monthTitle}>{formatMonthLabel(displayMonth)}</div>
        <button
          type="button"
          className={styles.monthButton}
          onClick={() => setDisplayMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))}
        >
          ›
        </button>
      </div>

      <div className={styles.tableFrame}>
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>申請日</th>
                <th>案件名</th>
                <th>クライアント</th>
                <th>支払期日</th>
                <th>予定工数</th>
                <th>予定工数金額</th>
                <th>ステータス</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className={styles.emptyCell}>
                    読み込み中...
                  </td>
                </tr>
              ) : !isAdmin ? (
                <tr>
                  <td colSpan={8} className={styles.emptyCell}>
                    管理者のみ利用できます。
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className={styles.emptyCell}>
                    申請データがありません。
                  </td>
                </tr>
              ) : (
                rows.map((project) => {
                  const disabled = actionProjectId === project.id;
                  return (
                    <tr key={project.id}>
                      <td>{formatDateTime(project.planned_cost_requested_at)}</td>
                      <td>
                        <Link href={`/project/${project.id}`} className={styles.projectLink}>
                          {project.name}
                        </Link>
                      </td>
                      <td>{project.clientName}</td>
                      <td>{formatDate(project.payment_due_date)}</td>
                      <td>{formatPersonDays(project.plannedLaborPersonDays)}</td>
                      <td>{formatYen(project.plannedLaborAmount)}</td>
                      <td>
                        <span className={`${styles.statusBadge} ${getStatusClass(project.planned_cost_approval_status)}`}>
                          {APPROVAL_STATUS_LABELS[project.planned_cost_approval_status ?? 0] ?? "-"}
                        </span>
                      </td>
                      <td>
                        <div className={styles.actionRow}>
                          <button
                            type="button"
                            className={styles.approveButton}
                            onClick={() => updateApprovalStatus(project.id, PLANNED_COST_APPROVAL_STATUS.approved)}
                            disabled={disabled}
                          >
                            承認
                          </button>
                          <button
                            type="button"
                            className={styles.rejectButton}
                            onClick={() => updateApprovalStatus(project.id, PLANNED_COST_APPROVAL_STATUS.rejected)}
                            disabled={disabled}
                          >
                            却下
                          </button>
                          <button
                            type="button"
                            className={styles.cancelButton}
                            onClick={() => updateApprovalStatus(project.id, PLANNED_COST_APPROVAL_STATUS.canceled)}
                            disabled={disabled}
                          >
                            取消
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
