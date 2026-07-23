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

type ApprovalRequestRow = {
  id: string;
  request_type: string;
  target_id: string;
  applicant_profile_id: string;
  status: number;
  current_step_no: number;
  created_at: string;
  completed_at: string | null;
};

type ApprovalRequestStepRow = {
  id: string;
  approval_request_id: string;
  step_no: number;
  step_name: string;
  approver_type: string;
  approver_profile_id: string | null;
  approval_status: number;
  reviewed_by: string | null;
  reviewed_at: string | null;
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

type TeamLeaderRow = {
  team_id: string;
  profile_id: string;
};

type ProfileTeamRow = {
  profile_id: string;
  team_id: string;
};

type TeamRow = {
  id: string;
  parent_id: string | null;
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
  approvalFlow: ApprovalRequestRow | null;
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
  approvalFlow: ApprovalRequestRow | null;
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

const APPROVAL_FLOW_STATUS_LABELS: Record<number, string> = {
  1: "上長承認待ち",
  2: "総務承認待ち",
  3: "承認済み",
  4: "却下",
  5: "取消",
};

const APPROVAL_STEP_STATUS_LABELS: Record<number, string> = {
  1: "未承認",
  2: "承認済み",
  3: "却下",
  4: "取消",
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

function getApprovalFlowStatusClass(status: number) {
  switch (status) {
    case 3:
      return styles.statusApproved;
    case 4:
    case 5:
      return styles.statusRejected;
    default:
      return styles.statusPending;
  }
}

function getDisplayApprovalLabel(legacyStatus: number, approvalFlow: ApprovalRequestRow | null) {
  if (approvalFlow) {
    return APPROVAL_FLOW_STATUS_LABELS[approvalFlow.status] ?? String(approvalFlow.status);
  }
  return APPROVAL_STATUS_LABELS[legacyStatus] ?? String(legacyStatus);
}

function getDisplayStatusClass(legacyStatus: number, approvalFlow: ApprovalRequestRow | null) {
  if (approvalFlow) return getApprovalFlowStatusClass(approvalFlow.status);
  return getStatusClass(legacyStatus);
}

function getApprovalTargetKey(requestType: string, targetId: string) {
  return `${requestType}:${targetId}`;
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
  const [currentProfileId, setCurrentProfileId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isTeamLeader, setIsTeamLeader] = useState(false);
  const [isGeneralAffairsApprover, setIsGeneralAffairsApprover] = useState(false);
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
  const [profileTeams, setProfileTeams] = useState<ProfileTeamRow[]>([]);
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [leaderTeamIds, setLeaderTeamIds] = useState<Set<string>>(new Set());
  const [attendanceRows, setAttendanceRows] = useState<AttendanceRow[]>([]);
  const [attendanceBreakRows, setAttendanceBreakRows] = useState<AttendanceBreakRow[]>([]);
  const [approvalRequestRows, setApprovalRequestRows] = useState<ApprovalRequestRow[]>([]);
  const [approvalRequestStepRows, setApprovalRequestStepRows] = useState<ApprovalRequestStepRow[]>([]);
  const [holidaySet, setHolidaySet] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setMessage("");

    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw new Error(authError.message);

      const authUserId = authData.user?.id;
      if (!authUserId) throw new Error("ログインユーザーを取得できません。");

      const { data: resolvedProfileId, error: currentProfileIdError } = await supabase.rpc("current_profile_id");
      if (currentProfileIdError) throw new Error(currentProfileIdError.message);

      const nextCurrentProfileId = (resolvedProfileId as string | null) ?? authUserId;
      setCurrentProfileId(nextCurrentProfileId);

      const [
        { data: currentProfileData, error: currentProfileError },
        { data: teamLeaderData, error: teamLeaderError },
      ] = await Promise.all([
        supabase
          .from("profiles_2")
          .select("id,is_admin,is_general_affairs_approver")
          .eq("id", nextCurrentProfileId)
          .maybeSingle(),
        supabase.from("team_leader").select("team_id,profile_id").eq("profile_id", nextCurrentProfileId),
      ]);

      if (currentProfileError) throw new Error(currentProfileError.message);
      if (teamLeaderError) throw new Error(teamLeaderError.message);

      const nextIsAdmin = currentProfileData?.is_admin === 1;
      const nextIsGeneralAffairsApprover = currentProfileData?.is_general_affairs_approver === 1;
      const nextLeaderTeamIds = new Set(((teamLeaderData ?? []) as TeamLeaderRow[]).map((leader) => leader.team_id));
      const nextIsTeamLeader = nextLeaderTeamIds.size > 0;

      setIsAdmin(nextIsAdmin);
      setIsGeneralAffairsApprover(nextIsGeneralAffairsApprover);
      setIsTeamLeader(nextIsTeamLeader);
      setLeaderTeamIds(nextLeaderTeamIds);

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
        { data: profileTeamData, error: profileTeamError },
        { data: teamData, error: teamError },
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
        supabase.from("profile_team").select("profile_id,team_id"),
        supabase.from("team").select("id,parent_id"),
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
      if (profileTeamError) throw new Error(profileTeamError.message);
      if (teamError) throw new Error(teamError.message);
      if (attendanceError) throw new Error(attendanceError.message);
      if (attendanceBreakError) throw new Error(attendanceBreakError.message);

      const leaveRequestRows = (leaveRequestListData ?? []) as LeaveRequestRow[];
      const leaveSummaryRequestRows = (leaveSummaryData ?? []) as LeaveRequestRow[];
      const correctionRequestRows = (correctionRequestListData ?? []) as AttendanceCorrectionRequestRow[];
      const correctionSummaryRequestRows = (correctionSummaryData ?? []) as AttendanceCorrectionRequestRow[];

      const leaveTargetIds = Array.from(
        new Set(
          [...leaveRequestRows, ...leaveSummaryRequestRows]
            .map((row) => row.request_group_id)
            .filter((value): value is string => Boolean(value))
        )
      );
      const correctionTargetIds = Array.from(
        new Set(
          [...correctionRequestRows, ...correctionSummaryRequestRows]
            .map((row) => row.id)
            .filter((value): value is string => Boolean(value))
        )
      );

      const [leaveApprovalResult, correctionApprovalResult] = await Promise.all([
        leaveTargetIds.length > 0
          ? supabase
              .from("approval_request")
              .select("id,request_type,target_id,applicant_profile_id,status,current_step_no,created_at,completed_at")
              .eq("request_type", "leave_request")
              .in("target_id", leaveTargetIds)
          : Promise.resolve({ data: [], error: null }),
        correctionTargetIds.length > 0
          ? supabase
              .from("approval_request")
              .select("id,request_type,target_id,applicant_profile_id,status,current_step_no,created_at,completed_at")
              .eq("request_type", "attendance_correction")
              .in("target_id", correctionTargetIds)
          : Promise.resolve({ data: [], error: null }),
      ]);

      if (leaveApprovalResult.error) throw new Error(leaveApprovalResult.error.message);
      if (correctionApprovalResult.error) throw new Error(correctionApprovalResult.error.message);

      const nextApprovalRows = [
        ...((leaveApprovalResult.data ?? []) as ApprovalRequestRow[]),
        ...((correctionApprovalResult.data ?? []) as ApprovalRequestRow[]),
      ];
      const approvalRequestIds = nextApprovalRows.map((row) => row.id);

      const { data: approvalStepData, error: approvalStepError } =
        approvalRequestIds.length > 0
          ? await supabase
              .from("approval_request_step")
              .select("id,approval_request_id,step_no,step_name,approver_type,approver_profile_id,approval_status,reviewed_by,reviewed_at")
              .in("approval_request_id", approvalRequestIds)
              .order("step_no", { ascending: true })
              .order("created_at", { ascending: true })
          : { data: [], error: null };

      if (approvalStepError) throw new Error(approvalStepError.message);

      setLeaveRequestListRows(leaveRequestRows);
      setLeaveSummaryRows(leaveSummaryRequestRows);
      setCorrectionRequestListRows(correctionRequestRows);
      setCorrectionSummaryRows(correctionSummaryRequestRows);
      setProfiles((profileData ?? []) as ProfileRow[]);
      setProfileJobs((profileJobData ?? []) as ProfileJobRow[]);
      setJobs((jobData ?? []) as JobRow[]);
      setProfileTeams((profileTeamData ?? []) as ProfileTeamRow[]);
      setTeams((teamData ?? []) as TeamRow[]);
      setAttendanceRows((attendanceData ?? []) as AttendanceRow[]);
      setAttendanceBreakRows((attendanceBreakData ?? []) as AttendanceBreakRow[]);
      setApprovalRequestRows(nextApprovalRows);
      setApprovalRequestStepRows((approvalStepData ?? []) as ApprovalRequestStepRow[]);
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

  useEffect(() => {
    if (!loading && activeMainTab === "employee" && !isAdmin && !isTeamLeader) {
      setActiveMainTab("request");
    }
  }, [activeMainTab, isAdmin, isTeamLeader, loading]);

  const updateLeaveApprovalStatus = async (requestGroupId: string, approvalStatus: 1 | 2 | 3) => {
    setSavingKey(`leave-${requestGroupId}`);
    setMessage("");

    try {
      const { error } = await supabase.rpc("review_leave_request_group", {
        target_request_group_id: requestGroupId,
        target_approval_status: approvalStatus,
      });

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
      const { error } = await supabase.rpc("review_attendance_correction_request", {
        target_request_id: request.id,
        target_approval_status: approvalStatus,
      });

      if (error) throw new Error(error.message);

      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setSavingKey("");
    }
  };

  const leaderEffectiveTeamIds = useMemo(() => {
    const result = new Set(leaderTeamIds);
    const walk = (parentId: string) => {
      for (const team of teams) {
        if (team.parent_id !== parentId || result.has(team.id)) continue;
        result.add(team.id);
        walk(team.id);
      }
    };

    for (const teamId of leaderTeamIds) {
      walk(teamId);
    }

    return result;
  }, [leaderTeamIds, teams]);

  const leaderManagedProfileIds = useMemo(() => {
    const result = new Set<string>();
    if (leaderEffectiveTeamIds.size === 0) return result;

    for (const relation of profileTeams) {
      if (leaderEffectiveTeamIds.has(relation.team_id)) {
        result.add(relation.profile_id);
      }
    }

    return result;
  }, [leaderEffectiveTeamIds, profileTeams]);

  const visibleProfiles = useMemo(() => {
    if (isAdmin) return profiles;
    return profiles.filter((profile) => leaderManagedProfileIds.has(profile.id));
  }, [isAdmin, leaderManagedProfileIds, profiles]);

  const profileNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const profile of profiles) {
      map.set(profile.id, fullName(profile));
    }
    return map;
  }, [profiles]);

  const approvalRequestByTargetKey = useMemo(() => {
    const map = new Map<string, ApprovalRequestRow>();
    for (const row of approvalRequestRows) {
      map.set(getApprovalTargetKey(row.request_type, row.target_id), row);
    }
    return map;
  }, [approvalRequestRows]);

  const approvalStepsByRequestId = useMemo(() => {
    const map = new Map<string, ApprovalRequestStepRow[]>();
    for (const row of approvalRequestStepRows) {
      if (!map.has(row.approval_request_id)) {
        map.set(row.approval_request_id, []);
      }
      map.get(row.approval_request_id)!.push(row);
    }
    return map;
  }, [approvalRequestStepRows]);

  const isApprovalFlowRelatedToCurrentUser = useCallback(
    (approvalFlow: ApprovalRequestRow | null) => {
      if (!approvalFlow || !currentProfileId) return false;
      if (approvalFlow.applicant_profile_id === currentProfileId) return true;
      if ([2, 3, 4, 5].includes(approvalFlow.status) && isGeneralAffairsApprover) return true;

      const steps = approvalStepsByRequestId.get(approvalFlow.id) ?? [];
      return steps.some((step) => step.approver_profile_id === currentProfileId);
    },
    [approvalStepsByRequestId, currentProfileId, isGeneralAffairsApprover]
  );

  const canSeeRequest = useCallback(
    (profileId: string, approvalFlow: ApprovalRequestRow | null) => {
      if (isAdmin || leaderManagedProfileIds.has(profileId)) return true;
      return isApprovalFlowRelatedToCurrentUser(approvalFlow);
    },
    [isAdmin, isApprovalFlowRelatedToCurrentUser, leaderManagedProfileIds]
  );

  const canReviewRequest = useCallback(
    (profileId: string, legacyStatus: number, approvalFlow: ApprovalRequestRow | null) => {
      if (!currentProfileId) return false;

      if (!approvalFlow) {
        return legacyStatus === 0 && (isAdmin || leaderManagedProfileIds.has(profileId));
      }

      if (![1, 2].includes(approvalFlow.status)) return false;

      if (approvalFlow.current_step_no === 1) {
        const step1Rows = (approvalStepsByRequestId.get(approvalFlow.id) ?? []).filter((step) => step.step_no === 1);
        const hasSpecificStep1Approver = step1Rows.some((step) => step.approver_profile_id);

        if (hasSpecificStep1Approver) {
          return (
            isAdmin ||
            step1Rows.some(
              (step) => step.approver_profile_id === currentProfileId && step.approval_status === 1
            )
          );
        }

        return isAdmin || leaderManagedProfileIds.has(profileId);
      }

      if (approvalFlow.current_step_no === 2) {
        return isAdmin || isGeneralAffairsApprover;
      }

      return false;
    },
    [approvalStepsByRequestId, currentProfileId, isAdmin, isGeneralAffairsApprover, leaderManagedProfileIds]
  );

  const getActionNotice = useCallback(
    (legacyStatus: number, approvalFlow: ApprovalRequestRow | null) => {
      if (!approvalFlow) {
        return legacyStatus === 0 ? "現在の承認者ではありません。" : "この申請は完了しています。";
      }

      if ([3, 4, 5].includes(approvalFlow.status)) {
        return "この申請は完了しています。";
      }

      if (approvalFlow.current_step_no === 1) {
        return "STEP 1 の承認者の対応待ちです。";
      }

      if (approvalFlow.current_step_no === 2) {
        return "STEP 2 の総務承認者の対応待ちです。";
      }

      return "現在の承認者ではありません。";
    },
    []
  );

  const renderApprovalFlowSummary = useCallback(
    (approvalFlow: ApprovalRequestRow | null) => {
      if (!approvalFlow) return null;

      const steps = approvalStepsByRequestId.get(approvalFlow.id) ?? [];
      const step1Rows = steps.filter((step) => step.step_no === 1);
      const step2Rows = steps.filter((step) => step.step_no === 2);

      const renderStepMember = (step: ApprovalRequestStepRow) => {
        const profileId = step.approver_profile_id ?? step.reviewed_by;
        const name = profileId ? profileNameById.get(profileId) ?? "-" : "総務部";
        return `${name}（${APPROVAL_STEP_STATUS_LABELS[step.approval_status] ?? step.approval_status}）`;
      };

      return (
        <div className={styles.approvalFlowBlock}>
          <div className={styles.approvalFlowTitle}>承認フロー</div>
          <div className={styles.approvalFlowRow}>
            <span className={styles.approvalFlowStepLabel}>STEP 1</span>
            <span>{step1Rows.length > 0 ? step1Rows.map(renderStepMember).join("、") : "-"}</span>
          </div>
          <div className={styles.approvalFlowRow}>
            <span className={styles.approvalFlowStepLabel}>STEP 2</span>
            <span>{step2Rows.length > 0 ? step2Rows.map(renderStepMember).join("、") : "総務部"}</span>
          </div>
        </div>
      );
    },
    [approvalStepsByRequestId, profileNameById]
  );

  const groupedLeaveRequests = useMemo<GroupedLeaveRequest[]>(() => {
    const profileMap = new Map(profiles.map((profile) => [profile.id, profile]));
    const map = new Map<string, GroupedLeaveRequest>();

    for (const row of leaveRequestListRows) {
      const approvalFlow = approvalRequestByTargetKey.get(getApprovalTargetKey("leave_request", row.request_group_id)) ?? null;
      if (!canSeeRequest(row.profile_id, approvalFlow)) continue;
      const current = map.get(row.request_group_id);

      if (!current) {
        map.set(row.request_group_id, {
          requestGroupId: row.request_group_id,
          profileId: row.profile_id,
          approvalFlow,
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
  }, [approvalRequestByTargetKey, canSeeRequest, leaveRequestListRows, profiles]);

  const correctionRequestCards = useMemo<CorrectionRequestCard[]>(() => {
    const profileMap = new Map(profiles.map((profile) => [profile.id, profile]));

    return correctionRequestListRows
      .map((row) => ({
        row,
        approvalFlow:
          approvalRequestByTargetKey.get(getApprovalTargetKey("attendance_correction", row.id)) ?? null,
      }))
      .filter(({ row, approvalFlow }) => canSeeRequest(row.profile_id, approvalFlow))
      .map(({ row, approvalFlow }) => ({
        id: row.id,
        profileId: row.profile_id,
        approvalFlow,
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
  }, [approvalRequestByTargetKey, canSeeRequest, correctionRequestListRows, profiles]);

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

    return visibleProfiles
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
    visibleProfiles,
  ]);

  const canUseEmployeeSection = isAdmin || isTeamLeader;
  const hasRequestAccess =
    canUseEmployeeSection || isGeneralAffairsApprover || groupedLeaveRequests.length > 0 || correctionRequestCards.length > 0;

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
        {canUseEmployeeSection && (
          <button
            type="button"
            className={`${styles.tabButton} ${activeMainTab === "employee" ? styles.tabButtonActive : ""}`}
            onClick={() => setActiveMainTab("employee")}
          >
            社員一覧
          </button>
        )}
        <button
          type="button"
          className={`${styles.tabButton} ${activeMainTab === "request" || !canUseEmployeeSection ? styles.tabButtonActive : ""}`}
          onClick={() => setActiveMainTab("request")}
        >
          申請一覧
        </button>
      </div>

      {message && <p className={styles.message}>{message}</p>}

      {!loading && !hasRequestAccess ? (
        <section className={styles.employeeSection}>
          <div className={styles.emptyState}>承認対象の申請がありません。</div>
        </section>
      ) : activeMainTab === "employee" && canUseEmployeeSection ? (
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

                      <div className={`${styles.statusBadge} ${getDisplayStatusClass(group.approvalStatus, group.approvalFlow)}`}>
                        {getDisplayApprovalLabel(group.approvalStatus, group.approvalFlow)}
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

                    {renderApprovalFlowSummary(group.approvalFlow)}

                    {canReviewRequest(group.profileId, group.approvalStatus, group.approvalFlow) ? (
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
                    ) : (
                      <div className={styles.actionNotice}>
                        {getActionNotice(group.approvalStatus, group.approvalFlow)}
                      </div>
                    )}
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

                    <div className={`${styles.statusBadge} ${getDisplayStatusClass(request.approvalStatus, request.approvalFlow)}`}>
                      {getDisplayApprovalLabel(request.approvalStatus, request.approvalFlow)}
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

                  {renderApprovalFlowSummary(request.approvalFlow)}

                  {canReviewRequest(request.profileId, request.approvalStatus, request.approvalFlow) ? (
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
                  ) : (
                    <div className={styles.actionNotice}>
                      {getActionNotice(request.approvalStatus, request.approvalFlow)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </main>
  );
}