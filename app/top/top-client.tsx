"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/app/utils/supabase/client";
import styles from "./top-client.module.css";

type Profile = {
  id: string;
  last_name: string | null;
  first_name: string | null;
  email: string | null;
  is_admin: number | null;
};

type Attendance = {
  id: string;
  profile_id: string;
  work_date: string;
  start_time: string | null;
  end_time: string | null;
};

type AttendanceBreak = {
  id: string;
  profile_id: string;
  work_date: string;
  break_out_time: string;
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
  planned_cost_approval_status: number | null;
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

type ProjectPlannedCostRow = {
  project_id: string;
  operating_person_months: number | string | null;
  amount: number | null;
};

type ReportRow = {
  work_date: string;
  hours: number | string;
};

type LeaveRequestRow = {
  id: string;
  profile_id: string;
  work_date: string;
  leave_type: number;
  approval_status: number;
  request_group_id: string;
  updated_at: string;
};

type AttendanceCorrectionRequestRow = {
  id: string;
  profile_id: string;
  work_date: string;
  approval_status: number;
  requested_at: string;
  reviewed_at: string | null;
};

type ProjectActualCostRow = {
  id: string;
  profile_id: string | null;
  expense_date: string | null;
  amount: number | null;
  purpose: string | null;
  application_status: number;
  request_group_id: string | null;
  updated_at: string;
};

type AlertItem = {
  title: string;
  description: string;
};

type AlertGroup = {
  key: "project" | "work" | "request";
  title: string;
  items: AlertItem[];
};

const STATUS_LABELS: Record<number, string> = {
  0: "保留",
  1: "営業中（高）",
  2: "営業中（中）",
  3: "営業中（低）",
  4: "営業中（最終調整）",
  5: "確定",
  6: "進行中",
  7: "完了",
  8: "滞留",
  9: "プリセールス(無償)",
  10: "社内案件(無償)",
  11: "失注",
};

const FULL_DAY_LEAVE_TYPES = new Set([0, 3, 4, 5]);

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

function formatDateSlash(value: string | null) {
  if (!value) return "-";
  return value.replaceAll("-", "/");
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

function toNumber(value: number | string | null | undefined) {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num : 0;
}

function getMonthStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function getMonday(date: Date) {
  const target = new Date(date);
  const day = target.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  target.setDate(target.getDate() + diff);
  target.setHours(0, 0, 0, 0);
  return target;
}

function formatDateArraySummary(dateKeys: string[]) {
  if (dateKeys.length === 0) return "";
  const labels = dateKeys.map((date) => formatDateSlash(date));
  if (labels.length <= 5) return labels.join("、");
  return `${labels.slice(0, 5).join("、")} ほか${labels.length - 5}日`;
}

function formatNameSummary(names: string[]) {
  if (names.length === 0) return "";
  if (names.length <= 3) return names.join("、");
  return `${names.slice(0, 3).join("、")} ほか${names.length - 3}件`;
}

async function fetchJapaneseHolidaySetSafe() {
  try {
    const response = await fetch("https://holidays-jp.github.io/api/v1/date.json", {
      cache: "force-cache",
    });
    if (!response.ok) return new Set<string>();
    const holidayJson = (await response.json()) as Record<string, string>;
    return new Set(Object.keys(holidayJson));
  } catch {
    return new Set<string>();
  }
}

function isBusinessDay(date: Date, holidaySet: Set<string>) {
  const day = date.getDay();
  if (day === 0 || day === 6) return false;
  return !holidaySet.has(getTodayDateString(date));
}

function isFullDayLeave(leaveType: number | null | undefined) {
  return FULL_DAY_LEAVE_TYPES.has(leaveType ?? -1);
}

export default function TopClient() {
  const supabase = createClient();

  const [now, setNow] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [alertsOpen, setAlertsOpen] = useState(false);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [attendance, setAttendance] = useState<Attendance | null>(null);
  const [attendanceBreaks, setAttendanceBreaks] = useState<AttendanceBreak[]>([]);
  const [attendanceMonthRows, setAttendanceMonthRows] = useState<Attendance[]>([]);
  const [ongoingProjects, setOngoingProjects] = useState<DisplayProject[]>([]);
  const [unbilledProjects, setUnbilledProjects] = useState<DisplayProject[]>([]);

  const [assignedProjects, setAssignedProjects] = useState<Project[]>([]);
  const [pendingPlannedCostApprovalProjects, setPendingPlannedCostApprovalProjects] = useState<Project[]>([]);
  const [projectPlannedCosts, setProjectPlannedCosts] = useState<ProjectPlannedCostRow[]>([]);
  const [reportRows, setReportRows] = useState<ReportRow[]>([]);
  const [approvedLeaveRows, setApprovedLeaveRows] = useState<LeaveRequestRow[]>([]);
  const [pendingLeaveRows, setPendingLeaveRows] = useState<LeaveRequestRow[]>([]);
  const [decisionLeaveRows, setDecisionLeaveRows] = useState<LeaveRequestRow[]>([]);
  const [pendingCorrectionRows, setPendingCorrectionRows] = useState<AttendanceCorrectionRequestRow[]>([]);
  const [decisionCorrectionRows, setDecisionCorrectionRows] = useState<AttendanceCorrectionRequestRow[]>([]);
  const [pendingExpenseRows, setPendingExpenseRows] = useState<ProjectActualCostRow[]>([]);
  const [decisionExpenseRows, setDecisionExpenseRows] = useState<ProjectActualCostRow[]>([]);
  const [holidaySet, setHolidaySet] = useState<Set<string>>(new Set());

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

      const today = new Date();
      const todayKey = getTodayDateString(today);
      const yesterday = addDays(today, -1);
      const yesterdayKey = getTodayDateString(yesterday);
      const currentMonthStart = getMonthStart(today);
      const currentMonthStartKey = getTodayDateString(currentMonthStart);

      const currentWeekStart = getMonday(today);
      const prevWeekStart = addDays(currentWeekStart, -7);
      const prevWeekEnd = addDays(prevWeekStart, 6);
      const prevWeekStartKey = getTodayDateString(prevWeekStart);
      const prevWeekEndKey = getTodayDateString(prevWeekEnd);

      const alertRangeStart = currentMonthStart <= prevWeekStart ? currentMonthStart : prevWeekStart;
      const alertRangeStartKey = getTodayDateString(alertRangeStart);

      const decisionSince = addDays(today, -14).toISOString();

      const { data: profileData, error: profileError } = await supabase
        .from("profiles_2")
        .select("id,last_name,first_name,email,is_admin")
        .eq("id", userId)
        .maybeSingle();

      if (profileError) throw new Error(profileError.message);

      const currentProfile = (profileData ?? null) as Profile | null;
      const isAdmin = currentProfile?.is_admin === 1;

      const emptyLeaveResult = Promise.resolve({
        data: [] as LeaveRequestRow[],
        error: null as null,
      });

      const emptyCorrectionResult = Promise.resolve({
        data: [] as AttendanceCorrectionRequestRow[],
        error: null as null,
      });

      const emptyExpenseResult = Promise.resolve({
        data: [] as ProjectActualCostRow[],
        error: null as null,
      });

      const [
        { data: attendanceData, error: attendanceError },
        { data: attendanceMonthData, error: attendanceMonthError },
        { data: attendanceBreakData, error: attendanceBreakError },
        { data: projectsData, error: projectsError },
        { data: projectMembersData, error: projectMembersError },
        { data: clientsData, error: clientsError },
        { data: plannedCostsData, error: plannedCostsError },
        { data: reportData, error: reportError },
        { data: approvedLeaveData, error: approvedLeaveError },
        { data: pendingLeaveData, error: pendingLeaveError },
        { data: decisionLeaveData, error: decisionLeaveError },
        { data: pendingCorrectionData, error: pendingCorrectionError },
        { data: decisionCorrectionData, error: decisionCorrectionError },
        { data: pendingExpenseData, error: pendingExpenseError },
        { data: decisionExpenseData, error: decisionExpenseError },
        holidayData,
      ] = await Promise.all([
        supabase
          .from("attendance")
          .select("id,profile_id,work_date,start_time,end_time")
          .eq("profile_id", userId)
          .eq("work_date", todayKey)
          .maybeSingle(),
        supabase
          .from("attendance")
          .select("id,profile_id,work_date,start_time,end_time")
          .eq("profile_id", userId)
          .gte("work_date", currentMonthStartKey)
          .lte("work_date", yesterdayKey)
          .order("work_date", { ascending: true }),
        supabase
          .from("attendance_break")
          .select("id,profile_id,work_date,break_out_time,break_in_time")
          .eq("profile_id", userId)
          .eq("work_date", todayKey)
          .order("break_out_time", { ascending: true }),
        supabase
          .from("project")
          .select(
            "id,name,client_id,status,invoice_amount,invoice_month,payment_due_date,invoice,project_manager_id,planned_cost_approval_status"
          )
          .order("updated_at", { ascending: false }),
        supabase.from("project_member").select("project_id,profile_id"),
        supabase.from("client").select("id,name"),
        supabase.from("project_planned_cost").select("project_id,operating_person_months,amount"),
        supabase
          .from("report")
          .select("work_date,hours")
          .eq("profile_id", userId)
          .gte("work_date", prevWeekStartKey)
          .lte("work_date", prevWeekEndKey),
        supabase
          .from("leave_request")
          .select("id,profile_id,work_date,leave_type,approval_status,request_group_id,updated_at")
          .eq("profile_id", userId)
          .eq("approval_status", 1)
          .gte("work_date", alertRangeStartKey)
          .lte("work_date", yesterdayKey),
        isAdmin
          ? supabase
              .from("leave_request")
              .select("id,profile_id,work_date,leave_type,approval_status,request_group_id,updated_at")
              .eq("approval_status", 0)
          : emptyLeaveResult,
        supabase
          .from("leave_request")
          .select("id,profile_id,work_date,leave_type,approval_status,request_group_id,updated_at")
          .eq("profile_id", userId)
          .in("approval_status", [1, 2])
          .gte("updated_at", decisionSince),
        isAdmin
          ? supabase
              .from("attendance_correction_request")
              .select("id,profile_id,work_date,approval_status,requested_at,reviewed_at")
              .eq("approval_status", 0)
          : emptyCorrectionResult,
        supabase
          .from("attendance_correction_request")
          .select("id,profile_id,work_date,approval_status,requested_at,reviewed_at")
          .eq("profile_id", userId)
          .in("approval_status", [1, 2])
          .not("reviewed_at", "is", null)
          .gte("reviewed_at", decisionSince),
        isAdmin
          ? supabase
              .from("project_actual_cost")
              .select("id,profile_id,expense_date,amount,purpose,application_status,request_group_id,updated_at")
              .eq("application_status", 0)
          : emptyExpenseResult,
        supabase
          .from("project_actual_cost")
          .select("id,profile_id,expense_date,amount,purpose,application_status,request_group_id,updated_at")
          .eq("profile_id", userId)
          .in("application_status", [1, 2])
          .gte("updated_at", decisionSince),
        fetchJapaneseHolidaySetSafe(),
      ]);

      if (attendanceError) throw new Error(attendanceError.message);
      if (attendanceMonthError) throw new Error(attendanceMonthError.message);
      if (attendanceBreakError) throw new Error(attendanceBreakError.message);
      if (projectsError) throw new Error(projectsError.message);
      if (projectMembersError) throw new Error(projectMembersError.message);
      if (clientsError) throw new Error(clientsError.message);
      if (plannedCostsError) throw new Error(plannedCostsError.message);
      if (reportError) throw new Error(reportError.message);
      if (approvedLeaveError) throw new Error(approvedLeaveError.message);
      if (pendingLeaveError) throw new Error(pendingLeaveError.message);
      if (decisionLeaveError) throw new Error(decisionLeaveError.message);
      if (pendingCorrectionError) throw new Error(pendingCorrectionError.message);
      if (decisionCorrectionError) throw new Error(decisionCorrectionError.message);
      if (pendingExpenseError) throw new Error(pendingExpenseError.message);
      if (decisionExpenseError) throw new Error(decisionExpenseError.message);

      const todayAttendance = (attendanceData ?? null) as Attendance | null;
      const monthAttendance = (attendanceMonthData ?? []) as Attendance[];
      const todayAttendanceBreaks = (attendanceBreakData ?? []) as AttendanceBreak[];
      const projects = (projectsData ?? []) as Project[];
      const projectMembers = (projectMembersData ?? []) as ProjectMember[];
      const clients = (clientsData ?? []) as ClientRow[];

      setProfile(currentProfile);
      setAttendance(todayAttendance);
      setAttendanceMonthRows(monthAttendance);
      setAttendanceBreaks(todayAttendanceBreaks);
      setProjectPlannedCosts((plannedCostsData ?? []) as ProjectPlannedCostRow[]);
      setReportRows((reportData ?? []) as ReportRow[]);
      setApprovedLeaveRows((approvedLeaveData ?? []) as LeaveRequestRow[]);
      setPendingLeaveRows((pendingLeaveData ?? []) as LeaveRequestRow[]);
      setDecisionLeaveRows((decisionLeaveData ?? []) as LeaveRequestRow[]);
      setPendingCorrectionRows((pendingCorrectionData ?? []) as AttendanceCorrectionRequestRow[]);
      setDecisionCorrectionRows((decisionCorrectionData ?? []) as AttendanceCorrectionRequestRow[]);
      setPendingExpenseRows((pendingExpenseData ?? []) as ProjectActualCostRow[]);
      setDecisionExpenseRows((decisionExpenseData ?? []) as ProjectActualCostRow[]);
      setHolidaySet(holidayData);

      const clientMap = new Map(clients.map((client) => [client.id, client.name]));
      const memberProjectIds = new Set(
        projectMembers.filter((row) => row.profile_id === userId).map((row) => row.project_id)
      );

      const nextAssignedProjects = projects.filter(
        (project) => project.project_manager_id === userId || memberProjectIds.has(project.id)
      );

      const assignedDisplayProjects: DisplayProject[] = nextAssignedProjects.map((project) => ({
        id: project.id,
        name: project.name,
        client_name: project.client_id ? clientMap.get(project.client_id) ?? "-" : "-",
        status: project.status,
        invoice_amount: project.invoice_amount,
        invoice_month: project.invoice_month,
        payment_due_date: project.payment_due_date,
        invoice: project.invoice,
      }));

      setAssignedProjects(nextAssignedProjects);
      setOngoingProjects(assignedDisplayProjects.filter((project) => project.status === 6));
      setUnbilledProjects(assignedDisplayProjects.filter((project) => isBlank(project.invoice)));
      setPendingPlannedCostApprovalProjects(
        projects.filter((project) => project.planned_cost_approval_status === 1)
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  const hasOpenBreak = useMemo(
    () => attendanceBreaks.some((row) => row.break_out_time && !row.break_in_time),
    [attendanceBreaks]
  );

  const breakOutHistoryText = useMemo(() => {
    if (attendanceBreaks.length === 0) return "--:--:--";
    return attendanceBreaks.map((row) => formatTime(row.break_out_time)).join(" / ");
  }, [attendanceBreaks]);

  const breakInHistoryText = useMemo(() => {
    if (attendanceBreaks.length === 0) return "--:--:--";
    return attendanceBreaks.map((row) => formatTime(row.break_in_time)).join(" / ");
  }, [attendanceBreaks]);

  const saveAttendanceField = async (field: "start_time" | "end_time") => {
    setSaving(true);
    setMessage("");

    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw new Error(authError.message);

      const userId = authData.user?.id;
      if (!userId) throw new Error("ログインユーザーを取得できません。");

      const today = getTodayDateString(new Date());
      const nowText = formatNow(new Date());

      if (field === "start_time" && attendance?.start_time) {
        throw new Error("本日はすでに出勤打刻済みです。");
      }

      if (field === "end_time") {
        if (!attendance?.start_time) {
          throw new Error("先に出勤打刻を行ってください。");
        }
        if (attendance.end_time) {
          throw new Error("本日はすでに退勤打刻済みです。");
        }
        if (hasOpenBreak) {
          throw new Error("外出中です。再入してから退勤してください。");
        }
      }

      if (attendance?.id) {
        const { error } = await supabase
          .from("attendance")
          .update({
            [field]: nowText,
            updated_by: userId,
          })
          .eq("id", attendance.id);

        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabase.from("attendance").insert({
          profile_id: userId,
          work_date: today,
          [field]: nowText,
          updated_by: userId,
        });

        if (error) throw new Error(error.message);
      }

      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  const addBreakOut = async () => {
    setSaving(true);
    setMessage("");

    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw new Error(authError.message);

      const userId = authData.user?.id;
      if (!userId) throw new Error("ログインユーザーを取得できません。");

      const today = getTodayDateString(new Date());
      const nowText = formatNow(new Date());

      if (!attendance?.start_time) {
        throw new Error("先に出勤打刻を行ってください。");
      }
      if (attendance.end_time) {
        throw new Error("退勤後は途中退出できません。");
      }
      if (hasOpenBreak) {
        throw new Error("未再入の途中退出があります。先に再入してください。");
      }

      const { error } = await supabase.from("attendance_break").insert({
        profile_id: userId,
        work_date: today,
        break_out_time: nowText,
        updated_by: userId,
      });

      if (error) throw new Error(error.message);

      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  const addBreakIn = async () => {
    setSaving(true);
    setMessage("");

    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw new Error(authError.message);

      const userId = authData.user?.id;
      if (!userId) throw new Error("ログインユーザーを取得できません。");

      const nowText = formatNow(new Date());
      const openBreak = [...attendanceBreaks].reverse().find((row) => !row.break_in_time);

      if (!attendance?.start_time) {
        throw new Error("先に出勤打刻を行ってください。");
      }
      if (attendance.end_time) {
        throw new Error("退勤後は再入できません。");
      }
      if (!openBreak) {
        throw new Error("再入対象の途中退出がありません。");
      }

      const { error } = await supabase
        .from("attendance_break")
        .update({
          break_in_time: nowText,
          updated_by: userId,
        })
        .eq("id", openBreak.id);

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
    if (hasOpenBreak) return "外出中";
    return `出勤中：${formatTime(attendance.start_time)}`;
  }, [attendance, hasOpenBreak]);

  const canStart = !saving && !attendance?.start_time;
  const canEnd = !saving && !!attendance?.start_time && !attendance?.end_time && !hasOpenBreak;
  const canBreakOut = !saving && !!attendance?.start_time && !attendance?.end_time && !hasOpenBreak;
  const canBreakIn = !saving && !!attendance?.start_time && !attendance?.end_time && hasOpenBreak;

  const finalAlertGroups = useMemo<AlertGroup[]>(() => {
    const today = new Date();
    const currentMonthStart = getMonthStart(today);
    const yesterday = addDays(today, -1);

    const currentWeekStart = getMonday(today);
    const prevWeekStart = addDays(currentWeekStart, -7);
    const prevWeekEnd = addDays(prevWeekStart, 6);

    const leaveMap = new Map(approvedLeaveRows.map((row) => [row.work_date, row]));

    const reportHoursByDate = new Map<string, number>();
    for (const row of reportRows) {
      reportHoursByDate.set(row.work_date, (reportHoursByDate.get(row.work_date) ?? 0) + toNumber(row.hours));
    }

    const projectItems: AlertItem[] = [];
    const workItems: AlertItem[] = [];
    const requestItems: AlertItem[] = [];

    const invoiceRequiredProjects = assignedProjects.filter((project) =>
      [5, 6, 7].includes(project.status ?? -1)
    );

    const currentMonthFirstDay = getMonthStart(today);
    const overdueInvoiceProjects = invoiceRequiredProjects.filter((project) => {
      if (!project.invoice_month) return false;
      const invoiceMonthDate = new Date(`${project.invoice_month}T00:00:00`);
      if (Number.isNaN(invoiceMonthDate.getTime())) return false;
      return invoiceMonthDate < currentMonthFirstDay && isBlank(project.invoice);
    });

    if (overdueInvoiceProjects.length > 0) {
      projectItems.push({
        title: `請求月超過・請求書未アップが${overdueInvoiceProjects.length}件あります`,
        description: formatNameSummary(overdueInvoiceProjects.map((project) => project.name)),
      });
    }

    const plannedCostProjectSet = new Set(
      projectPlannedCosts
        .filter(
          (row) =>
            row.project_id &&
            (toNumber(row.operating_person_months) > 0 || row.amount != null)
        )
        .map((row) => row.project_id)
    );

    const noPlannedCostProjects = invoiceRequiredProjects.filter(
      (project) => !plannedCostProjectSet.has(project.id)
    );

    if (noPlannedCostProjects.length > 0) {
      projectItems.push({
        title: `予定工数未入力の案件が${noPlannedCostProjects.length}件あります`,
        description: formatNameSummary(noPlannedCostProjects.map((project) => project.name)),
      });
    }

    const noInvoiceAmountProjects = invoiceRequiredProjects.filter(
      (project) => project.invoice_amount == null
    );

    if (noInvoiceAmountProjects.length > 0) {
      projectItems.push({
        title: `請求金額未入力の案件が${noInvoiceAmountProjects.length}件あります`,
        description: formatNameSummary(noInvoiceAmountProjects.map((project) => project.name)),
      });
    }

    const missingReportDates: string[] = [];
    let reportCursor = new Date(prevWeekStart);
    while (reportCursor <= prevWeekEnd) {
      const dateKey = getTodayDateString(reportCursor);
      const leave = leaveMap.get(dateKey);
      const shouldSkip = !isBusinessDay(reportCursor, holidaySet) || isFullDayLeave(leave?.leave_type);

      if (!shouldSkip && (reportHoursByDate.get(dateKey) ?? 0) <= 0) {
        missingReportDates.push(dateKey);
      }

      reportCursor = addDays(reportCursor, 1);
    }

    if (missingReportDates.length > 0) {
      workItems.push({
        title: `先週分の業務報告未入力が${missingReportDates.length}日あります`,
        description: formatDateArraySummary(missingReportDates),
      });
    }

    const attendanceMap = new Map(attendanceMonthRows.map((row) => [row.work_date, row]));
    const missingAttendanceDates: string[] = [];
    let attendanceCursor = new Date(currentMonthStart);
    while (attendanceCursor <= yesterday) {
      const dateKey = getTodayDateString(attendanceCursor);
      const leave = leaveMap.get(dateKey);
      const shouldSkip = !isBusinessDay(attendanceCursor, holidaySet) || isFullDayLeave(leave?.leave_type);
      const dayAttendance = attendanceMap.get(dateKey);

      if (
        !shouldSkip &&
        (!dayAttendance || !dayAttendance.start_time || !dayAttendance.end_time)
      ) {
        missingAttendanceDates.push(dateKey);
      }

      attendanceCursor = addDays(attendanceCursor, 1);
    }

    if (missingAttendanceDates.length > 0) {
      workItems.push({
        title: `勤怠の未入力が${missingAttendanceDates.length}日あります`,
        description: `当月過去分: ${formatDateArraySummary(missingAttendanceDates)}`,
      });
    }

    if (profile?.is_admin === 1) {
      const pendingLeaveGroupCount = new Set(
        pendingLeaveRows.map((row) => row.request_group_id)
      ).size;
      const pendingCorrectionCount = pendingCorrectionRows.length;
      const pendingExpenseGroupCount = new Set(
        pendingExpenseRows.map((row) => row.request_group_id ?? row.id)
      ).size;

      if (pendingLeaveGroupCount > 0) {
        requestItems.push({
          title: `休暇申請の未対応が${pendingLeaveGroupCount}件あります`,
          description: "管理者対応が必要です。",
        });
      }

      if (pendingCorrectionCount > 0) {
        requestItems.push({
          title: `打刻変更申請の未対応が${pendingCorrectionCount}件あります`,
          description: "管理者対応が必要です。",
        });
      }

      if (pendingExpenseGroupCount > 0) {
        requestItems.push({
          title: `経費申請の未対応が${pendingExpenseGroupCount}件あります`,
          description: "管理者対応が必要です。",
        });
      }

      if (pendingPlannedCostApprovalProjects.length > 0) {
        requestItems.push({
          title: `予定工数確認依頼の未対応が${pendingPlannedCostApprovalProjects.length}件あります`,
          description: formatNameSummary(pendingPlannedCostApprovalProjects.map((project) => project.name)),
        });
      }
    }

    const approvedLeaveCount = decisionLeaveRows.filter((row) => row.approval_status === 1).length;
    const rejectedLeaveCount = decisionLeaveRows.filter((row) => row.approval_status === 2).length;
    if (approvedLeaveCount + rejectedLeaveCount > 0) {
      requestItems.push({
        title: `休暇申請の承認/否認通知が${approvedLeaveCount + rejectedLeaveCount}件あります`,
        description: `承認 ${approvedLeaveCount}件 / 否認 ${rejectedLeaveCount}件`,
      });
    }

    const approvedCorrectionCount = decisionCorrectionRows.filter((row) => row.approval_status === 1).length;
    const rejectedCorrectionCount = decisionCorrectionRows.filter((row) => row.approval_status === 2).length;
    if (approvedCorrectionCount + rejectedCorrectionCount > 0) {
      requestItems.push({
        title: `打刻変更申請の承認/否認通知が${approvedCorrectionCount + rejectedCorrectionCount}件あります`,
        description: `承認 ${approvedCorrectionCount}件 / 否認 ${rejectedCorrectionCount}件`,
      });
    }

    const approvedExpenseCount = decisionExpenseRows.filter((row) => row.application_status === 1).length;
    const rejectedExpenseCount = decisionExpenseRows.filter((row) => row.application_status === 2).length;
    if (approvedExpenseCount + rejectedExpenseCount > 0) {
      requestItems.push({
        title: `経費申請の承認/否認通知が${approvedExpenseCount + rejectedExpenseCount}件あります`,
        description: `承認 ${approvedExpenseCount}件 / 否認 ${rejectedExpenseCount}件`,
      });
    }

    const groups: AlertGroup[] = [
      { key: "project", title: "案件", items: projectItems },
      { key: "work", title: "勤怠・業務報告", items: workItems },
      { key: "request", title: "申請", items: requestItems },
    ];

    return groups.filter((group) => group.items.length > 0);
  }, [
    approvedLeaveRows,
    assignedProjects,
    attendanceMonthRows,
    decisionCorrectionRows,
    decisionExpenseRows,
    decisionLeaveRows,
    holidaySet,
    pendingCorrectionRows,
    pendingExpenseRows,
    pendingLeaveRows,
    pendingPlannedCostApprovalProjects,
    profile?.is_admin,
    projectPlannedCosts,
    reportRows,
  ]);

  const totalAlertCount = useMemo(
    () => finalAlertGroups.reduce((sum, group) => sum + group.items.length, 0),
    [finalAlertGroups]
  );

  return (
    <main className={styles.page}>
      {message && <p className={styles.message}>{message}</p>}

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <h2 className={styles.sectionTitle}>打刻・勤怠ステータス</h2>
            {profile && <p className={styles.userText}>{fullName(profile)}</p>}
          </div>
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
              <span className={styles.timeLabel}>退出履歴</span>
              <span className={styles.timeValue}>{breakOutHistoryText}</span>
            </div>
            <div className={styles.timeRow}>
              <span className={styles.timeLabel}>再入履歴</span>
              <span className={styles.timeValue}>{breakInHistoryText}</span>
            </div>
          </div>

          <div className={styles.attendanceButtons}>
            <button
              type="button"
              className={styles.btnAttendance}
              disabled={!canStart}
              onClick={() => saveAttendanceField("start_time")}
            >
              出勤
            </button>
            <button
              type="button"
              className={styles.btnLeave}
              disabled={!canEnd}
              onClick={() => saveAttendanceField("end_time")}
            >
              退勤
            </button>
            <button
              type="button"
              className={styles.btnBreakOut}
              disabled={!canBreakOut}
              onClick={addBreakOut}
            >
              途中退出
            </button>
            <button
              type="button"
              className={styles.btnBreakIn}
              disabled={!canBreakIn}
              onClick={addBreakIn}
            >
              再入
            </button>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <button
          type="button"
          className={styles.alertToggle}
          onClick={() => setAlertsOpen((current) => !current)}
        >
          <span className={styles.alertToggleLeft}>
            <span className={styles.alertHamburger}>☰</span>
            <span className={styles.alertToggleTitle}>アラート</span>
            <span className={styles.alertCountBadge}>{totalAlertCount}</span>
          </span>
          <span className={styles.alertChevron}>{alertsOpen ? "▾" : "▸"}</span>
        </button>

        {alertsOpen && (
          <div className={styles.alertPanel}>
            {loading ? (
              <div className={styles.alertEmpty}>読み込み中...</div>
            ) : finalAlertGroups.length === 0 ? (
              <div className={styles.alertEmpty}>現在アラートはありません。</div>
            ) : (
              <div className={styles.alertGroupList}>
                {finalAlertGroups.map((group) => (
                  <div key={group.key} className={styles.alertGroupCard}>
                    <div className={styles.alertGroupTitle}>{group.title}</div>
                    <div className={styles.alertItemList}>
                      {group.items.map((item, index) => (
                        <div key={`${group.key}-${index}`} className={styles.alertItem}>
                          <div className={styles.alertItemTitle}>{item.title}</div>
                          <div className={styles.alertItemDescription}>{item.description}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
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
                    <td>
                      <Link href={`/project/${project.id}`} className={styles.projectLink}>
                        {project.name}
                      </Link>
                    </td>
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
                    <td>
                      <Link href={`/project/${project.id}`} className={styles.projectLink}>
                        {project.name}
                      </Link>
                    </td>
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