"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/app/utils/supabase/client";
import styles from "../attendance-client.module.css";

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

type ProfileRow = {
  id: string;
  last_name: string | null;
  first_name: string | null;
  email: string | null;
  is_admin?: number | null;
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
};

type EditFormState = {
  work_date: string;
  start_time: string;
  break_out_time: string;
  break_in_time: string;
  end_time: string;
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
  return Math.max(0, end - start - 9 * 60);
}

function fullName(profile: ProfileRow | null) {
  if (!profile) return "";
  const name = `${profile.last_name ?? ""}${profile.first_name ?? ""}`.trim();
  return name || (profile.email ?? "");
}

function getStatusInfo(params: {
  isHoliday: boolean;
  leaveRequest: LeaveRequestRow | null;
  attendance: AttendanceRow | null;
}) {
  const { isHoliday, leaveRequest, attendance } = params;

  if (isHoliday) {
    return { label: "休日", type: "holiday" as const };
  }

  if (leaveRequest) {
    switch (leaveRequest.leave_type) {
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
        return { label: LEAVE_TYPE_LABELS[leaveRequest.leave_type] ?? "-", type: "none" as const };
    }
  }

  if (attendance?.start_time || attendance?.end_time) {
    return { label: "出勤", type: "work" as const };
  }

  return { label: "未入力", type: "missing" as const };
}

function formatDateForPopup(dateKey: string) {
  const date = new Date(`${dateKey}T00:00:00`);
  const week = ["日", "月", "火", "水", "木", "金", "土"][date.getDay()];
  return `${date.getMonth() + 1}月${date.getDate()}日（${week}）`;
}

function normalizeInputTime(value: string) {
  const text = value.trim();
  return text || "";
}

