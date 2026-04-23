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
  break_out_time: string | null;
  break_in_time: string | null;
};

type GroupedRequest = {
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

const LEAVE_TYPE_LABELS: Record<number, string> = {
  0: "有給",
  1: "午前半休",
  2: "午後半休",
  3: "特別休暇",
  4: "無給",
  5: "夏休",
};

const APPROVAL_STATUS_LABELS: Record<number, string> = {
  0: "申請中",
  1: "承認",
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

function getWorkedMinutes(startTime: string | null, endTime: string | null) {
  const start = parseTimeToMinutes(startTime);
  const end = parseTimeToMinutes(endTime);
  if (start == null || end == null || end < start) return 0;
  return Math.max(0, end - start - 60);
}

function getOvertimeMinutes(startTime: string | null, endTime: string | null) {
  const start = parseTimeToMinutes(startTime);
  const end = parseTimeToMinutes(endTime);
  if (start == null || end == null || end < start) return 0;
  const span = end - start;
  return Math.max(0, span - 9 * 60);
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

export default function AttendanceManagementClient() {
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [savingGroupId, setSavingGroupId] = useState("");
  const [message, setMessage] = useState("");
  const [displayMonth, setDisplayMonth] = useState(() => getMonthStart(new Date()));
  const [activeMainTab, setActiveMainTab] = useState<MainTab>("employee");

  const [requests, setRequests] = useState<LeaveRequestRow[]>([]);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [profileJobs, setProfileJobs] = useState<ProfileJobRow[]>([]);
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [attendanceRows, setAttendanceRows] = useState<AttendanceRow[]>([]);
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
        { data: requestData, error: requestError },
        { data: profileData, error: profileError },
        { data: profileJobData, error: profileJobError },
        { data: jobData, error: jobError },
        { data: attendanceData, error: attendanceError },
      ] = await Promise.all([
        supabase
          .from("leave_request")
          .select("id,profile_id,work_date,leave_type,approval_status,request_group_id,comment,created_at")
          .gte("created_at", fromCreatedAt)
          .lt("created_at", toCreatedAt)
          .order("created_at", { ascending: false })
          .order("work_date", { ascending: true }),
        supabase
          .from("profiles_2")
          .select("id,last_name,first_name,email")
          .order("created_at", { ascending: true }),
        supabase.from("profile_job").select("profile_id,job_id"),
        supabase.from("job").select("id,name").order("created_at", { ascending: true }),
        supabase
          .from("attendance")
          .select("id,profile_id,work_date,start_time,end_time,break_out_time,break_in_time")
          .gte("work_date", fromDate)
          .lte("work_date", toDate)
          .order("work_date", { ascending: true }),
      ]);

      if (requestError) throw new Error(requestError.message);
      if (profileError) throw new Error(profileError.message);
      if (profileJobError) throw new Error(profileJobError.message);
      if (jobError) throw new Error(jobError.message);
      if (attendanceError) throw new Error(attendanceError.message);

      setRequests((requestData ?? []) as LeaveRequestRow[]);
      setProfiles((profileData ?? []) as ProfileRow[]);
      setProfileJobs((profileJobData ?? []) as ProfileJobRow[]);
      setJobs((jobData ?? []) as JobRow[]);
      setAttendanceRows((attendanceData ?? []) as AttendanceRow[]);
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

  const updateApprovalStatus = async (requestGroupId: string, approvalStatus: 1 | 2 | 3) => {
    setSavingGroupId(requestGroupId);
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
      setSavingGroupId("");
    }
  };

  const groupedRequests = useMemo<GroupedRequest[]>(() => {
    const profileMap = new Map(profiles.map((profile) => [profile.id, profile]));
    const map = new Map<string, GroupedRequest>();

    for (const row of requests) {
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
  }, [profiles, requests]);

  const employeeSummaries = useMemo<EmployeeSummaryRow[]>(() => {
    const monthStart = getMonthStart(displayMonth);
    const monthLastDate = getMonthLastDate(displayMonth);

    const attendanceMap = new Map<string, AttendanceRow>();
    for (const row of attendanceRows) {
      attendanceMap.set(`${row.profile_id}_${row.work_date}`, row);
    }

    const approvedLeaveMap = new Map<string, LeaveRequestRow>();
    for (const row of requests) {
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

    const pendingGroupMap = new Map<string, Set<string>>();
    for (const row of requests) {
      if (row.approval_status !== 0) continue;
      if (!pendingGroupMap.has(row.profile_id)) {
        pendingGroupMap.set(row.profile_id, new Set());
      }
      pendingGroupMap.get(row.profile_id)!.add(row.request_group_id);
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

          workedMinutes += getWorkedMinutes(attendance?.start_time ?? null, attendance?.end_time ?? null);
          overtimeMinutes += getOvertimeMinutes(attendance?.start_time ?? null, attendance?.end_time ?? null);

          if (approvedLeave) {
            if (approvedLeave.leave_type === 0 || approvedLeave.leave_type === 5) {
              paidLeaveDays += 1;
            } else if (approvedLeave.leave_type === 1 || approvedLeave.leave_type === 2) {
              paidLeaveDays += 0.5;
            }
          }

          if (!isHoliday && !approvedLeave && !attendance?.start_time && !attendance?.end_time) {
            missingDays += 1;
          }
        }

        return {
          profileId: profile.id,
          name: fullName(profile),
          teamName: profileJobMap.get(profile.id) ?? "-",
          workedMinutes,
          overtimeMinutes,
          paidLeaveDays,
          missingDays,
          pendingCount: pendingGroupMap.get(profile.id)?.size ?? 0,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, "ja"));
  }, [attendanceRows, displayMonth, holidaySet, jobs, profileJobs, profiles, requests]);

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
          {loading ? (
            <div className={styles.emptyState}>読み込み中...</div>
          ) : groupedRequests.length === 0 ? (
            <div className={styles.emptyState}>申請データがありません。</div>
          ) : (
            <div className={styles.requestList}>
              {groupedRequests.map((group) => (
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

                  <div className={styles.commentBlock}>
                    コメント：{group.comment || "-"}
                  </div>

                  <div className={styles.actionRow}>
                    <button
                      type="button"
                      className={styles.actionButton}
                      disabled={savingGroupId === group.requestGroupId}
                      onClick={() => updateApprovalStatus(group.requestGroupId, 1)}
                    >
                      承認
                    </button>
                    <button
                      type="button"
                      className={styles.actionButton}
                      disabled={savingGroupId === group.requestGroupId}
                      onClick={() => updateApprovalStatus(group.requestGroupId, 2)}
                    >
                      却下
                    </button>
                    <button
                      type="button"
                      className={styles.actionButton}
                      disabled={savingGroupId === group.requestGroupId}
                      onClick={() => updateApprovalStatus(group.requestGroupId, 3)}
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