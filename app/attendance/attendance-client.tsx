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
  break_out_time: string | null;
  break_in_time: string | null;
};

type LeaveRequestRow = {
  id: string;
  profile_id: string;
  work_date: string;
  leave_type: number;
  approval_status: number;
};

type DayRow = {
  dateKey: string;
  dayLabel: string;
  weekday: number;
  startTime: string | null;
  breakOutTime: string | null;
  breakInTime: string | null;
  endTime: string | null;
  workMinutes: number | null;
  overtimeMinutes: number | null;
  statusLabel: string;
  statusType: "work" | "holiday" | "paid" | "am" | "pm" | "summer" | "special" | "unpaid" | "missing" | "none";
};

const LEAVE_TYPE_LABELS: Record<number, string> = {
  0: "有給",
  1: "午前半休",
  2: "午後半休",
  3: "特別休暇",
  4: "無給",
  5: "夏休",
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

function getWorkedMinutes(startTime: string | null, endTime: string | null) {
  const start = parseTimeToMinutes(startTime);
  const end = parseTimeToMinutes(endTime);
  if (start == null || end == null || end < start) return null;
  return Math.max(0, end - start - 60);
}

function getOvertimeMinutes(startTime: string | null, endTime: string | null) {
  const start = parseTimeToMinutes(startTime);
  const end = parseTimeToMinutes(endTime);
  if (start == null || end == null || end < start) return null;
  const span = end - start;
  return Math.max(0, span - 9 * 60);
}

function getStatusInfo(params: {
  date: Date;
  isHoliday: boolean;
  leaveRequest: LeaveRequestRow | null;
  attendance: AttendanceRow | null;
}) {
  const { isHoliday, leaveRequest, attendance } = params;

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

  if (attendance?.start_time || attendance?.end_time) {
    return { label: "出勤", type: "work" as const };
  }

  return { label: "未入力", type: "missing" as const };
}

export default function AttendanceClient() {
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [displayMonth, setDisplayMonth] = useState(() => getMonthStart(new Date()));
  const [attendanceRows, setAttendanceRows] = useState<AttendanceRow[]>([]);
  const [leaveRows, setLeaveRows] = useState<LeaveRequestRow[]>([]);
  const [holidaySet, setHolidaySet] = useState<Set<string>>(new Set());

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

      const [{ data: attendanceData, error: attendanceError }, { data: leaveData, error: leaveError }] =
        await Promise.all([
          supabase
            .from("attendance")
            .select("id,profile_id,work_date,start_time,end_time,break_out_time,break_in_time")
            .eq("profile_id", userId)
            .gte("work_date", from)
            .lte("work_date", to)
            .order("work_date", { ascending: true }),
          supabase
            .from("leave_request")
            .select("id,profile_id,work_date,leave_type,approval_status")
            .eq("profile_id", userId)
            .eq("approval_status", 1)
            .gte("work_date", from)
            .lte("work_date", to)
            .order("work_date", { ascending: true }),
        ]);

      if (attendanceError) throw new Error(attendanceError.message);
      if (leaveError) throw new Error(leaveError.message);

      setAttendanceRows((attendanceData ?? []) as AttendanceRow[]);
      setLeaveRows((leaveData ?? []) as LeaveRequestRow[]);

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
      const isWeekend = current.getDay() === 0 || current.getDay() === 6;
      const isHoliday = isWeekend || holidaySet.has(dateKey);

      const status = getStatusInfo({
        date: current,
        isHoliday,
        leaveRequest,
        attendance,
      });

      result.push({
        dateKey,
        dayLabel: `${current.getMonth() + 1}/${current.getDate()}`,
        weekday: current.getDay(),
        startTime: attendance?.start_time ?? null,
        breakOutTime: attendance?.break_out_time ?? null,
        breakInTime: attendance?.break_in_time ?? null,
        endTime: attendance?.end_time ?? null,
        workMinutes: getWorkedMinutes(attendance?.start_time ?? null, attendance?.end_time ?? null),
        overtimeMinutes: getOvertimeMinutes(attendance?.start_time ?? null, attendance?.end_time ?? null),
        statusLabel: status.label,
        statusType: status.type,
      });
    }

    return result;
  }, [attendanceRows, displayMonth, holidaySet, leaveRows]);

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

  return (
    <main className={styles.page}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>勤怠情報</h1>
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
                <th>退出</th>
                <th>再入</th>
                <th>退勤</th>
                <th>勤務時間</th>
                <th>残業</th>
                <th>ステータス</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className={styles.emptyCell}>読み込み中...</td>
                </tr>
              ) : dayRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className={styles.emptyCell}>データがありません。</td>
                </tr>
              ) : (
                dayRows.map((row) => {
                  const isSunday = row.weekday === 0;
                  const isSaturday = row.weekday === 6;

                  return (
                    <tr key={row.dateKey} className={row.statusType === "missing" ? styles.rowMissing : ""}>
                      <td className={`${styles.dateCell} ${isSunday ? styles.sunday : ""} ${isSaturday ? styles.saturday : ""}`}>
                        {row.dayLabel}
                      </td>
                      <td>{formatTime(row.startTime)}</td>
                      <td>{formatTime(row.breakOutTime)}</td>
                      <td>{formatTime(row.breakInTime)}</td>
                      <td>{formatTime(row.endTime)}</td>
                      <td>{formatDuration(row.workMinutes)}</td>
                      <td>{formatDuration(row.overtimeMinutes)}</td>
                      <td>
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