export default function AttendanceDetailClient({ profileId }: { profileId: string }) {
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [displayMonth, setDisplayMonth] = useState(() => getMonthStart(new Date()));
  const [attendanceRows, setAttendanceRows] = useState<AttendanceRow[]>([]);
  const [leaveRows, setLeaveRows] = useState<LeaveRequestRow[]>([]);
  const [holidaySet, setHolidaySet] = useState<Set<string>>(new Set());
  const [targetProfile, setTargetProfile] = useState<ProfileRow | null>(null);

  const [isAdmin, setIsAdmin] = useState(false);
  const [editTarget, setEditTarget] = useState<DayRow | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editForm, setEditForm] = useState<EditFormState>({
    work_date: "",
    start_time: "",
    break_out_time: "",
    break_in_time: "",
    end_time: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    setMessage("");

    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw new Error(authError.message);
      const authUserId = authData.user?.id;
      if (!authUserId) throw new Error("ログインユーザーを取得できません。");

      const monthStart = getMonthStart(displayMonth);
      const monthEnd = getMonthEnd(displayMonth);
      const from = getDateKey(monthStart);
      const to = getDateKey(monthEnd);

      const [
        { data: attendanceData, error: attendanceError },
        { data: leaveData, error: leaveError },
        { data: profileData, error: profileError },
        { data: currentProfileData, error: currentProfileError },
      ] = await Promise.all([
        supabase
          .from("attendance")
          .select("id,profile_id,work_date,start_time,end_time,break_out_time,break_in_time")
          .eq("profile_id", profileId)
          .gte("work_date", from)
          .lte("work_date", to)
          .order("work_date", { ascending: true }),
        supabase
          .from("leave_request")
          .select("id,profile_id,work_date,leave_type,approval_status")
          .eq("profile_id", profileId)
          .eq("approval_status", 1)
          .gte("work_date", from)
          .lte("work_date", to)
          .order("work_date", { ascending: true }),
        supabase
          .from("profiles_2")
          .select("id,last_name,first_name,email")
          .eq("id", profileId)
          .maybeSingle(),
        supabase
          .from("profiles_2")
          .select("id,is_admin")
          .eq("id", authUserId)
          .maybeSingle(),
      ]);

      if (attendanceError) throw new Error(attendanceError.message);
      if (leaveError) throw new Error(leaveError.message);
      if (profileError) throw new Error(profileError.message);
      if (currentProfileError) throw new Error(currentProfileError.message);

      setAttendanceRows((attendanceData ?? []) as AttendanceRow[]);
      setLeaveRows((leaveData ?? []) as LeaveRequestRow[]);
      setTargetProfile((profileData ?? null) as ProfileRow | null);
      setIsAdmin((currentProfileData as ProfileRow | null)?.is_admin === 1);

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
  }, [displayMonth, profileId, supabase]);

  useEffect(() => {
    load();
  }, [load]);

  const dayRows = useMemo<DayRow[]>(() => {
    const attendanceMap = new Map(attendanceRows.map((row) => [row.work_date, row]));
    const leaveMap = new Map(leaveRows.map((row) => [row.work_date, row]));

    const rows: DayRow[] = [];
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
        isHoliday,
        leaveRequest,
        attendance,
      });

      rows.push({
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

    return rows;
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

  const openEditModal = (row: DayRow) => {
    setEditTarget(row);
    setEditForm({
      work_date: row.dateKey,
      start_time: row.startTime ? row.startTime.slice(0, 5) : "",
      break_out_time: row.breakOutTime ? row.breakOutTime.slice(0, 5) : "",
      break_in_time: row.breakInTime ? row.breakInTime.slice(0, 5) : "",
      end_time: row.endTime ? row.endTime.slice(0, 5) : "",
    });
  };

  const closeEditModal = () => {
    if (editSaving) return;
    setEditTarget(null);
  };

  const saveEdit = async () => {
    if (!editTarget) return;

    setEditSaving(true);
    setMessage("");

    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw new Error(authError.message);
      const authUserId = authData.user?.id;
      if (!authUserId) throw new Error("ログインユーザーを取得できません。");

      const payload = {
        profile_id: profileId,
        work_date: editForm.work_date,
        start_time: normalizeInputTime(editForm.start_time) || null,
        break_out_time: normalizeInputTime(editForm.break_out_time) || null,
        break_in_time: normalizeInputTime(editForm.break_in_time) || null,
        end_time: normalizeInputTime(editForm.end_time) || null,
        updated_by: authUserId,
      };

      const { error } = await supabase
        .from("attendance")
        .upsert(payload, { onConflict: "profile_id,work_date" });

      if (error) throw new Error(error.message);

      setEditTarget(null);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setEditSaving(false);
    }
  };

  return (
    <main className={styles.page}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>勤怠情報</h1>
        <p className={styles.message}>{targetProfile ? `${fullName(targetProfile)} の勤怠` : ""}</p>
        <p>
          <Link href="/attendance-management">← 勤怠管理へ戻る</Link>
        </p>
      </div>

      {!targetProfile && message && <p className={styles.message}>{message}</p>}

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
                {isAdmin && <th>操作</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={isAdmin ? 9 : 8} className={styles.emptyCell}>読み込み中...</td>
                </tr>
              ) : dayRows.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? 9 : 8} className={styles.emptyCell}>データがありません。</td>
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
                      {isAdmin && (
                        <td>
                          <button type="button" className={styles.editButton} onClick={() => openEditModal(row)}>
                            修正
                          </button>
                        </td>
                      )}
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
            <h2 className={styles.modalTitle}>打刻修正</h2>

            <div className={styles.modalSubTitle}>
              <span>{fullName(targetProfile)}</span>
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
                  <label className={styles.modalLabel}>退出</label>
                  <input
                    type="time"
                    value={editForm.break_out_time}
                    onChange={(event) =>
                      setEditForm((current) => ({ ...current, break_out_time: event.target.value }))
                    }
                    className={styles.modalInput}
                  />
                </div>
              </div>

              <div className={styles.modalFieldRow}>
                <div className={styles.modalField}>
                  <label className={styles.modalLabel}>再入</label>
                  <input
                    type="time"
                    value={editForm.break_in_time}
                    onChange={(event) =>
                      setEditForm((current) => ({ ...current, break_in_time: event.target.value }))
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
            </div>

            <div className={styles.modalActionRow}>
              <button
                type="button"
                className={styles.modalCancelButton}
                onClick={closeEditModal}
                disabled={editSaving}
              >
                キャンセル
              </button>
              <button
                type="button"
                className={styles.modalSaveButton}
                onClick={saveEdit}
                disabled={editSaving}
              >
                {editSaving ? "保存中..." : "保存する"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}