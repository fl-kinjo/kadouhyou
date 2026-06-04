"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/app/utils/supabase/client";
import styles from "./attendance-management-client.module.css";

type LeaveRequestRow = {
  id: string;
  profile_id: string;
  work_date: string;
  leave_type: number;
  approval_status: number;
  request_group_id: string;
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
  requested_status_label: string;
  comment: string | null;
  approval_status: number;
  requested_at: string;
};

type ProfileRow = {
  id: string;
  last_name: string | null;
  first_name: string | null;
  email: string | null;
};

type ProfileJobRow = {
  profile_id: string;
  job_id: string;
};

type JobRow = {
  id: string;
  name: string;
};

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

type GroupedLeaveRequest = {
  requestGroupId: string;
  profileId: string;
  applicantName: string;
  createdAt: string;
  comment: string;
  approvalStatus: number;
  items: {
    id: string;
    work_date: string;
    leave_type: number;
  }[];
  totalDays: number;
  dateRangeLabel: string;
};

type CorrectionRequestCard = {
  id: string;
  profileId: string;
  applicantName: string;
  requestedAt: string;
  workDate: string;
  beforeStartTime: string | null;
  beforeEndTime: string | null;
  beforeAwayMinutes: number | null;
  beforeStatusLabel: string | null;
  requestedStartTime: string | null;
  requestedEndTime: string | null;
  requestedAwayMinutes: number | null;
  requestedStatusLabel: string;
  comment: string;
  approvalStatus: number;
};

type EmployeeSummaryRow = {
  profileId: string;
  name: string;
  teamName: string;
  workedMinutes: number;
  overtimeMinutes: number;
  paidLeaveDays: number;
  missingDays: number;
  pendingCount: number;
};

type MainTab = "employee" | "request";
type RequestSubTab = "leave" | "attendanceCorrection";

const LEAVE_TYPE_LABELS: Record<number, string> = {
  0: "有給",
  1: "午前半休",
  2: "午後半休",
  3: "特別休暇",
  4: "無給",
  5: "夏休",
};

const APPROVAL_STATUS_LABELS: Record<number, string> = {
  0: "承認待ち",
  1: "承認済み",
  2: "却下",
  3: "取消",
};

function formatDateJP(dateText: string) {
  return dateText.replaceAll("-", "/");
}

function getLeaveTypeLabel(value: number) {
  return LEAVE_TYPE_LABELS[value] ?? String(value);
}

function getLeaveDays(value: number) {
  if (value === 1 || value === 2) return 0.5;
  return 1;
}

function formatDays(value: number) {
  return Number.isInteger(value) ? `${value.toFixed(1)}日分` : `${value}日分`;
}

function fullName(profile: ProfileRow | null | undefined) {
  if (!profile) return "";
  const name = `${profile.last_name ?? ""}${profile.first_name ?? ""}`.trim();
  return name || (profile.email ?? "");
}

function getMonthStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function getMonthEnd(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 1);
}

