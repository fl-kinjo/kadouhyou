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
  planned_cost_requested_by: string | null;
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

type TeamLeaderRow = {
  team_id: string;
  profile_id: string;
};

type ProfileTeamRow = {
  profile_id: string;
  team_id: string;
};

type TeamRow = {
  id: string;
  parent_id: string | null;
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
  const [isTeamLeader, setIsTeamLeader] = useState(false);
  const [displayMonth, setDisplayMonth] = useState(() => getMonthStart(new Date()));
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [plannedCosts, setPlannedCosts] = useState<PlannedCostRow[]>([]);
  const [requesterProfileTeams, setRequesterProfileTeams] = useState<ProfileTeamRow[]>([]);
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [leaderTeamIds, setLeaderTeamIds] = useState<Set<string>>(new Set());
  const [actionProjectId, setActionProjectId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setMessage("");

    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw new Error(authError.message);

      const userId = authData.user?.id;
      if (!userId) throw new Error("ログインユーザーを取得できません。");

      const [
        { data: profileData, error: profileError },
        { data: teamLeaderData, error: teamLeaderError },
      ] = await Promise.all([
        supabase
          .from("profiles_2")
          .select("id,is_admin")
          .eq("id", userId)
          .maybeSingle(),
        supabase.from("team_leader").select("team_id,profile_id").eq("profile_id", userId),
      ]);

      if (profileError) throw new Error(profileError.message);
      if (teamLeaderError) throw new Error(teamLeaderError.message);

      const profile = (profileData ?? null) as ProfileRow | null;
      const nextIsAdmin = profile?.is_admin === true || profile?.is_admin === 1;
      const nextLeaderTeamIds = new Set(((teamLeaderData ?? []) as TeamLeaderRow[]).map((leader) => leader.team_id));
      const nextIsTeamLeader = nextLeaderTeamIds.size > 0;

      setIsAdmin(nextIsAdmin);
      setIsTeamLeader(nextIsTeamLeader);
      setLeaderTeamIds(nextLeaderTeamIds);

      if (!nextIsAdmin && !nextIsTeamLeader) {
        setProjects([]);
        setClients([]);
        setPlannedCosts([]);
        setRequesterProfileTeams([]);
        setMessage("案件申請管理は管理者または所属組織リーダーのみ利用できます。");
        return;
      }

      const monthStart = getMonthStart(displayMonth);
      const monthEnd = getMonthEnd(displayMonth);
      const from = `${getDateKey(monthStart)}T00:00:00+09:00`;
      const to = `${getDateKey(new Date(monthEnd.getFullYear(), monthEnd.getMonth(), monthEnd.getDate() + 1))}T00:00:00+09:00`;

      const [
        { data: projectData, error: projectError },
        { data: clientData, error: clientError },
        { data: teamData, error: teamError },
      ] = await Promise.all([
          supabase
            .from("project")
            .select(
              "id,name,client_id,payment_due_date,planned_cost_approval_status,planned_cost_requested_at,planned_cost_reviewed_at,planned_cost_reviewed_by,planned_cost_requested_by"
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
          supabase.from("team").select("id,parent_id"),
        ]);

      if (projectError) throw new Error(projectError.message);
      if (clientError) throw new Error(clientError.message);
      if (teamError) throw new Error(teamError.message);

      const nextProjects = (projectData ?? []) as ProjectRow[];
      setProjects(nextProjects);
      setClients((clientData ?? []) as ClientRow[]);
      setTeams((teamData ?? []) as TeamRow[]);

      const requesterIds = Array.from(new Set(nextProjects.map((project) => project.planned_cost_requested_by).filter(Boolean))) as string[];
      if (requesterIds.length > 0) {
        const { data: requesterTeamData, error: requesterTeamError } = await supabase
          .from("profile_team")
          .select("profile_id,team_id")
          .in("profile_id", requesterIds);
        if (requesterTeamError) throw new Error(requesterTeamError.message);
        setRequesterProfileTeams((requesterTeamData ?? []) as ProfileTeamRow[]);
      } else {
        setRequesterProfileTeams([]);
      }

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

  const leaderEffectiveTeamIds = useMemo(() => {
    const result = new Set(leaderTeamIds);
    const childrenByParent = new Map<string | null, TeamRow[]>();

    for (const team of teams) {
      const parentId = team.parent_id ?? null;
      if (!childrenByParent.has(parentId)) childrenByParent.set(parentId, []);
      childrenByParent.get(parentId)!.push(team);
    }

    const walk = (teamId: string) => {
      for (const child of childrenByParent.get(teamId) ?? []) {
        if (result.has(child.id)) continue;
        result.add(child.id);
        walk(child.id);
      }
    };

    for (const teamId of leaderTeamIds) {
      walk(teamId);
    }

    return result;
  }, [leaderTeamIds, teams]);

  const leaderManagedRequesterIds = useMemo(() => {
    const result = new Set<string>();
    if (leaderEffectiveTeamIds.size === 0) return result;

    for (const relation of requesterProfileTeams) {
      if (leaderEffectiveTeamIds.has(relation.team_id)) {
        result.add(relation.profile_id);
      }
    }

    return result;
  }, [leaderEffectiveTeamIds, requesterProfileTeams]);

  const canReviewProject = useCallback(
    (project: ProjectRow) => {
      if (isAdmin) return true;
      if (!project.planned_cost_requested_by) return false;
      return leaderManagedRequesterIds.has(project.planned_cost_requested_by);
    },
    [isAdmin, leaderManagedRequesterIds]
  );

  const clientMap = useMemo(() => new Map(clients.map((client) => [client.id, client.name])), [clients]);

  const rows = useMemo<RequestRow[]>(() => {
    const costMap = new Map<string, { amount: number; personDays: number }>();

    for (const cost of plannedCosts) {
      const current = costMap.get(cost.project_id) ?? { amount: 0, personDays: 0 };
      current.amount += toSafeNumber(cost.amount);
      current.personDays += toSafeNumber(cost.operating_person_months);
      costMap.set(cost.project_id, current);
    }

    return projects.filter((project) => canReviewProject(project)).map((project) => {
      const cost = costMap.get(project.id) ?? { amount: 0, personDays: 0 };
      return {
        ...project,
        clientName: project.client_id ? clientMap.get(project.client_id) ?? "-" : "-",
        plannedLaborAmount: cost.amount,
        plannedLaborPersonDays: cost.personDays,
      };
    });
  }, [canReviewProject, clientMap, plannedCosts, projects]);

  const updateApprovalStatus = async (projectId: string, status: number) => {
    const targetProject = projects.find((project) => project.id === projectId);
    if (!targetProject || !canReviewProject(targetProject) || actionProjectId) return;

    setActionProjectId(projectId);
    setMessage("");

    try {
      const { error } = await supabase.rpc("review_project_planned_cost", {
        target_project_id: projectId,
        target_approval_status: status,
      });

      if (error) throw new Error(error.message);

      await load();
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
              ) : !isAdmin && !isTeamLeader ? (
                <tr>
                  <td colSpan={8} className={styles.emptyCell}>
                    管理者または所属組織リーダーのみ利用できます。
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
                  const disabled = actionProjectId === project.id || !canReviewProject(project);
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
