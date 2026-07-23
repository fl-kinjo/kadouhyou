"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/app/utils/supabase/client";
import styles from "./employee-report-client.module.css";

type ReportType = "attendance" | "expense";
type BandKey = "band5to12" | "band12to18" | "band18to22" | "band22to5";

type ProfileRow = {
  id: string;
  email: string | null;
  last_name: string | null;
  first_name: string | null;
  status: number | null;
  hire_date: string | null;
  scheduled_work_minutes: number | null;
  has_break: boolean | null;
};

type AttendanceRow = {
  id: string;
  profile_id: string;
  work_date: string;
  start_time: string | null;
  end_time: string | null;
  break_out_time: string | null;
  break_in_time: string | null;
};

type AttendanceBreakRow = {
  id: string;
  profile_id: string;
  work_date: string;
  break_out_time: string;
  break_in_time: string | null;
};

type AttendanceCorrectionRow = {
  id: string;
  profile_id: string;
  work_date: string;
  requested_start_time: string | null;
  requested_end_time: string | null;
  requested_away_minutes: number | null;
  requested_status_label: string;
  requested_at: string;
};

type LeaveRow = {
  id: string;
  profile_id: string;
  work_date: string;
  leave_type: number;
  request_group_id: string;
};

type ExpenseRow = {
  id: string;
  request_group_id: string;
  profile_id: string;
  expense_date: string | null;
  expense_name: string | null;
  purpose: string | null;
  invoice: boolean;
  amount: number | null;
  application_date: string;
};

type ReportPayload = {
  month_start: string;
  month_end_exclusive: string;
  generated_at: string;
  profiles: ProfileRow[];
  attendance: AttendanceRow[];
  attendance_breaks: AttendanceBreakRow[];
  approved_corrections: AttendanceCorrectionRow[];
  approved_leaves: LeaveRow[];
  approved_expenses: ExpenseRow[];
};

type BandMinutes = Record<BandKey, number>;

type MonthlySummaryRow = {
  profileId: string;
  name: string;
  band5to12: number;
  band12to18: number;
  band18to22: number;
  band22to5: number;
  breakMinutes: number;
  eventMinutes: number;
  workedMinutes: number;
  paidLeaveDays: number;
  halfLeaveDays: number;
  specialLeaveDays: number;
  summerLeaveDays: number;
  winterLeaveDays: number;
  unpaidLeaveDays: number;
  paidTotalMinutes: number;
  overtimeMinutes: number;
  lateNightMinutes: number;
  holidayWorkMinutes: number;
  absenceDays: number;
  otherHolidayAmount: number;
  specialAllowanceAmount: number;
  commutingAmount: number;
  otherExpenseAmount: number;
};

type ExpenseGroup = {
  requestGroupId: string;
  profileId: string;
  applicantName: string;
  applicationDate: string;
  rows: ExpenseRow[];
  totalAmount: number;
};

const EMPTY_BANDS: BandMinutes = {
  band5to12: 0,
  band12to18: 0,
  band18to22: 0,
  band22to5: 0,
};

function currentMonthValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function fullName(profile: ProfileRow | null | undefined) {
  if (!profile) return "";
  return `${profile.last_name ?? ""}${profile.first_name ?? ""}`.trim() || profile.email || "名称未設定";
}

function formatMonthTitle(value: string) {
  const [year, month] = value.split("-");
  return `${year}年${Number(month)}月`;
}

