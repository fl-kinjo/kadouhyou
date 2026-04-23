"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/app/utils/supabase/client";
import styles from "./top-client.module.css";

type Profile = {
  id: string;
  last_name: string | null;
  first_name: string | null;
  email: string | null;
};

type Attendance = {
  id: string;
  profile_id: string;
  work_date: string;
  start_time: string | null;
  end_time: string | null;
  break_out_time: string | null;
  break_in_time: string | null;
};

type Project = {
  id: string;
  name: string;
  client_id: string | null;
  status: number | null;
  invoice_amount: number | null;
  invoice_month: string | null;
  payment_due_date: string | null;
  invoice: string | null;
  project_manager_id: string | null;
};

type ProjectMember = {
  project_id: string;
  profile_id: string;
};

type ClientRow = {
  id: string;
  name: string;
};

type DisplayProject = {
  id: string;
  name: string;
  client_name: string;
  status: number | null;
  invoice_amount: number | null;
  invoice_month: string | null;
  payment_due_date: string | null;
  invoice: string | null;
};

const STATUS_LABELS: Record<number, string> = {
  0: "保留",
  1: "営業中",
  2: "確定前",
  3: "確定",
  4: "進行中",
  5: "完了",
  6: "滞留",
  7: "プリセールス(無償)",
  8: "社内案件(無償)",
};

