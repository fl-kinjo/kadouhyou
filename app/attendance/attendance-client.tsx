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
  requested_status_label: string;
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

const LEAVE_TYPE_LABELS: Record<number, string> = {
  0: "有給",
  1: "午前半休",
  2: "午後半休",
  3: "特別休暇",
  4: "無給",
  5: "夏休",
};

const CORRECTION_STATUS_OPTIONS = [{ value: "出勤", label: "出勤" }] as const;

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
  return Math.max(0, end - start - away);
}

function getOvertimeMinutes(workMinutes: number | null) {
  if (workMinutes == null) return null;
  return Math.max(0, workMinutes - 8 * 60);
}

function getStatusTypeFromLabel(
  label: string
): "work" | "holiday" | "paid" | "am" | "pm" | "summer" | "special" | "unpaid" | "missing" | "none" {
  switch (label) {
    case "出勤":
      return "work";
    case "休日":
      return "holiday";
    case "有給":
      return "paid";
    case "午前半休":
      return "am";
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
  approvedCorrection: AttendanceCorrectionRequestRow | null;
}) {
  const { isFuture, isHoliday, leaveRequest, hasAttendance, approvedCorrection } = params;

  if (isFuture) {
    return { label: "", type: "none" as const };
  }

  if (approvedCorrection) {
    const label = approvedCorrection.requested_status_label || "出勤";
    return { label, type: getStatusTypeFromLabel(label) };
  }

  if (isHoliday) {
    return { label: "休日", type: "holiday" as const };
  }

  if (leaveRequest) {
    const leaveType = leaveRequest.leave_type;
    switch (leaveType) {
      case 0:
        return { label: "有給", type: "paid" as const };
      case 1:
        return { label: "午前半休", type: "am" as const };
      case 2:
        return { label: "午後半休", type: "pm" as const };
      case 3:
        return { label: "特別休暇", type: "special" as const };
      case 4:
        return { label: "無給", type: "unpaid" as const };
      case 5:
        return { label: "夏休", type: "summer" as const };
      default:
        return { label: LEAVE_TYPE_LABELS[leaveType] ?? "-", type: "none" as const };
    }
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

function getLatestRequestMap(rows: AttendanceCorrectionRequestRow[], approvalStatus: number) {
  const filtered = rows.filter((row) => row.approval_status === approvalStatus);
  const map = new Map<string, AttendanceCorrectionRequestRow>();

  for (const row of filtered) {
    const current = map.get(row.work_date);
    if (!current || current.requested_at < row.requested_at) {
      map.set(row.work_date, row);
    }
  }

  return map;
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
          .select("id,profile_id,work_date,leave_type,approval_status")
          .eq("profile_id", userId)
          .eq("approval_status", 1)
          .gte("work_date", from)
          .lte("work_date", to)
          .order("work_date", { ascending: true }),
        supabase
          .from("attendance_correction_request")
          .select(
            "id,profile_id,work_date,before_start_time,before_end_time,before_away_minutes,before_status_label,requested_start_time,requested_end_time,requested_away_minutes,requested_status_label,comment,approval_status,requested_at"
          )
          .eq("profile_id", userId)
          .gte("work_date", from)
          .lte("work_date", to)
          .in("approval_status", [0, 1])
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
  const approvedCorrectionMap = useMemo(() => getLatestRequestMap(correctionRows, 1), [correctionRows]);
  const pendingCorrectionMap = useMemo(() => getLatestRequestMap(correctionRows, 0), [correctionRows]);

  const dayRows = useMemo<DayRow[]>(() => {
    const attendanceMap = new Map(attendanceRows.map((row) => [row.work_date, row]));
    const leaveMap = new Map(leaveRows.map((row) => [row.work_date, row]));

    const result: DayRow[] = [];
    const monthStart = getMonthStart(displayMonth);
    const monthEnd = getMonthEnd(displayMonth);

    for (let day = 1; day <= monthEnd.getDate(); day += 1) {
      const current = new Date(monthStart.getFullYear(), monthStart.getMonth(), day);
      const dateKey = getDateKey(current);
      const attendance = attendanceMap.get(dateKey) ?? null;
      const leaveRequest = leaveMap.get(dateKey) ?? null;
      const approvedCorrection = approvedCorrectionMap.get(dateKey) ?? null;
      const pendingCorrection = pendingCorrectionMap.get(dateKey) ?? null;

      const isWeekend = current.getDay() === 0 || current.getDay() === 6;
      const isHoliday = isWeekend || holidaySet.has(dateKey);
      const isFuture = dateKey > todayKey;

      const startTime = approvedCorrection?.requested_start_time ?? attendance?.start_time ?? null;
      const endTime = approvedCorrection?.requested_end_time ?? attendance?.end_time ?? null;
      const awayMinutes =
        approvedCorrection?.requested_away_minutes ?? awayMinutesMap.get(dateKey) ?? 0;

      const status = getStatusInfo({
        isFuture,
        isHoliday,
        leaveRequest,
        hasAttendance: !!(startTime || endTime),
        approvedCorrection,
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
        hasPendingRequest: !!pendingCorrection,
      });
    }

    return result;
  }, [
    approvedCorrectionMap,
    attendanceRows,
    awayMinutesMap,
    displayMonth,
    holidaySet,
    leaveRows,
    pendingCorrectionMap,
    todayKey,
  ]);

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
      status_label: row.statusLabel || "出勤",
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

      const awayMinutes = parseDurationToMinutes(editForm.away_duration);
      if (awayMinutes == null) {
        throw new Error("離席時間は hh:mm 形式で入力してください。");
      }

      const startMinutes = parseTimeToMinutes(editForm.start_time || null);
      const endMinutes = parseTimeToMinutes(editForm.end_time || null);
      if (startMinutes != null && endMinutes != null && endMinutes < startMinutes) {
        throw new Error("退勤時刻は出勤時刻以降を入力してください。");
      }

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
        requested_status_label: editForm.status_label || "出勤",
        comment: editForm.comment.trim() || null,
        approval_status: 0,
        requested_by: userId,
      });

      if (error) throw new Error(error.message);

      setEditTarget(null);
      setRequestCompleteOpen(true);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setRequestSaving(false);
    }
  };

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
                          <span
                            className={`${styles.statusBadge} ${
                              row.statusType === "work"
                                ? styles.statusWork
                                : row.statusType === "holiday"
                                  ? styles.statusHoliday
                                  : row.statusType === "paid"
                                    ? styles.statusPaid
                                    : row.statusType === "am"
                                      ? styles.statusAm
                                      : row.statusType === "pm"
                                        ? styles.statusPm
                                        : row.statusType === "summer"
                                          ? styles.statusSummer
                                          : row.statusType === "special"
                                            ? styles.statusSpecial
                                            : row.statusType === "unpaid"
                                              ? styles.statusUnpaid
                                              : row.statusType === "missing"
                                                ? styles.statusMissing
                                                : ""
                            }`}
                          >
                            {row.statusLabel}
                          </span>
                        ) : null}
                      </td>
                      <td>
                        <button
                          type="button"
                          className={styles.editButton}
                          onClick={() => openEditModal(row)}
                          disabled={row.isFuture || row.hasPendingRequest}
                        >
                          {row.hasPendingRequest ? "申請中" : "修正"}
                        </button>
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
            <h2 className={styles.modalTitle}>打刻修正申請</h2>

            <div className={styles.modalSubTitle}>
              <span>{formatDateForPopup(editTarget.dateKey)}</span>
            </div>

            <div className={styles.modalFields}>
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

              <div className={styles.modalFieldRow}>
                <div className={styles.modalField}>
                  <label className={styles.modalLabel}>離席時間</label>
                  <input
                    type="text"
                    value={editForm.away_duration}
                    onChange={(event) =>
                      setEditForm((current) => ({ ...current, away_duration: event.target.value }))
                    }
                    className={styles.modalInput}
                    placeholder="01:00"
                  />
                </div>
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
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className={styles.modalField}>
                <label className={styles.modalLabel}>コメント（任意）</label>
                <textarea
                  value={editForm.comment}
                  onChange={(event) =>
                    setEditForm((current) => ({ ...current, comment: event.target.value }))
                  }
                  className={styles.modalTextarea}
                  rows={4}
                  placeholder="打刻漏れのため"
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
            <h2 className={styles.modalTitle}>打刻修正申請が完了しました</h2>
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