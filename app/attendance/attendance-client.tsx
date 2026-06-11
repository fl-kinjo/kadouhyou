"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/app/utils/supabase/client";
import styles from "./attendance-client.module.css";

type AttendanceRow = {
  id: string;
  profile_id: string;
  work_date: string;
  start_time: string | null;
  end_time: string | null;
};

type AttendanceBreakRow = {
  id: string;
  profile_id: string;
  work_date: string;
  break_out_time: string;
  break_in_time: string | null;
};

type LeaveRequestRow = {
  id: string;
  profile_id: string;
  work_date: string;
  leave_type: number;
  approval_status: number;
  request_group_id: string | null;
  comment: string | null;
  created_at: string;
};

type AttendanceCorrectionRequestRow = {
  id: string;
  profile_id: string;
  work_date: string;
  before_start_time: string | null;
  before_end_time: string | null;
  before_away_minutes: number | null;
  before_status_label: string | null;
  requested_start_time: string | null;
  requested_end_time: string | null;
  requested_away_minutes: number | null;
  requested_status_label: string | null;
  comment: string | null;
  approval_status: number;
  requested_at: string;
};

type DayRow = {
  dateKey: string;
  dayLabel: string;
  weekday: number;
  startTime: string | null;
  endTime: string | null;
  awayMinutes: number | null;
  workMinutes: number | null;
  overtimeMinutes: number | null;
  statusLabel: string;
  statusType:
    | "work"
    | "holiday"
    | "paid"
    | "am"
    | "pm"
    | "summer"
    | "special"
    | "unpaid"
    | "missing"
    | "correctionPending"
    | "correctionRejected"
    | "correctionCanceled"
    | "leavePending"
    | "leaveRejected"
    | "leaveCanceled"
    | "none";
  isFuture: boolean;
  hasPendingRequest: boolean;
};

type CorrectionFormState = {
  work_date: string;
  start_time: string;
  end_time: string;
  away_duration: string;
  status_label: string;
  comment: string;
};

const LEAVE_TYPE_OPTIONS = [
  { value: 0, label: "有給" },
  { value: 1, label: "午前休" },
  { value: 2, label: "午後休" },
  { value: 3, label: "特別休暇" },
  { value: 4, label: "無給" },
  { value: 5, label: "夏休" },
] as const;

const LEAVE_TYPE_LABELS: Record<number, string> = {
  0: "有給",
  1: "午前休",
  2: "午後休",
  3: "特別休暇",
  4: "無給",
  5: "夏休",
};

const APPROVAL_STATUS = {
  pending: 0,
  approved: 1,
  rejected: 2,
  canceled: 3,
} as const;

const CORRECTION_STATUS_OPTIONS = [
  { value: "出勤", label: "出勤" },
  ...LEAVE_TYPE_OPTIONS,
] as const;

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

function formatTime(value: string | null) {
  if (!value) return "-";
  return value.slice(0, 5);
}

function parseTimeToMinutes(value: string | null) {
  if (!value) return null;
  const text = value.slice(0, 5);
  const [hh, mm] = text.split(":").map(Number);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  return hh * 60 + mm;
}

function getLunchBreakMinutes(startTime: string | null, endTime: string | null) {
  const start = parseTimeToMinutes(startTime);
  const end = parseTimeToMinutes(endTime);

  if (start == null || end == null || end <= start) return 0;

  const lunchStart = 12 * 60;
  const lunchEnd = 13 * 60;

  const overlapStart = Math.max(start, lunchStart);
  const overlapEnd = Math.min(end, lunchEnd);

  return Math.max(0, overlapEnd - overlapStart);
}