function formatDateJP(value: string | null | undefined) {
  if (!value) return "";

  if (value.includes("T")) {
    const parts = new Intl.DateTimeFormat("ja-JP", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date(value));
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}年${values.month}月${values.day}日`;
  }

  const [year, month, day] = value.slice(0, 10).split("-");
  return `${year}年${month}月${day}日`;
}

function getDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function parseTimeToMinutes(value: string | null | undefined) {
  if (!value) return null;
  const [hours, minutes] = value.slice(0, 5).split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
}

function overlapMinutes(startA: number, endA: number, startB: number, endB: number) {
  return Math.max(0, Math.min(endA, endB) - Math.max(startA, startB));
}

function getBandMinutes(start: number, end: number): BandMinutes {
  const bands: BandMinutes = { ...EMPTY_BANDS };
  const intervals: Array<{ key: BandKey; start: number; end: number }> = [];

  for (let dayOffset = 0; dayOffset <= 1; dayOffset += 1) {
    const base = dayOffset * 24 * 60;
    intervals.push(
      { key: "band22to5", start: base, end: base + 5 * 60 },
      { key: "band5to12", start: base + 5 * 60, end: base + 12 * 60 },
      { key: "band12to18", start: base + 12 * 60, end: base + 18 * 60 },
      { key: "band18to22", start: base + 18 * 60, end: base + 22 * 60 },
      { key: "band22to5", start: base + 22 * 60, end: base + 24 * 60 },
    );
  }

  for (const interval of intervals) {
    bands[interval.key] += overlapMinutes(start, end, interval.start, interval.end);
  }

  return bands;
}

function normalizeWorkInterval(startTime: string | null, endTime: string | null) {
  const start = parseTimeToMinutes(startTime);
  const rawEnd = parseTimeToMinutes(endTime);
  if (start == null || rawEnd == null) return null;

  const end = rawEnd < start ? rawEnd + 24 * 60 : rawEnd;
  return { start, end };
}

function normalizeBreakInterval(
  breakOutTime: string | null,
  breakInTime: string | null,
  workStart: number,
  workEnd: number,
) {
  let start = parseTimeToMinutes(breakOutTime);
  let end = parseTimeToMinutes(breakInTime);
  if (start == null || end == null) return null;

  if (end < start) end += 24 * 60;
  while (start < workStart && start + 24 * 60 < workEnd) {
    start += 24 * 60;
    end += 24 * 60;
  }

  const clippedStart = Math.max(start, workStart);
  const clippedEnd = Math.min(end, workEnd);
  if (clippedEnd <= clippedStart) return null;
  return { start: clippedStart, end: clippedEnd };
}

function subtractBands(base: BandMinutes, subtraction: BandMinutes) {
  return {
    band5to12: Math.max(0, base.band5to12 - subtraction.band5to12),
    band12to18: Math.max(0, base.band12to18 - subtraction.band12to18),
    band18to22: Math.max(0, base.band18to22 - subtraction.band18to22),
    band22to5: Math.max(0, base.band22to5 - subtraction.band22to5),
  } satisfies BandMinutes;
}

function subtractUnpositionedBreak(base: BandMinutes, breakMinutes: number) {
  const result = { ...base };
  let remaining = Math.max(0, breakMinutes);
  const keys = (Object.keys(result) as BandKey[]).sort((a, b) => result[b] - result[a]);

  for (const key of keys) {
    if (remaining <= 0) break;
    const deducted = Math.min(result[key], remaining);
    result[key] -= deducted;
    remaining -= deducted;
  }

  return result;
}

function sumBands(bands: BandMinutes) {
  return bands.band5to12 + bands.band12to18 + bands.band18to22 + bands.band22to5;
}

function formatHours(minutes: number) {
  return (Math.max(0, minutes) / 60).toFixed(2);
}

function formatDays(days: number) {
  return Number.isInteger(days) ? String(days) : days.toFixed(1);
}

function formatCurrency(amount: number) {
  return `${Math.round(amount).toLocaleString("ja-JP")}円`;
}

function isCommutingExpense(row: ExpenseRow) {
  const expenseName = row.expense_name ?? "";
  const purpose = row.purpose ?? "";
  return expenseName.includes("交通費") && purpose.includes("通勤");
}

function getBusinessDates(monthValue: string, holidaySet: Set<string>) {
  const [year, month] = monthValue.split("-").map(Number);
  const lastDate = new Date(year, month, 0).getDate();
  const result: string[] = [];

  for (let day = 1; day <= lastDate; day += 1) {
    const date = new Date(year, month - 1, day);
    const dateKey = getDateKey(date);
    const weekend = date.getDay() === 0 || date.getDay() === 6;
    if (!weekend && !holidaySet.has(dateKey)) result.push(dateKey);
  }

  return result;
}

async function fetchJapaneseHolidaySet() {
  const response = await fetch("https://holidays-jp.github.io/api/v1/date.json", {
    cache: "force-cache",
  });
  if (!response.ok) throw new Error("祝日データの取得に失敗しました。");
  const data = (await response.json()) as Record<string, string>;
  return new Set(Object.keys(data));
}

export default function EmployeeReportClient() {
  const supabase = createClient();
  const [reportType, setReportType] = useState<ReportType>("attendance");
  const [targetMonth, setTargetMonth] = useState(currentMonthValue());
  const [payload, setPayload] = useState<ReportPayload | null>(null);
  const [holidaySet, setHolidaySet] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [warningMessage, setWarningMessage] = useState("");
  const [selectedExpenseProfileId, setSelectedExpenseProfileId] = useState("");
  const [selectedExpenseGroupId, setSelectedExpenseGroupId] = useState("");

  const load = async () => {
    setLoading(true);
    setErrorMessage("");
    setWarningMessage("");

    try {
      const { data: canView, error: permissionError } = await supabase.rpc(
        "can_manage_employee_work_settings",
      );
      if (permissionError) throw new Error(permissionError.message);
      if (canView !== true) throw new Error("この帳票を閲覧する権限がありません。");

      const [reportResult, holidayResult] = await Promise.allSettled([
        supabase.rpc("get_accounting_report_source_data", {
          target_month: `${targetMonth}-01`,
        }),
        fetchJapaneseHolidaySet(),
      ]);

      if (reportResult.status === "rejected") {
        throw reportResult.reason;
      }
      if (reportResult.value.error) {
        throw new Error(reportResult.value.error.message);
      }

      setPayload(reportResult.value.data as ReportPayload);

      if (holidayResult.status === "fulfilled") {
        setHolidaySet(holidayResult.value);
      } else {
        setHolidaySet(new Set());
        setWarningMessage("祝日データを取得できなかったため、土日だけを休日として集計しています。");
      }
    } catch (error) {
      setPayload(null);
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [targetMonth]);

  const profilesById = useMemo(
    () => new Map((payload?.profiles ?? []).map((profile) => [profile.id, profile])),
    [payload],
  );

  const monthlySummaryRows = useMemo<MonthlySummaryRow[]>(() => {
    if (!payload) return [];

    const attendanceByDate = new Map<string, AttendanceRow>();
    for (const row of payload.attendance) {
      attendanceByDate.set(`${row.profile_id}_${row.work_date}`, row);
    }

    const breaksByDate = new Map<string, AttendanceBreakRow[]>();
    for (const row of payload.attendance_breaks) {
      const key = `${row.profile_id}_${row.work_date}`;
      if (!breaksByDate.has(key)) breaksByDate.set(key, []);
      breaksByDate.get(key)!.push(row);
    }

    const correctionByDate = new Map<string, AttendanceCorrectionRow>();
    for (const row of payload.approved_corrections) {
      const key = `${row.profile_id}_${row.work_date}`;
      const current = correctionByDate.get(key);
      if (!current || current.requested_at < row.requested_at) correctionByDate.set(key, row);
    }

    const leavesByDate = new Map<string, LeaveRow[]>();
    for (const row of payload.approved_leaves) {
      const key = `${row.profile_id}_${row.work_date}`;
      if (!leavesByDate.has(key)) leavesByDate.set(key, []);
      leavesByDate.get(key)!.push(row);
    }

    const expensesByProfile = new Map<string, ExpenseRow[]>();
    for (const row of payload.approved_expenses) {
      if (!expensesByProfile.has(row.profile_id)) expensesByProfile.set(row.profile_id, []);
      expensesByProfile.get(row.profile_id)!.push(row);
    }

    const [year, month] = targetMonth.split("-").map(Number);
    const lastDate = new Date(year, month, 0).getDate();

    return payload.profiles
      .map((profile) => {
        const hasMonthlyData =
          payload.attendance.some((row) => row.profile_id === profile.id) ||
          payload.approved_corrections.some((row) => row.profile_id === profile.id) ||
          payload.approved_leaves.some((row) => row.profile_id === profile.id) ||
          payload.approved_expenses.some((row) => row.profile_id === profile.id);

        if (profile.status === 2 && !hasMonthlyData) return null;

        const row: MonthlySummaryRow = {
          profileId: profile.id,
          name: fullName(profile),
          ...EMPTY_BANDS,
          breakMinutes: 0,
          eventMinutes: 0,
          workedMinutes: 0,
          paidLeaveDays: 0,
          halfLeaveDays: 0,
          specialLeaveDays: 0,
          summerLeaveDays: 0,
          winterLeaveDays: 0,
          unpaidLeaveDays: 0,
          paidTotalMinutes: 0,
          overtimeMinutes: 0,
          lateNightMinutes: 0,
          holidayWorkMinutes: 0,
          absenceDays: 0,
          otherHolidayAmount: 0,
          specialAllowanceAmount: 0,
          commutingAmount: 0,
          otherExpenseAmount: 0,
        };

        const scheduledMinutes = profile.scheduled_work_minutes ?? 8 * 60;
        let paidLeaveMinutes = 0;

        for (let day = 1; day <= lastDate; day += 1) {
          const currentDate = new Date(year, month - 1, day);
          const dateKey = getDateKey(currentDate);
          const recordKey = `${profile.id}_${dateKey}`;
          const attendance = attendanceByDate.get(recordKey) ?? null;
          const correction = correctionByDate.get(recordKey) ?? null;
          const leaveRows = leavesByDate.get(recordKey) ?? [];
          const isWeekend = currentDate.getDay() === 0 || currentDate.getDay() === 6;
          const isHoliday = isWeekend || holidaySet.has(dateKey);
          const startedEmployment = !profile.hire_date || profile.hire_date <= dateKey;

          for (const leave of leaveRows) {
            switch (leave.leave_type) {
              case 0:
                row.paidLeaveDays += 1;
                paidLeaveMinutes += scheduledMinutes;
                break;
              case 1:
              case 2:
                row.halfLeaveDays += 0.5;
                paidLeaveMinutes += scheduledMinutes / 2;
                break;
              case 3:
                row.specialLeaveDays += 1;
                paidLeaveMinutes += scheduledMinutes;
                break;
              case 4:
                row.unpaidLeaveDays += 1;
                break;
              case 5:
                row.summerLeaveDays += 1;
                paidLeaveMinutes += scheduledMinutes;
                break;
              default:
                break;
            }
          }

          const startTime = correction?.requested_start_time ?? attendance?.start_time ?? null;
          const endTime = correction?.requested_end_time ?? attendance?.end_time ?? null;
          const workInterval = normalizeWorkInterval(startTime, endTime);
          let netBands: BandMinutes = { ...EMPTY_BANDS };
          let breakMinutes = 0;

          if (workInterval) {
            const grossBands = getBandMinutes(workInterval.start, workInterval.end);

            if (correction?.requested_away_minutes != null) {
              breakMinutes = Math.max(0, correction.requested_away_minutes);
              netBands = subtractUnpositionedBreak(grossBands, breakMinutes);
            } else {
              const breakRows = breaksByDate.get(recordKey) ?? [];
              const intervalRows = breakRows.length > 0
                ? breakRows.map((breakRow) => ({
                    out: breakRow.break_out_time,
                    back: breakRow.break_in_time,
                  }))
                : attendance?.break_out_time && attendance?.break_in_time
                  ? [{ out: attendance.break_out_time, back: attendance.break_in_time }]
                  : [];

              const breakBands: BandMinutes = { ...EMPTY_BANDS };
              for (const intervalRow of intervalRows) {
                const interval = normalizeBreakInterval(
                  intervalRow.out,
                  intervalRow.back,
                  workInterval.start,
                  workInterval.end,
                );
                if (!interval) continue;
                const intervalBands = getBandMinutes(interval.start, interval.end);
                breakBands.band5to12 += intervalBands.band5to12;
                breakBands.band12to18 += intervalBands.band12to18;
                breakBands.band18to22 += intervalBands.band18to22;
                breakBands.band22to5 += intervalBands.band22to5;
                breakMinutes += interval.end - interval.start;
              }
              netBands = subtractBands(grossBands, breakBands);
            }
          }

          const workMinutes = sumBands(netBands);
          row.band5to12 += netBands.band5to12;
          row.band12to18 += netBands.band12to18;
          row.band18to22 += netBands.band18to22;
          row.band22to5 += netBands.band22to5;
          row.breakMinutes += Math.min(breakMinutes, workInterval ? workInterval.end - workInterval.start : 0);
          row.workedMinutes += workMinutes;
          row.lateNightMinutes += netBands.band22to5;

          if (isHoliday) {
            row.holidayWorkMinutes += workMinutes;
          } else {
            row.overtimeMinutes += Math.max(0, workMinutes - scheduledMinutes);
          }

          const explicitlyAbsent = correction?.requested_status_label?.includes("欠勤") === true;
          const hasLeave = leaveRows.length > 0;
          const shouldCountAbsence =
            startedEmployment &&
            (profile.status ?? 0) === 0 &&
            !isHoliday &&
            !hasLeave &&
            ((explicitlyAbsent && workMinutes === 0) || (!startTime && !endTime));

          if (shouldCountAbsence) row.absenceDays += 1;
        }

        row.paidTotalMinutes = row.workedMinutes + paidLeaveMinutes;

        for (const expense of expensesByProfile.get(profile.id) ?? []) {
          const amount = expense.amount ?? 0;
          if (isCommutingExpense(expense)) row.commutingAmount += amount;
          else row.otherExpenseAmount += amount;
        }

        return row;
      })
      .filter((row): row is MonthlySummaryRow => row !== null)
      .sort((a, b) => a.name.localeCompare(b.name, "ja"));
  }, [holidaySet, payload, targetMonth]);

  const expenseGroups = useMemo<ExpenseGroup[]>(() => {
    if (!payload) return [];
    const groupMap = new Map<string, ExpenseRow[]>();

    for (const row of payload.approved_expenses) {
      if (!groupMap.has(row.request_group_id)) groupMap.set(row.request_group_id, []);
      groupMap.get(row.request_group_id)!.push(row);
    }

    return Array.from(groupMap.entries())
      .map(([requestGroupId, rows]) => {
        const sortedRows = [...rows].sort((a, b) =>
          (a.expense_date ?? "").localeCompare(b.expense_date ?? ""),
        );
        const first = sortedRows[0];
        return {
          requestGroupId,
          profileId: first.profile_id,
          applicantName: fullName(profilesById.get(first.profile_id)),
          applicationDate: first.application_date,
          rows: sortedRows,
          totalAmount: sortedRows.reduce((sum, row) => sum + (row.amount ?? 0), 0),
        };
      })
      .sort((a, b) => b.applicationDate.localeCompare(a.applicationDate));
  }, [payload, profilesById]);

  const expenseProfiles = useMemo(() => {
    const profileIds = new Set(expenseGroups.map((group) => group.profileId));
    return (payload?.profiles ?? [])
      .filter((profile) => profileIds.has(profile.id))
      .sort((a, b) => fullName(a).localeCompare(fullName(b), "ja"));
  }, [expenseGroups, payload]);

  const filteredExpenseGroups = useMemo(
    () => expenseGroups.filter((group) => !selectedExpenseProfileId || group.profileId === selectedExpenseProfileId),
    [expenseGroups, selectedExpenseProfileId],
  );

  useEffect(() => {
    if (filteredExpenseGroups.length === 0) {
      setSelectedExpenseGroupId("");
      return;
    }
    if (!filteredExpenseGroups.some((group) => group.requestGroupId === selectedExpenseGroupId)) {
      setSelectedExpenseGroupId(filteredExpenseGroups[0].requestGroupId);
    }
  }, [filteredExpenseGroups, selectedExpenseGroupId]);

  const selectedExpenseGroup = useMemo(
    () => expenseGroups.find((group) => group.requestGroupId === selectedExpenseGroupId) ?? null,
    [expenseGroups, selectedExpenseGroupId],
  );

  const businessDayCount = useMemo(
    () => getBusinessDates(targetMonth, holidaySet).length,
    [holidaySet, targetMonth],
  );

  const printReport = () => window.print();

  return (
    <main className={styles.page}>
      <div className={styles.noPrint}>
        <header className={styles.pageHeader}>
          <div>
            <h1 className={styles.pageTitle}>帳票出力</h1>
            <p className={styles.pageDescription}>月次勤怠集計表と承認済み経費申請書を出力します。</p>
          </div>
          <Link href="/employee" className={styles.backLink}>社員管理へ戻る</Link>
        </header>

        <section className={styles.controlPanel}>
          <div className={styles.controlField}>
            <label htmlFor="report-type">帳票</label>
            <select
              id="report-type"
              value={reportType}
              onChange={(event) => setReportType(event.target.value as ReportType)}
            >
              <option value="attendance">月次勤怠集計表</option>
              <option value="expense">経費申請書</option>
            </select>
          </div>

          <div className={styles.controlField}>
            <label htmlFor="target-month">対象月</label>
            <input
              id="target-month"
              type="month"
              value={targetMonth}
              onChange={(event) => setTargetMonth(event.target.value)}
            />
          </div>

          {reportType === "expense" && (
            <>
              <div className={styles.controlField}>
                <label htmlFor="expense-profile">申請者</label>
                <select
                  id="expense-profile"
                  value={selectedExpenseProfileId}
                  onChange={(event) => setSelectedExpenseProfileId(event.target.value)}
                >
                  <option value="">すべて</option>
                  {expenseProfiles.map((profile) => (
                    <option key={profile.id} value={profile.id}>{fullName(profile)}</option>
                  ))}
                </select>
              </div>

              <div className={`${styles.controlField} ${styles.wideControlField}`}>
                <label htmlFor="expense-group">申請</label>
                <select
                  id="expense-group"
                  value={selectedExpenseGroupId}
                  onChange={(event) => setSelectedExpenseGroupId(event.target.value)}
                >
                  {filteredExpenseGroups.length === 0 && <option value="">承認済み申請なし</option>}
                  {filteredExpenseGroups.map((group) => (
                    <option key={group.requestGroupId} value={group.requestGroupId}>
                      {group.applicantName} / {formatDateJP(group.applicationDate)} / {formatCurrency(group.totalAmount)}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          <button type="button" className={styles.reloadButton} onClick={load} disabled={loading}>
            再読み込み
          </button>
          <button
            type="button"
            className={styles.printButton}
            onClick={printReport}
            disabled={loading || !payload || (reportType === "expense" && !selectedExpenseGroup)}
          >
            PDF出力・印刷
          </button>
        </section>

        <p className={styles.printHelp}>印刷画面の送信先で「PDFに保存」を選ぶとPDFとして出力できます。</p>
        {warningMessage && <p className={styles.warningText}>{warningMessage}</p>}
        {errorMessage && <p className={styles.errorText}>{errorMessage}</p>}
      </div>

      {loading ? (
        <div className={styles.loading}>読み込み中...</div>
      ) : reportType === "attendance" ? (
        <section className={`${styles.reportSheet} ${styles.monthlySheet}`}>
          <div className={styles.monthlyTitleRow}>
            <h2>{formatMonthTitle(targetMonth)}</h2>
            <p>所定労働時間: {businessDayCount * 8}h（{businessDayCount}日×8h）</p>
          </div>
          <p className={styles.reportNote}>勤務時間・休憩・残業・深夜は時間、有給等は日数、手当・経費は円で表示しています。</p>

          <div className={styles.monthlyTableScroll}>
            <table className={styles.monthlyTable}>
              <thead>
                <tr>
                  <th rowSpan={2}>Name</th>
                  <th colSpan={7}>勤務時間</th>
                  <th colSpan={7}>休暇</th>
                  <th colSpan={4}>集計</th>
                  <th colSpan={4}>その他</th>
                </tr>
                <tr>
                  <th>5-12</th>
                  <th>12-18</th>
                  <th>18-22</th>
                  <th>22-5</th>
                  <th>休憩</th>
                  <th>行事</th>
                  <th>労働</th>
                  <th>有給</th>
                  <th>半休</th>
                  <th>特別</th>
                  <th>夏季</th>
                  <th>冬季</th>
                  <th>無給</th>
                  <th>合計</th>
                  <th>残業</th>
                  <th>深夜</th>
                  <th>休日</th>
                  <th>欠勤</th>
                  <th>休日</th>
                  <th>特別手当</th>
                  <th>通勤手当</th>
                  <th>諸経費</th>
                </tr>
              </thead>
              <tbody>
                {monthlySummaryRows.length === 0 ? (
                  <tr><td colSpan={23}>対象データがありません。</td></tr>
                ) : monthlySummaryRows.map((row) => (
                  <tr key={row.profileId}>
                    <th>{row.name}</th>
                    <td>{formatHours(row.band5to12)}</td>
                    <td>{formatHours(row.band12to18)}</td>
                    <td>{formatHours(row.band18to22)}</td>
                    <td>{formatHours(row.band22to5)}</td>
                    <td>{formatHours(row.breakMinutes)}</td>
                    <td>{formatHours(row.eventMinutes)}</td>
                    <td>{formatHours(row.workedMinutes)}</td>
                    <td>{formatDays(row.paidLeaveDays)}</td>
                    <td>{formatDays(row.halfLeaveDays)}</td>
                    <td>{formatDays(row.specialLeaveDays)}</td>
                    <td>{formatDays(row.summerLeaveDays)}</td>
                    <td>{formatDays(row.winterLeaveDays)}</td>
                    <td>{formatDays(row.unpaidLeaveDays)}</td>
                    <td>{formatHours(row.paidTotalMinutes)}</td>
                    <td>{formatHours(row.overtimeMinutes)}</td>
                    <td>{formatHours(row.lateNightMinutes)}</td>
                    <td>{formatHours(row.holidayWorkMinutes)}</td>
                    <td>{formatDays(row.absenceDays)}</td>
                    <td>{formatCurrency(row.otherHolidayAmount)}</td>
                    <td>{formatCurrency(row.specialAllowanceAmount)}</td>
                    <td>{formatCurrency(row.commutingAmount)}</td>
                    <td>{formatCurrency(row.otherExpenseAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : selectedExpenseGroup ? (
        <section className={`${styles.reportSheet} ${styles.expenseSheet}`}>
          <h2 className={styles.expenseTitle}>経費申請書</h2>
          <div className={styles.expenseMetaRow}>
            <table className={styles.applicantTable}>
              <tbody><tr><th>申請者</th><td>{selectedExpenseGroup.applicantName}</td></tr></tbody>
            </table>
            <p><strong>申請日:</strong> {formatDateJP(selectedExpenseGroup.applicationDate)}</p>
          </div>

          <table className={styles.expenseTable}>
            <thead>
              <tr><th>日付</th><th>用途</th><th>インボイス</th><th>金額</th></tr>
            </thead>
            <tbody>
              {selectedExpenseGroup.rows.map((row) => (
                <tr key={row.id}>
                  <td>{formatDateJP(row.expense_date)}</td>
                  <td>{row.purpose || row.expense_name || ""}</td>
                  <td className={styles.centerCell}>{row.invoice ? "○" : "×"}</td>
                  <td className={styles.amountCell}>{formatCurrency(row.amount ?? 0)}</td>
                </tr>
              ))}
              <tr className={styles.totalRow}>
                <td colSpan={3}>合計</td>
                <td className={styles.amountCell}>{formatCurrency(selectedExpenseGroup.totalAmount)}</td>
              </tr>
            </tbody>
          </table>
        </section>
      ) : (
        <div className={styles.emptyState}>対象月に承認済みの経費申請がありません。</div>
      )}
    </main>
  );
}
