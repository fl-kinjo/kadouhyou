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
};

type ClientRow = {
  id: string;
  name: string;
};

type ProfileRow = {
  id: string;
  email: string | null;
  last_name: string | null;
  first_name: string | null;
  is_admin: number | boolean | null;
};

type PlannedCostRequestRow = {
  id: string;
  project_id: string;
  requested_by: string | null;
  requested_at: string;
  approval_status: number;
  completed_at: string | null;
  planned_labor_person_months: number | string | null;
  planned_labor_amount: number | string | null;
};

type PlannedCostRequestApproverRow = {
  id: string;
  request_id: string;
  approver_profile_id: string;
  approval_status: number;
  reviewed_at: string | null;
  reviewed_by: string | null;
};

type RequestRow = PlannedCostRequestRow & {
  project: ProjectRow | null;
  clientName: string;
  approverText: string;
  myApprovalStatus: number | null;
  isMyApprovalPending: boolean;
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

function formatPersonMonths(value: number | string | null | undefined) {
  const num = Number(value ?? 0);
  if (!Number.isFinite(num)) return "-";
  return `${Number(num.toFixed(2)).toLocaleString("ja-JP")}人月`;
}

function fullName(profile?: ProfileRow | null) {
  if (!profile) return "-";
  const name = `${profile.last_name ?? ""}${profile.first_name ?? ""}`.trim();
  return name || profile.email || "-";
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
  const [currentProfileId, setCurrentProfileId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [displayMonth, setDisplayMonth] = useState(() => getMonthStart(new Date()));
  const [requests, setRequests] = useState<PlannedCostRequestRow[]>([]);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [approvers, setApprovers] = useState<PlannedCostRequestApproverRow[]>([]);
  const [actionRequestId, setActionRequestId] = useState<string | null>(null);

  const resolveCurrentProfile = useCallback(async () => {
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError) throw new Error(authError.message);

    const userId = authData.user?.id;
    const userEmail = authData.user?.email;
    if (!userId) throw new Error("ログインユーザーを取得できません。");

    const { data: profileById, error: profileByIdError } = await supabase
      .from("profiles_2")
      .select("id,email,last_name,first_name,is_admin")
      .eq("id", userId)
      .maybeSingle();

    if (profileByIdError) throw new Error(profileByIdError.message);
    if (profileById) return profileById as ProfileRow;

    if (!userEmail) throw new Error("ログインユーザーのメールアドレスを取得できません。");

    const { data: profileByEmail, error: profileByEmailError } = await supabase
      .from("profiles_2")
      .select("id,email,last_name,first_name,is_admin")
      .ilike("email", userEmail)
      .maybeSingle();

    if (profileByEmailError) throw new Error(profileByEmailError.message);
    if (!profileByEmail) throw new Error("ログインユーザーに対応する社員プロフィールが見つかりません。");

    return profileByEmail as ProfileRow;
  }, [supabase]);

  const load = useCallback(async () => {
    setLoading(true);
    setMessage("");

    try {
      const currentProfile = await resolveCurrentProfile();
      const nextIsAdmin = currentProfile.is_admin === true || currentProfile.is_admin === 1;

      setCurrentProfileId(currentProfile.id);
      setIsAdmin(nextIsAdmin);

      const monthStart = getMonthStart(displayMonth);
      const monthEnd = getMonthEnd(displayMonth);
      const from = `${getDateKey(monthStart)}T00:00:00+09:00`;
      const to = `${getDateKey(new Date(monthEnd.getFullYear(), monthEnd.getMonth(), monthEnd.getDate() + 1))}T00:00:00+09:00`;

      const [
        { data: requestData, error: requestError },
        { data: clientData, error: clientError },
        { data: profileData, error: profileError },
      ] = await Promise.all([
        supabase
          .from("project_planned_cost_request")
          .select("id,project_id,requested_by,requested_at,approval_status,completed_at,planned_labor_person_months,planned_labor_amount")
          .gte("requested_at", from)
          .lt("requested_at", to)
          .order("requested_at", { ascending: false }),
        supabase.from("client").select("id,name"),
        supabase.from("profiles_2").select("id,email,last_name,first_name,is_admin"),
      ]);

      if (requestError) throw new Error(requestError.message);
      if (clientError) throw new Error(clientError.message);
      if (profileError) throw new Error(profileError.message);

      const nextRequests = (requestData ?? []) as PlannedCostRequestRow[];
      setRequests(nextRequests);
      setClients((clientData ?? []) as ClientRow[]);
      setProfiles((profileData ?? []) as ProfileRow[]);

      const requestIds = nextRequests.map((request) => request.id);
      const projectIds = Array.from(new Set(nextRequests.map((request) => request.project_id)));

      if (requestIds.length === 0) {
        setProjects([]);
        setApprovers([]);
        return;
      }

      const [
        { data: approverData, error: approverError },
        { data: projectData, error: projectError },
      ] = await Promise.all([
        supabase
          .from("project_planned_cost_request_approver")
          .select("id,request_id,approver_profile_id,approval_status,reviewed_at,reviewed_by")
          .in("request_id", requestIds),
        supabase
          .from("project")
          .select("id,name,client_id,payment_due_date")
          .in("id", projectIds),
      ]);

      if (approverError) throw new Error(approverError.message);
      if (projectError) throw new Error(projectError.message);

      setApprovers((approverData ?? []) as PlannedCostRequestApproverRow[]);
      setProjects((projectData ?? []) as ProjectRow[]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }, [displayMonth, resolveCurrentProfile, supabase]);

  useEffect(() => {
    load();
  }, [load]);

  const clientMap = useMemo(() => new Map(clients.map((client) => [client.id, client.name])), [clients]);
  const profileMap = useMemo(() => new Map(profiles.map((profile) => [profile.id, profile])), [profiles]);
  const projectMap = useMemo(() => new Map(projects.map((project) => [project.id, project])), [projects]);

  const approversByRequest = useMemo(() => {
    const map = new Map<string, PlannedCostRequestApproverRow[]>();
    for (const approver of approvers) {
      const list = map.get(approver.request_id) ?? [];
      list.push(approver);
      map.set(approver.request_id, list);
    }
    return map;
  }, [approvers]);

  const rows = useMemo<RequestRow[]>(() => {
    return requests
      .map((request) => {
        const project = projectMap.get(request.project_id) ?? null;
        const requestApprovers = approversByRequest.get(request.id) ?? [];
        const myApproval = currentProfileId
          ? requestApprovers.find((approver) => approver.approver_profile_id === currentProfileId) ?? null
          : null;

        return {
          ...request,
          project,
          clientName: project?.client_id ? clientMap.get(project.client_id) ?? "-" : "-",
          approverText: requestApprovers.length
            ? requestApprovers
                .map((approver) => {
                  const name = fullName(profileMap.get(approver.approver_profile_id));
                  const status = APPROVAL_STATUS_LABELS[approver.approval_status] ?? "-";
                  return `${name}（${status}）`;
                })
                .join("、")
            : "-",
          myApprovalStatus: myApproval?.approval_status ?? null,
          isMyApprovalPending: myApproval?.approval_status === PLANNED_COST_APPROVAL_STATUS.pending,
        };
      })
      .filter((row) => isAdmin || row.myApprovalStatus !== null);
  }, [approversByRequest, clientMap, currentProfileId, isAdmin, profileMap, projectMap, requests]);

  const updateApprovalStatus = async (requestId: string, projectId: string, status: number) => {
    const targetRow = rows.find((row) => row.id === requestId);
    if (!targetRow || actionRequestId || !targetRow.isMyApprovalPending) return;

    setActionRequestId(requestId);
    setMessage("");

    try {
      const { error } = await supabase.rpc("review_project_planned_cost", {
        target_project_id: projectId,
        target_approval_status: status,
        target_request_id: requestId,
      });

      if (error) throw new Error(error.message);

      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setActionRequestId(null);
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
                <th>承認者</th>
                <th>ステータス</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} className={styles.emptyCell}>
                    読み込み中...
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className={styles.emptyCell}>
                    申請データがありません。
                  </td>
                </tr>
              ) : (
                rows.map((request) => {
                  const disabled = actionRequestId === request.id || !request.isMyApprovalPending;
                  return (
                    <tr key={request.id}>
                      <td>{formatDateTime(request.requested_at)}</td>
                      <td>
                        {request.project ? (
                          <Link href={`/project/${request.project.id}`} className={styles.projectLink}>
                            {request.project.name}
                          </Link>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td>{request.clientName}</td>
                      <td>{formatDate(request.project?.payment_due_date)}</td>
                      <td>{formatPersonMonths(request.planned_labor_person_months)}</td>
                      <td>{formatYen(request.planned_labor_amount)}</td>
                      <td className={styles.approverCell}>{request.approverText}</td>
                      <td>
                        <span className={`${styles.statusBadge} ${getStatusClass(request.approval_status)}`}>
                          {APPROVAL_STATUS_LABELS[request.approval_status] ?? "-"}
                        </span>
                      </td>
                      <td>
                        <div className={styles.actionRow}>
                          <button
                            type="button"
                            className={styles.approveButton}
                            onClick={() => updateApprovalStatus(request.id, request.project_id, PLANNED_COST_APPROVAL_STATUS.approved)}
                            disabled={disabled}
                          >
                            承認
                          </button>
                          <button
                            type="button"
                            className={styles.rejectButton}
                            onClick={() => updateApprovalStatus(request.id, request.project_id, PLANNED_COST_APPROVAL_STATUS.rejected)}
                            disabled={disabled}
                          >
                            却下
                          </button>
                          <button
                            type="button"
                            className={styles.cancelButton}
                            onClick={() => updateApprovalStatus(request.id, request.project_id, PLANNED_COST_APPROVAL_STATUS.canceled)}
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