function formatDuration(minutes: number | null) {
  if (minutes == null) return "-";
  const safe = Math.max(0, minutes);
  const hh = String(Math.floor(safe / 60)).padStart(2, "0");
  const mm = String(safe % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

function formatSummaryDuration(minutes: number) {
  const safe = Math.max(0, minutes);
  const hh = String(Math.floor(safe / 60)).padStart(2, "0");
  const mm = String(safe % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

function parseDurationToMinutes(value: string) {
  const text = value.trim();
  if (!text) return 0;

  const parts = text.split(":");
  if (parts.length !== 2) return null;

  const hh = Number(parts[0]);
  const mm = Number(parts[1]);

  if (!Number.isFinite(hh) || !Number.isFinite(mm) || hh < 0 || mm < 0 || mm >= 60) {
    return null;
  }

  return hh * 60 + mm;
}

function getWorkedMinutes(startTime: string | null, endTime: string | null, awayMinutes: number | null) {
  const start = parseTimeToMinutes(startTime);
  const end = parseTimeToMinutes(endTime);
  if (start == null || end == null || end < start) return null;

  const away = Math.max(0, awayMinutes ?? 0);
  const lunchBreak = getLunchBreakMinutes(startTime, endTime);

  return Math.max(0, end - start - lunchBreak - away);
}

function getOvertimeMinutes(workMinutes: number | null) {
  if (workMinutes == null) return null;
  return Math.max(0, workMinutes - 8 * 60);
}

function getLeaveTypeLabel(value: number) {
  return LEAVE_TYPE_LABELS[value] ?? String(value);
}

function getLeaveTypeFromLabel(label: string | null | undefined) {
  const value = label?.trim();

  switch (value) {
    case "有給":
      return 0;
    case "午前休":
    case "午前半休":
      return 1;
    case "午後休":
    case "午後半休":
      return 2;
    case "特別休暇":
      return 3;
    case "無給":
      return 4;
    case "夏休":
      return 5;
    default:
      return null;
  }
}

function isLeaveStatusLabel(label: string | null | undefined) {
  return getLeaveTypeFromLabel(label) !== null;
}

function normalizeFormStatusLabel(label: string | null | undefined) {
  const value = label?.trim();

  if (value === "出勤") return "出勤";

  const leaveType = getLeaveTypeFromLabel(value);
  if (leaveType !== null) return getLeaveTypeLabel(leaveType);

  return "出勤";
}

function normalizeCorrectionStatusLabel(label: string | null | undefined) {
  const value = label?.trim();

  if (value === "出勤") {
    return "出勤";
  }

  return "出勤";
}

function getStatusTypeFromLabel(
  label: string
):
  | "work"
  | "holiday"
  | "paid"
  | "am"
  | "pm"
  | "summer"
  | "special"
  | "unpaid"
  | "missing"
  | "correctionPending"
  | "correctionRejected"
  | "correctionCanceled"
  | "leavePending"
  | "leaveRejected"
  | "leaveCanceled"
  | "none" {
  switch (label) {
    case "出勤":
      return "work";
    case "休日":
      return "holiday";
    case "有給":
      return "paid";
    case "午前休":
    case "午前半休":
      return "am";
    case "午後休":
    case "午後半休":
      return "pm";
    case "夏休":
      return "summer";
    case "特別休暇":
      return "special";
    case "無給":
      return "unpaid";
    case "未入力":
      return "missing";
    case "修正申請中":
      return "correctionPending";
    case "申請却下":
      return "correctionRejected";
    case "申請取消":
      return "correctionCanceled";
    case "休暇申請中":
      return "leavePending";
    case "休暇申請却下":
      return "leaveRejected";
    case "休暇申請取消":
      return "leaveCanceled";
    case "":
      return "none";
    default:
      return "none";
  }
}

function getStatusInfo(params: {
  isFuture: boolean;
  isHoliday: boolean;
  leaveRequest: LeaveRequestRow | null;
  hasAttendance: boolean;
  correctionRequest: AttendanceCorrectionRequestRow | null;
}) {
  const { isFuture, isHoliday, leaveRequest, hasAttendance, correctionRequest } = params;

  if (isFuture) {
    return { label: "", type: "none" as const };
  }

  if (correctionRequest?.approval_status === APPROVAL_STATUS.pending) {
    return { label: "修正申請中", type: "correctionPending" as const };
  }

  if (correctionRequest?.approval_status === APPROVAL_STATUS.rejected) {
    return { label: "申請却下", type: "correctionRejected" as const };
  }

  if (correctionRequest?.approval_status === APPROVAL_STATUS.canceled) {
    return { label: "申請取消", type: "correctionCanceled" as const };
  }

  if (correctionRequest?.approval_status === APPROVAL_STATUS.approved) {
    const label = normalizeCorrectionStatusLabel(correctionRequest.requested_status_label);
    return { label, type: getStatusTypeFromLabel(label) };
  }

  if (leaveRequest?.approval_status === APPROVAL_STATUS.pending) {
    return { label: "休暇申請中", type: "leavePending" as const };
  }

  if (leaveRequest?.approval_status === APPROVAL_STATUS.rejected) {
    return { label: "休暇申請却下", type: "leaveRejected" as const };
  }

  if (leaveRequest?.approval_status === APPROVAL_STATUS.canceled) {
    return { label: "休暇申請取消", type: "leaveCanceled" as const };
  }

  if (leaveRequest?.approval_status === APPROVAL_STATUS.approved) {
    const label = getLeaveTypeLabel(leaveRequest.leave_type);
    return { label, type: getStatusTypeFromLabel(label) };
  }

  if (isHoliday) {
    return { label: "休日", type: "holiday" as const };
  }

  if (hasAttendance) {
    return { label: "出勤", type: "work" as const };
  }

  return { label: "未入力", type: "missing" as const };
}

function formatDateForPopup(dateKey: string) {
  const date = new Date(`${dateKey}T00:00:00`);
  const week = ["日", "月", "火", "水", "木", "金", "土"][date.getDay()];
  return `${date.getMonth() + 1}月${date.getDate()}日（${week}）`;
}

function getAwayMinutesByDate(rows: AttendanceBreakRow[]) {
  const map = new Map<string, number>();

  for (const row of rows) {
    const out = parseTimeToMinutes(row.break_out_time);
    const back = parseTimeToMinutes(row.break_in_time);
    if (out == null || back == null || back < out) continue;

    map.set(row.work_date, (map.get(row.work_date) ?? 0) + (back - out));
  }

  return map;
}

function getLatestCorrectionRequestMap(rows: AttendanceCorrectionRequestRow[]) {
  const map = new Map<string, AttendanceCorrectionRequestRow>();

  for (const row of rows) {
    const current = map.get(row.work_date);
    if (!current || current.requested_at < row.requested_at) {
      map.set(row.work_date, row);
    }
  }

  return map;
}

function getLatestLeaveRequestMap(rows: LeaveRequestRow[]) {
  const map = new Map<string, LeaveRequestRow>();

  for (const row of rows) {
    const current = map.get(row.work_date);
    if (!current || current.created_at < row.created_at) {
      map.set(row.work_date, row);
    }
  }

  return map;
}

function createRequestGroupId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export default function AttendanceClient() {
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [displayMonth, setDisplayMonth] = useState(() => getMonthStart(new Date()));

  const [attendanceRows, setAttendanceRows] = useState<AttendanceRow[]>([]);
  const [attendanceBreakRows, setAttendanceBreakRows] = useState<AttendanceBreakRow[]>([]);
  const [leaveRows, setLeaveRows] = useState<LeaveRequestRow[]>([]);
  const [correctionRows, setCorrectionRows] = useState<AttendanceCorrectionRequestRow[]>([]);
  const [holidaySet, setHolidaySet] = useState<Set<string>>(new Set());

  const [editTarget, setEditTarget] = useState<DayRow | null>(null);
  const [requestSaving, setRequestSaving] = useState(false);
  const [requestCompleteOpen, setRequestCompleteOpen] = useState(false);
  const [requestCompleteMessage, setRequestCompleteMessage] = useState("申請が完了しました");
  const [editForm, setEditForm] = useState<CorrectionFormState>({
    work_date: "",
    start_time: "",
    end_time: "",
    away_duration: "",
    status_label: "出勤",
    comment: "",
  });

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
      const from = getDateKey(monthStart);
      const to = getDateKey(monthEnd);

      const [
        { data: attendanceData, error: attendanceError },
        { data: attendanceBreakData, error: attendanceBreakError },
        { data: leaveData, error: leaveError },
        { data: correctionData, error: correctionError },
      ] = await Promise.all([
        supabase
          .from("attendance")
          .select("id,profile_id,work_date,start_time,end_time")
          .eq("profile_id", userId)
          .gte("work_date", from)
          .lte("work_date", to)
          .order("work_date", { ascending: true }),
        supabase
          .from("attendance_break")
          .select("id,profile_id,work_date,break_out_time,break_in_time")
          .eq("profile_id", userId)
          .gte("work_date", from)
          .lte("work_date", to)
          .order("work_date", { ascending: true })
          .order("break_out_time", { ascending: true }),
        supabase
          .from("leave_request")
          .select("id,profile_id,work_date,leave_type,approval_status,request_group_id,comment,created_at")
          .eq("profile_id", userId)
          .gte("work_date", from)
          .lte("work_date", to)
          .in("approval_status", [0, 1, 2, 3])
          .order("work_date", { ascending: true })
          .order("created_at", { ascending: false }),
        supabase
          .from("attendance_correction_request")
          .select(
            "id,profile_id,work_date,before_start_time,before_end_time,before_away_minutes,before_status_label,requested_start_time,requested_end_time,requested_away_minutes,requested_status_label,comment,approval_status,requested_at"
          )
          .eq("profile_id", userId)
          .gte("work_date", from)
          .lte("work_date", to)
          .in("approval_status", [0, 1, 2, 3])
          .order("requested_at", { ascending: false }),
      ]);

      if (attendanceError) throw new Error(attendanceError.message);
      if (attendanceBreakError) throw new Error(attendanceBreakError.message);
      if (leaveError) throw new Error(leaveError.message);
      if (correctionError) throw new Error(correctionError.message);

      setAttendanceRows((attendanceData ?? []) as AttendanceRow[]);
      setAttendanceBreakRows((attendanceBreakData ?? []) as AttendanceBreakRow[]);
      setLeaveRows((leaveData ?? []) as LeaveRequestRow[]);
      setCorrectionRows((correctionData ?? []) as AttendanceCorrectionRequestRow[]);

      const holidayResponse = await fetch("https://holidays-jp.github.io/api/v1/date.json", {
        cache: "force-cache",
      });
      if (!holidayResponse.ok) {
        throw new Error("祝日データの取得に失敗しました。");
      }
      const holidayJson = (await holidayResponse.json()) as Record<string, string>;
      setHolidaySet(new Set(Object.keys(holidayJson)));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }, [displayMonth, supabase]);

  useEffect(() => {
    load();
  }, [load]);

  const todayKey = useMemo(() => getDateKey(new Date()), []);
  const awayMinutesMap = useMemo(() => getAwayMinutesByDate(attendanceBreakRows), [attendanceBreakRows]);
  const latestCorrectionMap = useMemo(() => getLatestCorrectionRequestMap(correctionRows), [correctionRows]);
  const latestLeaveMap = useMemo(() => getLatestLeaveRequestMap(leaveRows), [leaveRows]);

  const dayRows = useMemo<DayRow[]>(() => {
    const attendanceMap = new Map(attendanceRows.map((row) => [row.work_date, row]));

    const result: DayRow[] = [];
    const monthStart = getMonthStart(displayMonth);
    const monthEnd = getMonthEnd(displayMonth);

    for (let day = 1; day <= monthEnd.getDate(); day += 1) {
      const current = new Date(monthStart.getFullYear(), monthStart.getMonth(), day);
      const dateKey = getDateKey(current);
      const attendance = attendanceMap.get(dateKey) ?? null;
      const latestCorrection = latestCorrectionMap.get(dateKey) ?? null;
      const latestLeaveRequest = latestLeaveMap.get(dateKey) ?? null;

      const approvedCorrection =
        latestCorrection?.approval_status === APPROVAL_STATUS.approved ? latestCorrection : null;

      const pendingCorrection =
        latestCorrection?.approval_status === APPROVAL_STATUS.pending ? latestCorrection : null;

      const pendingLeaveRequest =
        latestLeaveRequest?.approval_status === APPROVAL_STATUS.pending ? latestLeaveRequest : null;

      const isWeekend = current.getDay() === 0 || current.getDay() === 6;
      const isHoliday = isWeekend || holidaySet.has(dateKey);
      const isFuture = dateKey > todayKey;

      const startTime = approvedCorrection?.requested_start_time ?? attendance?.start_time ?? null;
      const endTime = approvedCorrection?.requested_end_time ?? attendance?.end_time ?? null;
      const awayMinutes = approvedCorrection?.requested_away_minutes ?? awayMinutesMap.get(dateKey) ?? 0;

      const status = getStatusInfo({
        isFuture,
        isHoliday,
        leaveRequest: latestLeaveRequest,
        hasAttendance: !!(startTime || endTime),
        correctionRequest: latestCorrection,
      });

      const workMinutes = getWorkedMinutes(startTime, endTime, awayMinutes);
      const overtimeMinutes = getOvertimeMinutes(workMinutes);

      result.push({
        dateKey,
        dayLabel: `${current.getMonth() + 1}/${current.getDate()}`,
        weekday: current.getDay(),
        startTime,
        endTime,
        awayMinutes,
        workMinutes,
        overtimeMinutes,
        statusLabel: status.label,
        statusType: status.type,
        isFuture,
        hasPendingRequest: !!pendingCorrection || !!pendingLeaveRequest,
      });
    }

    return result;
  }, [attendanceRows, awayMinutesMap, displayMonth, holidaySet, latestCorrectionMap, latestLeaveMap, todayKey]);

  const summary = useMemo(() => {
    const workedMinutes = dayRows.reduce((sum, row) => sum + (row.workMinutes ?? 0), 0);
    const overtimeMinutes = dayRows.reduce((sum, row) => sum + (row.overtimeMinutes ?? 0), 0);
    const missingDays = dayRows.filter((row) => row.statusType === "missing").length;

    return {
      workedMinutes,
      overtimeMinutes,
      missingDays,
    };
  }, [dayRows]);

  const openEditModal = (row: DayRow) => {
    if (row.isFuture || row.hasPendingRequest) return;

    setEditTarget(row);
    setEditForm({
      work_date: row.dateKey,
      start_time: row.startTime ? row.startTime.slice(0, 5) : "",
      end_time: row.endTime ? row.endTime.slice(0, 5) : "",
      away_duration: formatDuration(row.awayMinutes ?? 0) === "-" ? "" : formatDuration(row.awayMinutes ?? 0),
      status_label: normalizeFormStatusLabel(row.statusLabel),
      comment: "",
    });
  };

  const closeEditModal = () => {
    if (requestSaving) return;
    setEditTarget(null);
  };

  const submitCorrectionRequest = async () => {
    if (!editTarget) return;

    setRequestSaving(true);
    setMessage("");

    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw new Error(authError.message);

      const userId = authData.user?.id;
      if (!userId) throw new Error("ログインユーザーを取得できません。");

      const leaveType = getLeaveTypeFromLabel(editForm.status_label);

      if (leaveType !== null) {
        const { error } = await supabase.from("leave_request").insert({
          profile_id: userId,
          work_date: editForm.work_date,
          leave_type: leaveType,
          approval_status: APPROVAL_STATUS.pending,
          request_group_id: createRequestGroupId(),
          comment: editForm.comment.trim() || null,
          updated_by: userId,
        });

        if (error) throw new Error(error.message);

        setEditTarget(null);
        setRequestCompleteMessage("休暇申請が完了しました");
        setRequestCompleteOpen(true);
        await load();
        return;
      }

      const awayMinutes = parseDurationToMinutes(editForm.away_duration);
      if (awayMinutes == null) {
        throw new Error("離席時間は hh:mm 形式で入力してください。");
      }

      const startMinutes = parseTimeToMinutes(editForm.start_time || null);
      const endMinutes = parseTimeToMinutes(editForm.end_time || null);
      if (startMinutes != null && endMinutes != null && endMinutes < startMinutes) {
        throw new Error("退勤時刻は出勤時刻以降を入力してください。");
      }

      const requestedStatusLabel = normalizeCorrectionStatusLabel(editForm.status_label);

      const { error } = await supabase.from("attendance_correction_request").insert({
        profile_id: userId,
        work_date: editForm.work_date,
        before_start_time: editTarget.startTime ? editTarget.startTime.slice(0, 8) : null,
        before_end_time: editTarget.endTime ? editTarget.endTime.slice(0, 8) : null,
        before_away_minutes: editTarget.awayMinutes ?? 0,
        before_status_label: editTarget.statusLabel || null,
        requested_start_time: editForm.start_time || null,
        requested_end_time: editForm.end_time || null,
        requested_away_minutes: awayMinutes,
        requested_status_label: requestedStatusLabel,
        comment: editForm.comment.trim() || null,
        approval_status: APPROVAL_STATUS.pending,
        requested_by: userId,
      });

      if (error) throw new Error(error.message);

      setEditTarget(null);
      setRequestCompleteMessage("打刻修正申請が完了しました");
      setRequestCompleteOpen(true);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setRequestSaving(false);
    }
  };

  const getStatusBadgeClassName = (statusType: DayRow["statusType"]) => {
    switch (statusType) {
      case "work":
        return styles.statusWork;
      case "holiday":
        return styles.statusHoliday;
      case "paid":
        return styles.statusPaid;
      case "am":
        return styles.statusAm;
      case "pm":
        return styles.statusPm;
      case "summer":
        return styles.statusSummer;
      case "special":
        return styles.statusSpecial;
      case "unpaid":
        return styles.statusUnpaid;
      case "missing":
        return styles.statusMissing;
      case "correctionPending":
        return styles.statusCorrectionPending;
      case "correctionRejected":
        return styles.statusCorrectionRejected;
      case "correctionCanceled":
        return styles.statusCorrectionCanceled;
      case "leavePending":
        return styles.statusLeavePending;
      case "leaveRejected":
        return styles.statusLeaveRejected;
      case "leaveCanceled":
        return styles.statusLeaveCanceled;
      default:
        return "";
    }
  };

  const isLeaveSelected = isLeaveStatusLabel(editForm.status_label);

  return (
    <main className={styles.page}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>勤怠入力</h1>
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

      <div className={styles.summaryRow}>
        <div className={styles.summaryCard}>
          <div className={styles.summaryLabel}>勤務時間</div>
          <div className={styles.summaryValue}>
            {formatSummaryDuration(summary.workedMinutes)} <span className={styles.summaryUnit}>h</span>
          </div>
          <div className={styles.summarySub}>月累計</div>
        </div>

        <div className={styles.summaryCard}>
          <div className={styles.summaryLabel}>残業時間</div>
          <div className={styles.summaryValue}>
            {formatSummaryDuration(summary.overtimeMinutes)} <span className={styles.summaryUnit}>h</span>
          </div>
          <div className={styles.summarySub}>月累計</div>
        </div>

        <div className={styles.summaryCard}>
          <div className={styles.summaryLabel}>未入力</div>
          <div className={styles.summaryValueDanger}>
            {summary.missingDays} <span className={styles.summaryUnit}>日</span>
          </div>
          <div className={styles.summarySub}>要確認</div>
        </div>
      </div>

      <div className={styles.tableFrame}>
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>日付</th>
                <th>出勤</th>
                <th>退勤</th>
                <th>離席時間</th>
                <th>勤務時間</th>
                <th>残業</th>
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
              ) : dayRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className={styles.emptyCell}>
                    データがありません。
                  </td>
                </tr>
              ) : (
                dayRows.map((row) => {
                  const isSunday = row.weekday === 0;
                  const isSaturday = row.weekday === 6;

                  return (
                    <tr key={row.dateKey} className={row.statusType === "missing" ? styles.rowMissing : ""}>
                      <td
                        className={`${styles.dateCell} ${isSunday ? styles.sunday : ""} ${
                          isSaturday ? styles.saturday : ""
                        }`}
                      >
                        {row.dayLabel}
                      </td>
                      <td>{formatTime(row.startTime)}</td>
                      <td>{formatTime(row.endTime)}</td>
                      <td>{formatDuration(row.awayMinutes)}</td>
                      <td>{formatDuration(row.workMinutes)}</td>
                      <td>{formatDuration(row.overtimeMinutes)}</td>
                      <td>
                        {row.statusLabel ? (
                          <span className={`${styles.statusBadge} ${getStatusBadgeClassName(row.statusType)}`}>
                            {row.statusLabel}
                          </span>
                        ) : null}
                      </td>
                      <td>
                        {!row.isFuture ? (
                          <button
                            type="button"
                            className={styles.editButton}
                            onClick={() => openEditModal(row)}
                            disabled={row.hasPendingRequest}
                          >
                            {row.hasPendingRequest ? "申請中" : "修正"}
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {editTarget && (
        <div className={styles.modalOverlay} onClick={closeEditModal}>
          <div className={styles.modalCard} onClick={(event) => event.stopPropagation()}>
            <h2 className={styles.modalTitle}>勤怠修正・休暇申請</h2>

            <div className={styles.modalSubTitle}>
              <span>{formatDateForPopup(editTarget.dateKey)}</span>
            </div>

            <div className={styles.modalFields}>
              <div className={styles.modalField}>
                <label className={styles.modalLabel}>ステータス</label>
                <select
                  value={editForm.status_label}
                  onChange={(event) =>
                    setEditForm((current) => ({ ...current, status_label: event.target.value }))
                  }
                  className={`${styles.modalInput} ${styles.modalSelect}`}
                >
                  {CORRECTION_STATUS_OPTIONS.map((option) => (
                    <option key={String(option.value)} value={String(option.label)}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              {!isLeaveSelected && (
                <>
                  <div className={styles.modalFieldRow}>
                    <div className={styles.modalField}>
                      <label className={styles.modalLabel}>出勤</label>
                      <input
                        type="time"
                        value={editForm.start_time}
                        onChange={(event) =>
                          setEditForm((current) => ({ ...current, start_time: event.target.value }))
                        }
                        className={styles.modalInput}
                      />
                    </div>
                    <div className={styles.modalField}>
                      <label className={styles.modalLabel}>退勤</label>
                      <input
                        type="time"
                        value={editForm.end_time}
                        onChange={(event) =>
                          setEditForm((current) => ({ ...current, end_time: event.target.value }))
                        }
                        className={styles.modalInput}
                      />
                    </div>
                  </div>

                  <div className={styles.modalField}>
                    <label className={styles.modalLabel}>離席時間</label>
                    <input
                      type="text"
                      value={editForm.away_duration}
                      onChange={(event) =>
                        setEditForm((current) => ({ ...current, away_duration: event.target.value }))
                      }
                      className={styles.modalInput}
                      placeholder="00:00"
                    />
                  </div>
                </>
              )}

              {isLeaveSelected && (
                <p className={styles.modalHelpText}>
                  選択した休暇種別で休暇申請を行います。出勤・退勤・離席時間は登録されません。
                </p>
              )}

              <div className={styles.modalField}>
                <label className={styles.modalLabel}>コメント（任意）</label>
                <textarea
                  value={editForm.comment}
                  onChange={(event) =>
                    setEditForm((current) => ({ ...current, comment: event.target.value }))
                  }
                  className={styles.modalTextarea}
                  rows={4}
                  placeholder={isLeaveSelected ? "休暇事後申請のため" : "打刻漏れのため"}
                />
              </div>
            </div>

            <div className={styles.modalActionRow}>
              <button
                type="button"
                className={styles.modalCancelButton}
                onClick={closeEditModal}
                disabled={requestSaving}
              >
                キャンセル
              </button>
              <button
                type="button"
                className={styles.modalSaveButton}
                onClick={submitCorrectionRequest}
                disabled={requestSaving}
              >
                {requestSaving ? "申請中..." : "申請する"}
              </button>
            </div>
          </div>
        </div>
      )}

      {requestCompleteOpen && (
        <div className={styles.modalOverlay} onClick={() => setRequestCompleteOpen(false)}>
          <div className={styles.completeModalCard} onClick={(event) => event.stopPropagation()}>
            <h2 className={styles.modalTitle}>{requestCompleteMessage}</h2>
            <div className={styles.modalActionRow}>
              <button
                type="button"
                className={styles.completeModalCloseButton}
                onClick={() => setRequestCompleteOpen(false)}
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}