function getMonthLastDate(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function formatMonthTitle(date: Date) {
  return `${date.getFullYear()}年${date.getMonth() + 1}月`;
}

function getStatusClass(status: number) {
  switch (status) {
    case 1:
      return styles.statusApproved;
    case 2:
    case 3:
      return styles.statusRejected;
    default:
      return styles.statusPending;
  }
}

function parseTimeToMinutes(value: string | null) {
  if (!value) return null;
  const text = value.slice(0, 5);
  const [hh, mm] = text.split(":").map(Number);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  return hh * 60 + mm;
}

function formatTime(value: string | null) {
  if (!value) return "--:--";
  return value.slice(0, 5);
}

function formatDuration(minutes: number | null) {
  if (minutes == null) return "--:--";
  const safe = Math.max(0, minutes);
  const hh = String(Math.floor(safe / 60)).padStart(2, "0");
  const mm = String(safe % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

function getWorkedMinutes(startTime: string | null, endTime: string | null, awayMinutes: number | null) {
  const start = parseTimeToMinutes(startTime);
  const end = parseTimeToMinutes(endTime);
  if (start == null || end == null || end < start) return 0;
  return Math.max(0, end - start - Math.max(0, awayMinutes ?? 0));
}

function getOvertimeMinutes(workMinutes: number) {
  return Math.max(0, workMinutes - 8 * 60);
}

function formatSummaryDuration(minutes: number) {
  const safe = Math.max(0, minutes);
  const hh = String(Math.floor(safe / 60)).padStart(2, "0");
  const mm = String(safe % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

function getDateKey(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

async function fetchJapaneseHolidaySet(): Promise<Set<string>> {
  const response = await fetch("https://holidays-jp.github.io/api/v1/date.json", {
    cache: "force-cache",
  });
  if (!response.ok) {
    throw new Error("祝日データの取得に失敗しました。");
  }
  const json = (await response.json()) as Record<string, string>;
  return new Set(Object.keys(json));
}

function getAwayMinutesByDate(rows: AttendanceBreakRow[]) {
  const map = new Map<string, number>();

  for (const row of rows) {
    const out = parseTimeToMinutes(row.break_out_time);
    const back = parseTimeToMinutes(row.break_in_time);
    if (out == null || back == null || back < out) continue;

    map.set(`${row.profile_id}_${row.work_date}`, (map.get(`${row.profile_id}_${row.work_date}`) ?? 0) + (back - out));
  }

  return map;
}

function getLatestApprovedCorrectionMap(rows: AttendanceCorrectionRequestRow[]) {
  const map = new Map<string, AttendanceCorrectionRequestRow>();

  for (const row of rows) {
    if (row.approval_status !== 1) continue;
    const key = `${row.profile_id}_${row.work_date}`;
    const current = map.get(key);
    if (!current || current.requested_at < row.requested_at) {
      map.set(key, row);
    }
  }

  return map;
}

export default function AttendanceManagementClient() {
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState("");
  const [message, setMessage] = useState("");
  const [displayMonth, setDisplayMonth] = useState(() => getMonthStart(new Date()));
  const [activeMainTab, setActiveMainTab] = useState<MainTab>("employee");
  const [activeRequestSubTab, setActiveRequestSubTab] = useState<RequestSubTab>("leave");

  const [leaveRequestListRows, setLeaveRequestListRows] = useState<LeaveRequestRow[]>([]);
  const [leaveSummaryRows, setLeaveSummaryRows] = useState<LeaveRequestRow[]>([]);
  const [correctionRequestListRows, setCorrectionRequestListRows] = useState<AttendanceCorrectionRequestRow[]>([]);
  const [correctionSummaryRows, setCorrectionSummaryRows] = useState<AttendanceCorrectionRequestRow[]>([]);

  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [profileJobs, setProfileJobs] = useState<ProfileJobRow[]>([]);
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [attendanceRows, setAttendanceRows] = useState<AttendanceRow[]>([]);
  const [attendanceBreakRows, setAttendanceBreakRows] = useState<AttendanceBreakRow[]>([]);
  const [holidaySet, setHolidaySet] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setMessage("");

    try {
      const monthStart = getMonthStart(displayMonth);
      const monthEnd = getMonthEnd(displayMonth);
      const monthLastDate = getMonthLastDate(displayMonth);

      const fromDate = getDateKey(monthStart);
      const toDate = getDateKey(monthLastDate);
      const fromCreatedAt = monthStart.toISOString();
      const toCreatedAt = monthEnd.toISOString();

      const [
        { data: leaveRequestListData, error: leaveRequestListError },
        { data: leaveSummaryData, error: leaveSummaryError },
        { data: correctionRequestListData, error: correctionRequestListError },
        { data: correctionSummaryData, error: correctionSummaryError },
        { data: profileData, error: profileError },
        { data: profileJobData, error: profileJobError },
        { data: jobData, error: jobError },
        { data: attendanceData, error: attendanceError },
        { data: attendanceBreakData, error: attendanceBreakError },
      ] = await Promise.all([
        supabase
          .from("leave_request")
          .select("id,profile_id,work_date,leave_type,approval_status,request_group_id,comment,created_at")
          .gte("created_at", fromCreatedAt)
          .lt("created_at", toCreatedAt)
          .order("created_at", { ascending: false })
          .order("work_date", { ascending: true }),
        supabase
          .from("leave_request")
          .select("id,profile_id,work_date,leave_type,approval_status,request_group_id,comment,created_at")
          .gte("work_date", fromDate)
          .lte("work_date", toDate)
          .order("work_date", { ascending: true }),
        supabase
          .from("attendance_correction_request")
          .select(
            "id,profile_id,work_date,before_start_time,before_end_time,before_away_minutes,before_status_label,requested_start_time,requested_end_time,requested_away_minutes,requested_status_label,comment,approval_status,requested_at"
          )
          .gte("requested_at", fromCreatedAt)
          .lt("requested_at", toCreatedAt)
          .order("requested_at", { ascending: false }),
        supabase
          .from("attendance_correction_request")
          .select(
            "id,profile_id,work_date,before_start_time,before_end_time,before_away_minutes,before_status_label,requested_start_time,requested_end_time,requested_away_minutes,requested_status_label,comment,approval_status,requested_at"
          )
          .gte("work_date", fromDate)
          .lte("work_date", toDate)
          .order("work_date", { ascending: true })
          .order("requested_at", { ascending: false }),
        supabase
          .from("profiles_2")
          .select("id,last_name,first_name,email")
          .order("created_at", { ascending: true }),
        supabase.from("profile_job").select("profile_id,job_id"),
        supabase.from("job").select("id,name").order("created_at", { ascending: true }),
        supabase
          .from("attendance")
          .select("id,profile_id,work_date,start_time,end_time")
          .gte("work_date", fromDate)
          .lte("work_date", toDate)
          .order("work_date", { ascending: true }),
        supabase
          .from("attendance_break")
          .select("id,profile_id,work_date,break_out_time,break_in_time")
          .gte("work_date", fromDate)
          .lte("work_date", toDate)
          .order("work_date", { ascending: true })
          .order("break_out_time", { ascending: true }),
      ]);

      if (leaveRequestListError) throw new Error(leaveRequestListError.message);
      if (leaveSummaryError) throw new Error(leaveSummaryError.message);
      if (correctionRequestListError) throw new Error(correctionRequestListError.message);
      if (correctionSummaryError) throw new Error(correctionSummaryError.message);
      if (profileError) throw new Error(profileError.message);
      if (profileJobError) throw new Error(profileJobError.message);
      if (jobError) throw new Error(jobError.message);
      if (attendanceError) throw new Error(attendanceError.message);
      if (attendanceBreakError) throw new Error(attendanceBreakError.message);

      setLeaveRequestListRows((leaveRequestListData ?? []) as LeaveRequestRow[]);
      setLeaveSummaryRows((leaveSummaryData ?? []) as LeaveRequestRow[]);
      setCorrectionRequestListRows((correctionRequestListData ?? []) as AttendanceCorrectionRequestRow[]);
      setCorrectionSummaryRows((correctionSummaryData ?? []) as AttendanceCorrectionRequestRow[]);
      setProfiles((profileData ?? []) as ProfileRow[]);
      setProfileJobs((profileJobData ?? []) as ProfileJobRow[]);
      setJobs((jobData ?? []) as JobRow[]);
      setAttendanceRows((attendanceData ?? []) as AttendanceRow[]);
      setAttendanceBreakRows((attendanceBreakData ?? []) as AttendanceBreakRow[]);
      setHolidaySet(await fetchJapaneseHolidaySet());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }, [displayMonth, supabase]);

  useEffect(() => {
    load();
  }, [load]);

  const updateLeaveApprovalStatus = async (requestGroupId: string, approvalStatus: 1 | 2 | 3) => {
    setSavingKey(`leave-${requestGroupId}`);
    setMessage("");

    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw new Error(authError.message);

      const userId = authData.user?.id;
      if (!userId) throw new Error("ログインユーザーを取得できません。");

      const { error } = await supabase
        .from("leave_request")
        .update({
          approval_status: approvalStatus,
          updated_by: userId,
        })
        .eq("request_group_id", requestGroupId);

      if (error) throw new Error(error.message);

      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setSavingKey("");
    }
  };

  const updateCorrectionApprovalStatus = async (
    request: AttendanceCorrectionRequestRow,
    approvalStatus: 1 | 2 | 3
  ) => {
    setSavingKey(`correction-${request.id}`);
    setMessage("");

    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw new Error(authError.message);

      const userId = authData.user?.id;
      if (!userId) throw new Error("ログインユーザーを取得できません。");

      if (approvalStatus === 1) {
        const { error: attendanceError } = await supabase.from("attendance").upsert(
          {
            profile_id: request.profile_id,
            work_date: request.work_date,
            start_time: request.requested_start_time,
            end_time: request.requested_end_time,
            updated_by: userId,
          },
          { onConflict: "profile_id,work_date" }
        );

        if (attendanceError) throw new Error(attendanceError.message);
      }

      const { error: requestError } = await supabase
        .from("attendance_correction_request")
        .update({
          approval_status: approvalStatus,
          reviewed_by: userId,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", request.id);

      if (requestError) throw new Error(requestError.message);

      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setSavingKey("");
    }
  };

  const groupedLeaveRequests = useMemo<GroupedLeaveRequest[]>(() => {
    const profileMap = new Map(profiles.map((profile) => [profile.id, profile]));
    const map = new Map<string, GroupedLeaveRequest>();

    for (const row of leaveRequestListRows) {
      const current = map.get(row.request_group_id);

      if (!current) {
        map.set(row.request_group_id, {
          requestGroupId: row.request_group_id,
          profileId: row.profile_id,
          applicantName: fullName(profileMap.get(row.profile_id)),
          createdAt: row.created_at,
          comment: row.comment ?? "",
          approvalStatus: row.approval_status,
          items: [
            {
              id: row.id,
              work_date: row.work_date,
              leave_type: row.leave_type,
            },
          ],
          totalDays: getLeaveDays(row.leave_type),
          dateRangeLabel: "",
        });
      } else {
        current.items.push({
          id: row.id,
          work_date: row.work_date,
          leave_type: row.leave_type,
        });
        current.totalDays += getLeaveDays(row.leave_type);
      }
    }

    const result = Array.from(map.values()).map((group) => {
      group.items.sort((a, b) => a.work_date.localeCompare(b.work_date, "ja"));
      const firstDate = group.items[0]?.work_date ?? "";
      const lastDate = group.items[group.items.length - 1]?.work_date ?? "";
      group.dateRangeLabel =
        firstDate && lastDate
          ? firstDate === lastDate
            ? formatDateJP(firstDate)
            : `${formatDateJP(firstDate)} 〜 ${formatDateJP(lastDate)}`
          : "-";
      return group;
    });

    result.sort((a, b) => b.createdAt.localeCompare(a.createdAt, "ja"));
    return result;
  }, [leaveRequestListRows, profiles]);

  const correctionRequestCards = useMemo<CorrectionRequestCard[]>(() => {
    const profileMap = new Map(profiles.map((profile) => [profile.id, profile]));

    return correctionRequestListRows
      .map((row) => ({
        id: row.id,
        profileId: row.profile_id,
        applicantName: fullName(profileMap.get(row.profile_id)),
        requestedAt: row.requested_at,
        workDate: row.work_date,
        beforeStartTime: row.before_start_time,
        beforeEndTime: row.before_end_time,
        beforeAwayMinutes: row.before_away_minutes,
        beforeStatusLabel: row.before_status_label,
        requestedStartTime: row.requested_start_time,
        requestedEndTime: row.requested_end_time,
        requestedAwayMinutes: row.requested_away_minutes,
        requestedStatusLabel: row.requested_status_label,
        comment: row.comment ?? "",
        approvalStatus: row.approval_status,
      }))
      .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt, "ja"));
  }, [correctionRequestListRows, profiles]);

  const employeeSummaries = useMemo<EmployeeSummaryRow[]>(() => {
    const monthStart = getMonthStart(displayMonth);
    const monthLastDate = getMonthLastDate(displayMonth);

    const attendanceMap = new Map<string, AttendanceRow>();
    for (const row of attendanceRows) {
      attendanceMap.set(`${row.profile_id}_${row.work_date}`, row);
    }

    const awayMinutesMap = getAwayMinutesByDate(attendanceBreakRows);
    const approvedCorrectionMap = getLatestApprovedCorrectionMap(correctionSummaryRows);

    const approvedLeaveMap = new Map<string, LeaveRequestRow>();
    for (const row of leaveSummaryRows) {
      if (row.approval_status === 1) {
        approvedLeaveMap.set(`${row.profile_id}_${row.work_date}`, row);
      }
    }

    const jobMap = new Map(jobs.map((job) => [job.id, job.name]));
    const profileJobMap = new Map<string, string>();
    for (const row of profileJobs) {
      if (!profileJobMap.has(row.profile_id)) {
        profileJobMap.set(row.profile_id, jobMap.get(row.job_id) ?? "-");
      }
    }

    const pendingLeaveGroupMap = new Map<string, Set<string>>();
    for (const row of leaveSummaryRows) {
      if (row.approval_status !== 0) continue;
      if (!pendingLeaveGroupMap.has(row.profile_id)) {
        pendingLeaveGroupMap.set(row.profile_id, new Set());
      }
      pendingLeaveGroupMap.get(row.profile_id)!.add(row.request_group_id);
    }

    const pendingCorrectionMap = new Map<string, number>();
    for (const row of correctionSummaryRows) {
      if (row.approval_status !== 0) continue;
      pendingCorrectionMap.set(row.profile_id, (pendingCorrectionMap.get(row.profile_id) ?? 0) + 1);
    }

    return profiles
      .map((profile) => {
        let workedMinutes = 0;
        let overtimeMinutes = 0;
        let paidLeaveDays = 0;
        let missingDays = 0;

        for (let day = 1; day <= monthLastDate.getDate(); day += 1) {
          const current = new Date(monthStart.getFullYear(), monthStart.getMonth(), day);
          const dateKey = getDateKey(current);
          const isWeekend = current.getDay() === 0 || current.getDay() === 6;
          const isHoliday = isWeekend || holidaySet.has(dateKey);

          const attendance = attendanceMap.get(`${profile.id}_${dateKey}`) ?? null;
          const approvedLeave = approvedLeaveMap.get(`${profile.id}_${dateKey}`) ?? null;
          const approvedCorrection = approvedCorrectionMap.get(`${profile.id}_${dateKey}`) ?? null;

          const startTime = approvedCorrection?.requested_start_time ?? attendance?.start_time ?? null;
          const endTime = approvedCorrection?.requested_end_time ?? attendance?.end_time ?? null;
          const awayMinutes =
            approvedCorrection?.requested_away_minutes ??
            awayMinutesMap.get(`${profile.id}_${dateKey}`) ??
            0;

          const workMinutes = getWorkedMinutes(startTime, endTime, awayMinutes);
          workedMinutes += workMinutes;
          overtimeMinutes += getOvertimeMinutes(workMinutes);

          if (approvedLeave) {
            if (approvedLeave.leave_type === 0 || approvedLeave.leave_type === 5) {
              paidLeaveDays += 1;
            } else if (approvedLeave.leave_type === 1 || approvedLeave.leave_type === 2) {
              paidLeaveDays += 0.5;
            }
          }

          if (!isHoliday && !approvedLeave && !startTime && !endTime) {
            missingDays += 1;
          }
        }

        const pendingLeaveCount = pendingLeaveGroupMap.get(profile.id)?.size ?? 0;
        const pendingCorrectionCount = pendingCorrectionMap.get(profile.id) ?? 0;

        return {
          profileId: profile.id,
          name: fullName(profile),
          teamName: profileJobMap.get(profile.id) ?? "-",
          workedMinutes,
          overtimeMinutes,
          paidLeaveDays,
          missingDays,
          pendingCount: pendingLeaveCount + pendingCorrectionCount,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, "ja"));
  }, [
    attendanceBreakRows,
    attendanceRows,
    correctionSummaryRows,
    displayMonth,
    holidaySet,
    jobs,
    leaveSummaryRows,
    profileJobs,
    profiles,
  ]);

  return (
    <main className={styles.page}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>勤怠管理</h1>
      </div>

      <div className={styles.monthRow}>
        <button
          type="button"
          className={styles.monthButton}
          onClick={() => setDisplayMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))}
        >
          ‹
        </button>
        <div className={styles.monthTitle}>{formatMonthTitle(displayMonth)}</div>
        <button
          type="button"
          className={styles.monthButton}
          onClick={() => setDisplayMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))}
        >
          ›
        </button>
      </div>

      <div className={styles.tabBar}>
        <button
          type="button"
          className={`${styles.tabButton} ${activeMainTab === "employee" ? styles.tabButtonActive : ""}`}
          onClick={() => setActiveMainTab("employee")}
        >
          社員一覧
        </button>
        <button
          type="button"
          className={`${styles.tabButton} ${activeMainTab === "request" ? styles.tabButtonActive : ""}`}
          onClick={() => setActiveMainTab("request")}
        >
          申請一覧
        </button>
      </div>

      {message && <p className={styles.message}>{message}</p>}

      {activeMainTab === "employee" ? (
        <section className={styles.employeeSection}>
          {loading ? (
            <div className={styles.emptyState}>読み込み中...</div>
          ) : employeeSummaries.length === 0 ? (
            <div className={styles.emptyState}>社員データがありません。</div>
          ) : (
            <div className={styles.employeeTableFrame}>
              <div className={styles.employeeTableScroll}>
                <table className={styles.employeeTable}>
                  <thead>
                    <tr>
                      <th>氏名</th>
                      <th>チーム</th>
                      <th>勤務時間</th>
                      <th>残業</th>
                      <th>有給</th>
                      <th>未入力</th>
                      <th>承認待ち</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {employeeSummaries.map((row) => (
                      <tr key={row.profileId}>
                        <td>{row.name || "-"}</td>
                        <td>{row.teamName}</td>
                        <td>{formatSummaryDuration(row.workedMinutes)}</td>
                        <td>{formatSummaryDuration(row.overtimeMinutes)}</td>
                        <td>{row.paidLeaveDays}日</td>
                        <td>{row.missingDays}日</td>
                        <td>{row.pendingCount}件</td>
                        <td>
                          <Link href={`/attendance/${row.profileId}`} className={styles.detailButtonLink}>
                            詳細
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      ) : (
        <section className={styles.listSection}>
          <div className={styles.subTabBar}>
            <button
              type="button"
              className={`${styles.subTabButton} ${
                activeRequestSubTab === "leave" ? styles.subTabButtonActive : ""
              }`}
              onClick={() => setActiveRequestSubTab("leave")}
            >
              休暇申請
            </button>
            <button
              type="button"
              className={`${styles.subTabButton} ${
                activeRequestSubTab === "attendanceCorrection" ? styles.subTabButtonActive : ""
              }`}
              onClick={() => setActiveRequestSubTab("attendanceCorrection")}
            >
              打刻修正申請
            </button>
          </div>

          {loading ? (
            <div className={styles.emptyState}>読み込み中...</div>
          ) : activeRequestSubTab === "leave" ? (
            groupedLeaveRequests.length === 0 ? (
              <div className={styles.emptyState}>休暇申請データがありません。</div>
            ) : (
              <div className={styles.requestList}>
                {groupedLeaveRequests.map((group) => (
                  <div key={group.requestGroupId} className={styles.requestCard}>
                    <div className={styles.requestHeader}>
                      <div>
                        <div className={styles.requestRange}>
                          {group.dateRangeLabel}（{formatDays(group.totalDays)}）
                        </div>
                        <div className={styles.requestMeta}>申請者：{group.applicantName || "-"}</div>
                        <div className={styles.requestMeta}>申請日：{formatDateJP(group.createdAt.slice(0, 10))}</div>
                      </div>

                      <div className={`${styles.statusBadge} ${getStatusClass(group.approvalStatus)}`}>
                        {APPROVAL_STATUS_LABELS[group.approvalStatus] ?? String(group.approvalStatus)}
                      </div>
                    </div>

                    <div className={styles.requestItems}>
                      {group.items.map((item) => (
                        <div key={item.id} className={styles.requestItemRow}>
                          <span>{formatDateJP(item.work_date)}</span>
                          <span>{getLeaveTypeLabel(item.leave_type)}</span>
                        </div>
                      ))}
                    </div>

                    <div className={styles.commentBlock}>コメント：{group.comment || "-"}</div>

                    <div className={styles.actionRow}>
                      <button
                        type="button"
                        className={styles.actionButton}
                        disabled={savingKey === `leave-${group.requestGroupId}`}
                        onClick={() => updateLeaveApprovalStatus(group.requestGroupId, 1)}
                      >
                        承認
                      </button>
                      <button
                        type="button"
                        className={styles.actionButton}
                        disabled={savingKey === `leave-${group.requestGroupId}`}
                        onClick={() => updateLeaveApprovalStatus(group.requestGroupId, 2)}
                      >
                        却下
                      </button>
                      <button
                        type="button"
                        className={styles.actionButton}
                        disabled={savingKey === `leave-${group.requestGroupId}`}
                        onClick={() => updateLeaveApprovalStatus(group.requestGroupId, 3)}
                      >
                        取消
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : correctionRequestCards.length === 0 ? (
            <div className={styles.emptyState}>打刻修正申請データがありません。</div>
          ) : (
            <div className={styles.requestList}>
              {correctionRequestCards.map((request) => (
                <div key={request.id} className={styles.requestCard}>
                  <div className={styles.requestHeader}>
                    <div>
                      <div className={styles.requestRange}>{formatDateJP(request.workDate)}</div>
                      <div className={styles.requestMeta}>申請者：{request.applicantName || "-"}</div>
                      <div className={styles.requestMeta}>申請日：{formatDateJP(request.requestedAt.slice(0, 10))}</div>
                    </div>

                    <div className={`${styles.statusBadge} ${getStatusClass(request.approvalStatus)}`}>
                      {APPROVAL_STATUS_LABELS[request.approvalStatus] ?? String(request.approvalStatus)}
                    </div>
                  </div>

                  <div className={styles.correctionRows}>
                    <div className={styles.correctionRow}>
                      <div className={styles.correctionRowLabel}>変更前</div>
                      <div className={styles.correctionRowValue}>出勤：{formatTime(request.beforeStartTime)}</div>
                      <div className={styles.correctionRowValue}>退勤：{formatTime(request.beforeEndTime)}</div>
                      <div className={styles.correctionRowValue}>
                        離席時間：{formatDuration(request.beforeAwayMinutes)}
                      </div>
                      <div className={styles.correctionRowValue}>
                        ステータス：{request.beforeStatusLabel || "-"}
                      </div>
                    </div>

                    <div className={styles.correctionRow}>
                      <div className={styles.correctionRowLabel}>変更後</div>
                      <div className={styles.correctionRowValue}>出勤：{formatTime(request.requestedStartTime)}</div>
                      <div className={styles.correctionRowValue}>退勤：{formatTime(request.requestedEndTime)}</div>
                      <div className={styles.correctionRowValue}>
                        離席時間：{formatDuration(request.requestedAwayMinutes)}
                      </div>
                      <div className={styles.correctionRowValue}>
                        ステータス：{request.requestedStatusLabel || "-"}
                      </div>
                    </div>
                  </div>

                  <div className={styles.commentBlock}>コメント：{request.comment || "-"}</div>

                  <div className={styles.actionRow}>
                    <button
                      type="button"
                      className={styles.actionButton}
                      disabled={savingKey === `correction-${request.id}`}
                      onClick={() =>
                        updateCorrectionApprovalStatus(
                          correctionRequestListRows.find((row) => row.id === request.id)!,
                          1
                        )
                      }
                    >
                      承認
                    </button>
                    <button
                      type="button"
                      className={styles.actionButton}
                      disabled={savingKey === `correction-${request.id}`}
                      onClick={() =>
                        updateCorrectionApprovalStatus(
                          correctionRequestListRows.find((row) => row.id === request.id)!,
                          2
                        )
                      }
                    >
                      却下
                    </button>
                    <button
                      type="button"
                      className={styles.actionButton}
                      disabled={savingKey === `correction-${request.id}`}
                      onClick={() =>
                        updateCorrectionApprovalStatus(
                          correctionRequestListRows.find((row) => row.id === request.id)!,
                          3
                        )
                      }
                    >
                      取消
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </main>
  );
}