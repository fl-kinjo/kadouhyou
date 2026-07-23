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
  breakRows: AttendanceBreakRow[];
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
  away_hours: string;
  away_minutes: string;
  status_label: string;
  comment: string;
};

type ProfileOption = {
  id: string;
  last_name: string | null;
  first_name: string | null;
  email: string | null;
  status?: number | null;
  is_general_affairs_approver?: number | null;
};

type CurrentProfile = {
  id: string;
  email: string | null;
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

function splitDurationToFields(minutes: number | null | undefined) {
  const safe = Math.max(0, minutes ?? 0);
  return {
    hours: String(Math.floor(safe / 60)),
    minutes: String(safe % 60),
  };
}

function parseDurationFieldsToMinutes(hoursValue: string, minutesValue: string) {
  const hoursText = hoursValue.trim();
  const minutesText = minutesValue.trim();

  const hours = hoursText === "" ? 0 : Number(hoursText);
  const minutes = minutesText === "" ? 0 : Number(minutesText);

  if (
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    hours < 0 ||
    minutes < 0 ||
    minutes >= 60
  ) {
    return null;
  }

  return hours * 60 + minutes;
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

function getLeaveRequestStatusInfo(leaveRequest: LeaveRequestRow | null) {
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

  return null;
}

function getStatusInfo(params: {
  isFuture: boolean;
  isHoliday: boolean;
  leaveRequest: LeaveRequestRow | null;
  hasAttendance: boolean;
  correctionRequest: AttendanceCorrectionRequestRow | null;
}) {
  const { isFuture, isHoliday, leaveRequest, hasAttendance, correctionRequest } = params;

  const leaveStatus = getLeaveRequestStatusInfo(leaveRequest);

  if (isFuture) {
    return leaveStatus ?? { label: "", type: "none" as const };
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

  if (leaveStatus) {
    return leaveStatus;
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

function getBreakRowsByDate(rows: AttendanceBreakRow[]) {
  const map = new Map<string, AttendanceBreakRow[]>();

  for (const row of rows) {
    const current = map.get(row.work_date) ?? [];
    current.push(row);
    map.set(row.work_date, current);
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

function getProfileDisplayName(profile: Pick<ProfileOption, "last_name" | "first_name" | "email">) {
  const name = [profile.last_name, profile.first_name].filter(Boolean).join(" ").trim();
  return name || profile.email || "氏名未設定";
}

function uniq(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}


function AwayDurationCell({
  breakRows,
  awayMinutes,
}: {
  breakRows: AttendanceBreakRow[];
  awayMinutes: number | null;
}) {
  const hasBreakRows = breakRows.length > 0;

  if (!hasBreakRows) {
    return <span>{formatDuration(awayMinutes)}</span>;
  }

  const tooltipText = breakRows
    .map(
      (row, index) =>
        `#${index + 1} 途中退出 ${formatTime(row.break_out_time)} / 再入 ${
          row.break_in_time ? formatTime(row.break_in_time) : "未再入"
        }`
    )
    .join("\n");

  return (
    <span className={styles.awayTooltipWrap} tabIndex={0} title={tooltipText}>
      <span className={styles.awayDurationValue}>{formatDuration(awayMinutes)}</span>
      <span className={styles.awayTooltip}>
        <span className={styles.awayTooltipTitle}>離席履歴</span>
        {breakRows.map((row, index) => (
          <span key={row.id} className={styles.awayTooltipRow}>
            <span>#{index + 1}</span>
            <span>途中退出 {formatTime(row.break_out_time)}</span>
            <span>再入 {row.break_in_time ? formatTime(row.break_in_time) : "未再入"}</span>
          </span>
        ))}
      </span>
    </span>
  );
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
    away_hours: "",
    away_minutes: "",
    status_label: "出勤",
    comment: "",
  });
  const [approvalFlowOpen, setApprovalFlowOpen] = useState(false);
  const [approvalFlowLoading, setApprovalFlowLoading] = useState(false);
  const [approvalMemberOptions, setApprovalMemberOptions] = useState<ProfileOption[]>([]);
  const [selectedStep1ApproverIds, setSelectedStep1ApproverIds] = useState<string[]>([]);
  const [selectedShareMemberIds, setSelectedShareMemberIds] = useState<string[]>([]);
  const [shareMemberSearch, setShareMemberSearch] = useState("");
  const [generalAffairsApproverCount, setGeneralAffairsApproverCount] = useState(0);

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
  const breakRowsMap = useMemo(() => getBreakRowsByDate(attendanceBreakRows), [attendanceBreakRows]);
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
      const breakRows = breakRowsMap.get(dateKey) ?? [];

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
        breakRows,
        workMinutes,
        overtimeMinutes,
        statusLabel: status.label,
        statusType: status.type,
        isFuture,
        hasPendingRequest: !!pendingCorrection || !!pendingLeaveRequest,
      });
    }

    return result;
  }, [attendanceRows, awayMinutesMap, breakRowsMap, displayMonth, holidaySet, latestCorrectionMap, latestLeaveMap, todayKey]);

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

  const selectedStep1Approvers = useMemo(
    () => approvalMemberOptions.filter((profile) => selectedStep1ApproverIds.includes(profile.id)),
    [approvalMemberOptions, selectedStep1ApproverIds]
  );

  const selectedShareMembers = useMemo(
    () => approvalMemberOptions.filter((profile) => selectedShareMemberIds.includes(profile.id)),
    [approvalMemberOptions, selectedShareMemberIds]
  );

  const filteredShareMemberOptions = useMemo(() => {
    const keyword = shareMemberSearch.trim().toLowerCase();
    const selectedSet = new Set([...selectedShareMemberIds, ...selectedStep1ApproverIds]);

    return approvalMemberOptions
      .filter((profile) => !selectedSet.has(profile.id))
      .filter((profile) => {
        if (!keyword) return true;
        return `${getProfileDisplayName(profile)} ${profile.email ?? ""}`.toLowerCase().includes(keyword);
      })
      .slice(0, 8);
  }, [approvalMemberOptions, selectedShareMemberIds, selectedStep1ApproverIds, shareMemberSearch]);

  const resolveCurrentProfile = async (): Promise<CurrentProfile> => {
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError) throw new Error(authError.message);

    const authUser = authData.user;
    if (!authUser?.id) throw new Error("ログインユーザーを取得できません。");

    const { data: profileById, error: profileByIdError } = await supabase
      .from("profiles_2")
      .select("id,email")
      .eq("id", authUser.id)
      .maybeSingle();

    if (profileByIdError) throw new Error(profileByIdError.message);

    if (profileById?.id) {
      return { id: profileById.id as string, email: (profileById.email as string | null) ?? null };
    }

    const authEmail = authUser.email?.trim();
    if (!authEmail) {
      return { id: authUser.id, email: null };
    }

    const { data: profileByEmail, error: profileByEmailError } = await supabase
      .from("profiles_2")
      .select("id,email")
      .ilike("email", authEmail)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (profileByEmailError) throw new Error(profileByEmailError.message);

    return {
      id: (profileByEmail?.id as string | undefined) ?? authUser.id,
      email: (profileByEmail?.email as string | null | undefined) ?? authEmail,
    };
  };

  const loadApprovalFlowOptions = async () => {
    setApprovalFlowLoading(true);

    try {
      const currentProfile = await resolveCurrentProfile();

      const { data: profilesData, error: profilesError } = await supabase
        .from("profiles_2")
        .select("id,last_name,first_name,email,status,is_general_affairs_approver")
        .eq("status", 0)
        .order("last_name", { ascending: true })
        .order("first_name", { ascending: true });

      if (profilesError) throw new Error(profilesError.message);

      const profiles = ((profilesData ?? []) as ProfileOption[]).filter((profile) => profile.id !== currentProfile.id);
      setApprovalMemberOptions(profiles);
      setGeneralAffairsApproverCount(
        ((profilesData ?? []) as ProfileOption[]).filter((profile) => Number(profile.is_general_affairs_approver ?? 0) === 1)
          .length
      );

      const { data: profileTeamData, error: profileTeamError } = await supabase
        .from("profile_team")
        .select("team_id")
        .eq("profile_id", currentProfile.id);

      if (profileTeamError) throw new Error(profileTeamError.message);

      const teamIds = uniq(((profileTeamData ?? []) as { team_id: string | null }[]).map((row) => row.team_id ?? ""));

      if (teamIds.length === 0) {
        setSelectedStep1ApproverIds([]);
        return;
      }

      const { data: teamLeaderData, error: teamLeaderError } = await supabase
        .from("team_leader")
        .select("profile_id")
        .in("team_id", teamIds);

      if (teamLeaderError) throw new Error(teamLeaderError.message);

      const leaderIds = uniq(
        ((teamLeaderData ?? []) as { profile_id: string | null }[])
          .map((row) => row.profile_id ?? "")
          .filter((id) => id !== currentProfile.id)
      );

      if (leaderIds.length === 0) {
        setSelectedStep1ApproverIds([]);
        return;
      }

      const { data: leaderData, error: leaderError } = await supabase
        .from("profiles_2")
        .select("id,last_name,first_name,email,status")
        .in("id", leaderIds);

      if (leaderError) throw new Error(leaderError.message);

      const activeLeaderIds = ((leaderData ?? []) as ProfileOption[])
        .filter((profile) => Number(profile.status ?? 0) === 0)
        .map((profile) => profile.id);
      setSelectedStep1ApproverIds(activeLeaderIds);
    } finally {
      setApprovalFlowLoading(false);
    }
  };

  const validateAttendanceCorrectionForm = () => {
    if (!editTarget) throw new Error("修正対象日を取得できません。");

    const awayMinutes = parseDurationFieldsToMinutes(editForm.away_hours, editForm.away_minutes);
    if (awayMinutes == null) {
      throw new Error("離席時間は時間と分を半角数字で入力してください。分は0〜59で入力してください。");
    }

    const startMinutes = parseTimeToMinutes(editForm.start_time || null);
    const endMinutes = parseTimeToMinutes(editForm.end_time || null);
    if (startMinutes != null && endMinutes != null && endMinutes < startMinutes) {
      throw new Error("退勤時刻は出勤時刻以降を入力してください。");
    }

    return {
      awayMinutes,
      requestedStatusLabel: normalizeCorrectionStatusLabel(editForm.status_label),
    };
  };

  const openApprovalFlowModal = async () => {
    if (!editTarget) return;

    setMessage("");

    try {
      validateAttendanceCorrectionForm();
      setSelectedStep1ApproverIds([]);
      setSelectedShareMemberIds([]);
      setShareMemberSearch("");
      await loadApprovalFlowOptions();
      setApprovalFlowOpen(true);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  };

  const openEditModal = (row: DayRow) => {
    if (row.isFuture || row.hasPendingRequest) return;

    setEditTarget(row);
    setEditForm({
      work_date: row.dateKey,
      start_time: row.startTime ? row.startTime.slice(0, 5) : "",
      end_time: row.endTime ? row.endTime.slice(0, 5) : "",
      away_hours: splitDurationToFields(row.awayMinutes).hours,
      away_minutes: splitDurationToFields(row.awayMinutes).minutes,
      status_label: normalizeFormStatusLabel(row.statusLabel),
      comment: "",
    });
  };

  const closeEditModal = () => {
    if (requestSaving) return;
    setApprovalFlowOpen(false);
    setSelectedStep1ApproverIds([]);
    setSelectedShareMemberIds([]);
    setShareMemberSearch("");
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

      const { awayMinutes, requestedStatusLabel } = validateAttendanceCorrectionForm();
      const step1ApproverIds = uniq([...selectedStep1ApproverIds, ...selectedShareMemberIds]);
      if (step1ApproverIds.length === 0) {
        throw new Error("STEP 1 または共有先に承認者を1名以上選択してください。");
      }

      const { error } = await supabase.rpc("create_attendance_correction_request_with_flow", {
        target_work_date: editForm.work_date,
        target_before_start_time: editTarget.startTime ? editTarget.startTime.slice(0, 8) : null,
        target_before_end_time: editTarget.endTime ? editTarget.endTime.slice(0, 8) : null,
        target_before_away_minutes: editTarget.awayMinutes ?? 0,
        target_before_status_label: editTarget.statusLabel || null,
        target_requested_start_time: editForm.start_time || null,
        target_requested_end_time: editForm.end_time || null,
        target_requested_away_minutes: awayMinutes,
        target_requested_status_label: requestedStatusLabel,
        target_comment: editForm.comment.trim() || null,
        target_step1_approver_profile_ids: step1ApproverIds,
        target_shared_profile_ids: [],
      });

      if (error) throw new Error(error.message);

      setApprovalFlowOpen(false);
      setEditTarget(null);
      setSelectedStep1ApproverIds([]);
      setSelectedShareMemberIds([]);
      setShareMemberSearch("");
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
                      <td>
                        <AwayDurationCell breakRows={row.breakRows} awayMinutes={row.awayMinutes} />
                      </td>
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
                    <div className={styles.durationInputRow}>
                      <label className={styles.durationInputUnit}>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          inputMode="numeric"
                          value={editForm.away_hours}
                          onChange={(event) =>
                            setEditForm((current) => ({ ...current, away_hours: event.target.value }))
                          }
                          className={`${styles.modalInput} ${styles.durationInput}`}
                        />
                        <span>時間</span>
                      </label>
                      <label className={styles.durationInputUnit}>
                        <input
                          type="number"
                          min="0"
                          max="59"
                          step="1"
                          inputMode="numeric"
                          value={editForm.away_minutes}
                          onChange={(event) =>
                            setEditForm((current) => ({ ...current, away_minutes: event.target.value }))
                          }
                          className={`${styles.modalInput} ${styles.durationInput}`}
                        />
                        <span>分</span>
                      </label>
                    </div>
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
                onClick={isLeaveSelected ? submitCorrectionRequest : openApprovalFlowModal}
                disabled={requestSaving || approvalFlowLoading}
              >
                {requestSaving || approvalFlowLoading ? "処理中..." : isLeaveSelected ? "申請する" : "次へ"}
              </button>
            </div>
          </div>
        </div>
      )}

      {approvalFlowOpen && editTarget && (
        <div className={styles.modalOverlay} onClick={() => !requestSaving && setApprovalFlowOpen(false)}>
          <div
            className={`${styles.modalCard} ${styles.approvalFlowModalCard}`}
            onClick={(event) => event.stopPropagation()}
          >
            <h2 className={styles.modalTitle}>承認フローの確認</h2>

            <div className={styles.approvalFlowBody}>
              <section className={styles.approvalFlowSection}>
                <h3 className={styles.approvalFlowHeading}>承認フロー（必須）</h3>
                <p className={styles.approvalFlowDescription}>この申請は以下の順で承認されます</p>

                <div className={styles.approvalFlowSteps}>
                  <div className={`${styles.approvalFlowStepCard} ${styles.step1ApproverCard}`}>
                    <span className={styles.approvalFlowStepLabel}>STEP 1</span>
                    <div className={styles.step1ApproverArea}>
                      {selectedStep1Approvers.length === 0 && (
                        <span className={styles.step1EmptyText}>未選択</span>
                      )}

                      {selectedStep1Approvers.map((profile) => (
                        <span key={profile.id} className={styles.shareMemberChip}>
                          {getProfileDisplayName(profile)}
                          <button
                            type="button"
                            className={styles.shareMemberRemoveButton}
                            onClick={() =>
                              setSelectedStep1ApproverIds((current) => current.filter((id) => id !== profile.id))
                            }
                            aria-label={`${getProfileDisplayName(profile)}をSTEP 1承認者から削除`}
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className={styles.approvalFlowArrow}>→</div>
                  <div className={styles.approvalFlowStepCard}>
                    <span className={styles.approvalFlowStepLabel}>STEP 2</span>
                    <span className={styles.approvalFlowStepName}>総務部</span>
                  </div>
                </div>

                <p className={styles.approvalFlowNote}>
                  ※ 上長の承認後に総務承認者へ通知されます
                </p>
                {selectedStep1ApproverIds.length === 0 && selectedShareMemberIds.length === 0 && (
                  <p className={styles.approvalFlowWarning}>
                    STEP 1 または共有先に承認者を1名以上選択してください。
                  </p>
                )}
                {generalAffairsApproverCount === 0 && (
                  <p className={styles.approvalFlowWarning}>
                    総務承認者権限を持つ社員が設定されていません。社員管理画面で総務承認者を設定してください。
                  </p>
                )}
              </section>

              <section className={styles.approvalFlowSection}>
                <h3 className={styles.approvalFlowHeading}>共有先（任意）</h3>
                <p className={styles.approvalFlowDescription}>
                  STEP 1の上長以外に承認が必要なメンバーを追加できます
                </p>

                <div className={styles.shareMemberArea}>
                  {selectedShareMembers.map((profile) => (
                    <span key={profile.id} className={styles.shareMemberChip}>
                      {getProfileDisplayName(profile)}
                      <button
                        type="button"
                        className={styles.shareMemberRemoveButton}
                        onClick={() =>
                          setSelectedShareMemberIds((current) => current.filter((id) => id !== profile.id))
                        }
                        aria-label={`${getProfileDisplayName(profile)}を共有先から削除`}
                      >
                        ×
                      </button>
                    </span>
                  ))}

                  <div className={styles.shareMemberPicker}>
                    <input
                      type="text"
                      value={shareMemberSearch}
                      onChange={(event) => setShareMemberSearch(event.target.value)}
                      className={styles.shareMemberSearchInput}
                      placeholder="名前で検索"
                    />
                    {shareMemberSearch.trim() !== "" && filteredShareMemberOptions.length > 0 && (
                      <div className={styles.shareMemberDropdown}>
                        {filteredShareMemberOptions.map((profile) => (
                          <button
                            key={profile.id}
                            type="button"
                            className={styles.shareMemberOption}
                            onClick={() => {
                              setSelectedShareMemberIds((current) => uniq([...current, profile.id]));
                              setShareMemberSearch("");
                            }}
                          >
                            {getProfileDisplayName(profile)}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </section>
            </div>

            <div className={styles.modalActionRow}>
              <button
                type="button"
                className={styles.modalCancelButton}
                onClick={() => setApprovalFlowOpen(false)}
                disabled={requestSaving}
              >
                キャンセル
              </button>
              <button
                type="button"
                className={styles.modalSaveButton}
                onClick={submitCorrectionRequest}
                disabled={
                  requestSaving ||
                  (selectedStep1ApproverIds.length === 0 && selectedShareMemberIds.length === 0) ||
                  generalAffairsApproverCount === 0
                }
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