function getTodayDateString(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatNow(date: Date) {
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function formatDateLabel(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const week = ["日", "月", "火", "水", "木", "金", "土"][date.getDay()];
  return `${y}/${m}/${d}（${week}）`;
}

function formatTime(value: string | null) {
  if (!value) return "--:--:--";
  return value.slice(0, 8);
}

function formatMonth(value: string | null) {
  if (!value) return "-";
  return value.slice(0, 7).replace("-", "/");
}

function formatCurrency(value: number | null) {
  if (value == null) return "-";
  return `¥${value.toLocaleString("ja-JP")}`;
}

function fullName(profile: Profile | null) {
  if (!profile) return "";
  const name = `${profile.last_name ?? ""}${profile.first_name ?? ""}`.trim();
  return name || (profile.email ?? "");
}

function isBlank(value: string | null | undefined) {
  return !value || !value.trim();
}

export default function TopClient() {
  const supabase = createClient();

  const [now, setNow] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const [profile, setProfile] = useState<Profile | null>(null);
  const [attendance, setAttendance] = useState<Attendance | null>(null);
  const [ongoingProjects, setOngoingProjects] = useState<DisplayProject[]>([]);
  const [unbilledProjects, setUnbilledProjects] = useState<DisplayProject[]>([]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(new Date());
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setMessage("");

    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw new Error(authError.message);

      const userId = authData.user?.id;
      if (!userId) throw new Error("ログインユーザーを取得できません。");

      const today = getTodayDateString(new Date());

      const [
        { data: profileData, error: profileError },
        { data: attendanceData, error: attendanceError },
        { data: projectsData, error: projectsError },
        { data: projectMembersData, error: projectMembersError },
        { data: clientsData, error: clientsError },
      ] = await Promise.all([
        supabase
          .from("profiles_2")
          .select("id,last_name,first_name,email")
          .eq("id", userId)
          .maybeSingle(),
        supabase
          .from("attendance")
          .select("id,profile_id,work_date,start_time,end_time,break_out_time,break_in_time")
          .eq("profile_id", userId)
          .eq("work_date", today)
          .maybeSingle(),
        supabase
          .from("project")
          .select("id,name,client_id,status,invoice_amount,invoice_month,payment_due_date,invoice,project_manager_id")
          .order("updated_at", { ascending: false }),
        supabase.from("project_member").select("project_id,profile_id"),
        supabase.from("client").select("id,name"),
      ]);

      if (profileError) throw new Error(profileError.message);
      if (attendanceError) throw new Error(attendanceError.message);
      if (projectsError) throw new Error(projectsError.message);
      if (projectMembersError) throw new Error(projectMembersError.message);
      if (clientsError) throw new Error(clientsError.message);

      const currentProfile = (profileData ?? null) as Profile | null;
      const todayAttendance = (attendanceData ?? null) as Attendance | null;
      const projects = (projectsData ?? []) as Project[];
      const projectMembers = (projectMembersData ?? []) as ProjectMember[];
      const clients = (clientsData ?? []) as ClientRow[];

      setProfile(currentProfile);
      setAttendance(todayAttendance);

      const clientMap = new Map(clients.map((client) => [client.id, client.name]));
      const memberProjectIds = new Set(
        projectMembers.filter((row) => row.profile_id === userId).map((row) => row.project_id)
      );

      const assignedProjects: DisplayProject[] = projects
        .filter((project) => project.project_manager_id === userId || memberProjectIds.has(project.id))
        .map((project) => ({
          id: project.id,
          name: project.name,
          client_name: project.client_id ? clientMap.get(project.client_id) ?? "-" : "-",
          status: project.status,
          invoice_amount: project.invoice_amount,
          invoice_month: project.invoice_month,
          payment_due_date: project.payment_due_date,
          invoice: project.invoice,
        }));

      setOngoingProjects(assignedProjects.filter((project) => project.status === 4));
      setUnbilledProjects(assignedProjects.filter((project) => isBlank(project.invoice)));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  const upsertAttendanceTime = async (
    field: "start_time" | "end_time" | "break_out_time" | "break_in_time"
  ) => {
    setSaving(true);
    setMessage("");

    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw new Error(authError.message);

      const userId = authData.user?.id;
      if (!userId) throw new Error("ログインユーザーを取得できません。");

      const today = getTodayDateString(new Date());
      const nowText = formatNow(new Date());

      const payload = {
        profile_id: userId,
        work_date: today,
        [field]: nowText,
        updated_by: userId,
      };

      const { error } = await supabase
        .from("attendance")
        .upsert(payload, { onConflict: "profile_id,work_date" });

      if (error) throw new Error(error.message);

      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  const attendanceStatusText = useMemo(() => {
    if (!attendance?.start_time) return "未出勤";
    if (attendance.end_time) return "退勤済み";
    if (attendance.break_out_time && !attendance.break_in_time) return "外出中";
    return `出勤中：${formatTime(attendance.start_time)}`;
  }, [attendance]);

  return (
    <main className={styles.page}>
      {message && <p className={styles.message}>{message}</p>}

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <h2 className={styles.sectionTitle}>打刻・勤怠ステータス</h2>
            {profile && <p className={styles.userText}>{fullName(profile)}</p>}
          </div>
          <Link href="/report" className={styles.sectionLink}>
            勤怠管理画面へ
          </Link>
        </div>

        <div className={styles.attendanceCard}>
          <div className={styles.attendanceLeft}>
            <p className={styles.dateText}>{formatDateLabel(now)}</p>
            <p className={styles.clockText}>{formatNow(now)}</p>
            <div className={styles.statusBadge}>{attendanceStatusText}</div>
          </div>

          <div className={styles.attendanceCenter}>
            <div className={styles.timeRow}>
              <span className={styles.timeLabel}>出勤時刻</span>
              <span className={styles.timeValue}>{formatTime(attendance?.start_time ?? null)}</span>
            </div>
            <div className={styles.timeRow}>
              <span className={styles.timeLabel}>退勤時刻</span>
              <span className={styles.timeValue}>{formatTime(attendance?.end_time ?? null)}</span>
            </div>
            <div className={styles.timeRow}>
              <span className={styles.timeLabel}>再入時刻</span>
              <span className={styles.timeValue}>{formatTime(attendance?.break_in_time ?? null)}</span>
            </div>
            <div className={styles.timeRow}>
              <span className={styles.timeLabel}>退出時刻</span>
              <span className={styles.timeValue}>{formatTime(attendance?.break_out_time ?? null)}</span>
            </div>
          </div>

          <div className={styles.attendanceButtons}>
            <button
              type="button"
              className={styles.btnAttendance}
              disabled={saving}
              onClick={() => upsertAttendanceTime("start_time")}
            >
              出勤
            </button>
            <button
              type="button"
              className={styles.btnLeave}
              disabled={saving}
              onClick={() => upsertAttendanceTime("end_time")}
            >
              退勤
            </button>
            <button
              type="button"
              className={styles.btnBreakOut}
              disabled={saving}
              onClick={() => upsertAttendanceTime("break_out_time")}
            >
              途中退出
            </button>
            <button
              type="button"
              className={styles.btnBreakIn}
              disabled={saving}
              onClick={() => upsertAttendanceTime("break_in_time")}
            >
              再入
            </button>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>現在進行中の案件一覧</h2>
        <div className={styles.tableFrame}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>案件名</th>
                <th>クライアント</th>
                <th>状態</th>
                <th>請求額</th>
                <th>請求月</th>
                <th>支払期日</th>
                <th>請求書</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7}>読み込み中...</td>
                </tr>
              ) : ongoingProjects.length === 0 ? (
                <tr>
                  <td colSpan={7}>対象案件がありません。</td>
                </tr>
              ) : (
                ongoingProjects.map((project) => (
                  <tr key={project.id}>
                    <td>{project.name}</td>
                    <td>{project.client_name}</td>
                    <td>{project.status != null ? (STATUS_LABELS[project.status] ?? String(project.status)) : "-"}</td>
                    <td>{formatCurrency(project.invoice_amount)}</td>
                    <td>{formatMonth(project.invoice_month)}</td>
                    <td>{project.payment_due_date ?? "-"}</td>
                    <td>{isBlank(project.invoice) ? "-" : "○"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>未請求の担当案件一覧</h2>
        <div className={styles.tableFrame}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>案件名</th>
                <th>クライアント</th>
                <th>状態</th>
                <th>請求額</th>
                <th>請求月</th>
                <th>支払期日</th>
                <th>請求書</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7}>読み込み中...</td>
                </tr>
              ) : unbilledProjects.length === 0 ? (
                <tr>
                  <td colSpan={7}>対象案件がありません。</td>
                </tr>
              ) : (
                unbilledProjects.map((project) => (
                  <tr key={project.id}>
                    <td>{project.name}</td>
                    <td>{project.client_name}</td>
                    <td>{project.status != null ? (STATUS_LABELS[project.status] ?? String(project.status)) : "-"}</td>
                    <td>{formatCurrency(project.invoice_amount)}</td>
                    <td>{formatMonth(project.invoice_month)}</td>
                    <td>{project.payment_due_date ?? "-"}</td>
                    <td>-</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}