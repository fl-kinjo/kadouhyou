"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/app/utils/supabase/client";
import styles from "./employee-client.module.css";

type Team = {
  id: string;
  parent_id: string | null;
  name: string;
};

type Job = {
  id: string;
  name: string;
};

type Profile = {
  id: string;
  email: string | null;
  last_name: string | null;
  first_name: string | null;
  is_admin: number | null;
  is_general_affairs: number | null;
  is_general_affairs_approver: number | null;
  status: number | null;
  hire_date: string | null;
  paid_leave_grant_date: string | null;
  paid_leave_days: number | string | null;
  scheduled_work_minutes: number | null;
  has_break: boolean | null;
  created_at: string;
};

type ProfileTeam = {
  profile_id: string;
  team_id: string;
};

type TeamLeader = {
  team_id: string;
  profile_id: string;
};

type ProfileJob = {
  profile_id: string;
  job_id: string;
};

type ManMonth = {
  profile_id: string;
  target_year_month: string;
  operating_person_months: number | string;
};

type EmployeeRow = {
  profile_id: string;
  email: string;
  last_name: string;
  first_name: string;
  team_paths: string;
  jobs: string;
  status: number;
  created_at: string;
};


type ProfileMenuPermission = {
  menu_group_key: string;
  menu_item_href: string | null;
  can_view: boolean | null;
};

const MENU_GROUPS = [
  {
    key: "attendance",
    title: "勤怠",
    items: [
      { href: "/attendance", label: "勤怠入力" },
      { href: "/report", label: "業務報告" },
      { href: "/leave-request", label: "休暇申請" },
      { href: "/attendance-management", label: "勤怠管理", adminOnly: true },
    ],
  },
  {
    key: "request",
    title: "経費",
    items: [
      { href: "/expenses", label: "経費申請" },
      { href: "/expenses-management", label: "経費管理", adminOnly: true },
    ],
  },
  {
    key: "project",
    title: "案件",
    items: [
      { href: "/project", label: "案件管理" },
      { href: "/summary", label: "案件サマリー" },
      { href: "/summary/sales2", label: "営業サマリー" },
      { href: "/summary/client", label: "クライアント別年間実績" },
      { href: "/client", label: "クライアント管理", adminOnly: true },
      { href: "/partner", label: "パートナー管理", adminOnly: true },
      { href: "/project-request", label: "予定工数申請管理", adminOnly: true },
    ],
  },
  {
    key: "general",
    title: "総務管理",
    items: [
      { href: "/employee", label: "社員管理", adminOnly: true },
      { href: "/team", label: "組織管理", adminOnly: true },
      { href: "/job", label: "職種管理", adminOnly: true },
    ],
  },
] as const;

function menuPermissionKey(groupKey: string, itemHref = "") {
  return `${groupKey}::${itemHref}`;
}

function getDefaultMenuPermissionMap() {
  const map: Record<string, boolean> = {};

  for (const group of MENU_GROUPS) {
    map[menuPermissionKey(group.key)] = true;
    for (const item of group.items) {
      map[menuPermissionKey(group.key, item.href)] = true;
    }
  }

  return map;
}

function fullName(lastName?: string | null, firstName?: string | null) {
  return `${lastName ?? ""}${firstName ?? ""}`.trim();
}

function uniq<T>(items: T[]) {
  return Array.from(new Set(items));
}

function isBlank(value: string | null | undefined) {
  return !value || !value.trim();
}

function statusLabelToValue(label: string) {
  switch (label) {
    case "1":
      return 1;
    case "2":
      return 2;
    default:
      return 0;
  }
}

function normalizeStatusValue(status: number | null | undefined) {
  return status === 1 || status === 2 ? status : 0;
}

function statusValueToLabel(status: number | null | undefined) {
  switch (normalizeStatusValue(status)) {
    case 1:
      return "休職中";
    case 2:
      return "離職済み";
    default:
      return "在籍中";
  }
}

function getCurrentTargetYearMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

function normalizeOperatingPersonMonths(value: string) {
  return value.trim();
}

function scheduledWorkMinutesToParts(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) {
    return { hours: "", minutes: "" };
  }

  const safeValue = Math.max(0, Math.min(24 * 60, Math.trunc(value)));
  return {
    hours: String(Math.floor(safeValue / 60)),
    minutes: String(safeValue % 60),
  };
}

function nullableDate(value: string) {
  const normalized = value.trim();
  return normalized || null;
}

const TEMP_EMAIL_PATTERN = /^spreadsheet-[^@\s]+@example\.invalid$/i;
const PAGE_SIZE = 20;

type EmployeeSortKey =
  | "created_desc"
  | "created_asc"
  | "name_asc"
  | "name_desc"
  | "email_asc"
  | "email_desc"
  | "team_asc"
  | "team_desc"
  | "job_asc"
  | "job_desc"
  | "status_asc"
  | "status_desc";

function isTemporaryImportEmail(email: string | null | undefined) {
  return TEMP_EMAIL_PATTERN.test((email ?? "").trim());
}

function normalizeSearchText(value: string | null | undefined) {
  return (value ?? "").toLowerCase().replace(/\s+/g, "");
}

function compareText(a: string, b: string) {
  return a.localeCompare(b, "ja", { numeric: true, sensitivity: "base" });
}

export default function EmployeeClient() {
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [warningMsg, setWarningMsg] = useState("");
  const [currentProfileId, setCurrentProfileId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isGeneralAffairs, setIsGeneralAffairs] = useState(false);
  const [canManageEmploymentSettings, setCanManageEmploymentSettings] = useState(false);
  const [isTeamLeader, setIsTeamLeader] = useState(false);

  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [profileTeams, setProfileTeams] = useState<ProfileTeam[]>([]);
  const [profileJobs, setProfileJobs] = useState<ProfileJob[]>([]);
  const [teamLeaders, setTeamLeaders] = useState<TeamLeader[]>([]);
  const [manMonths, setManMonths] = useState<ManMonth[]>([]);

  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"create" | "edit">("create");
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);

  const [formEmail, setFormEmail] = useState("");
  const [formLastName, setFormLastName] = useState("");
  const [formFirstName, setFormFirstName] = useState("");
  const [formIsAdmin, setFormIsAdmin] = useState(false);
  const [formIsGeneralAffairs, setFormIsGeneralAffairs] = useState(false);
  const [formIsGeneralAffairsApprover, setFormIsGeneralAffairsApprover] = useState(false);
  const [formStatus, setFormStatus] = useState("0");
  const [formTeamIds, setFormTeamIds] = useState<string[]>([""]);
  const [formJobIds, setFormJobIds] = useState<string[]>([""]);
  const [formOperatingPersonMonths, setFormOperatingPersonMonths] = useState("1");
  const [formHireDate, setFormHireDate] = useState("");
  const [formPaidLeaveGrantDate, setFormPaidLeaveGrantDate] = useState("");
  const [formPaidLeaveDays, setFormPaidLeaveDays] = useState("");
  const [formScheduledWorkHours, setFormScheduledWorkHours] = useState("");
  const [formScheduledWorkMinutes, setFormScheduledWorkMinutes] = useState("");
  const [formHasBreak, setFormHasBreak] = useState("");
  const [visibleStatuses, setVisibleStatuses] = useState<number[]>([0]);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [sortKey, setSortKey] = useState<EmployeeSortKey>("created_desc");
  const [currentPage, setCurrentPage] = useState(1);

  const [menuOpen, setMenuOpen] = useState(false);
  const [menuTargetProfileId, setMenuTargetProfileId] = useState<string | null>(null);
  const [menuTargetName, setMenuTargetName] = useState("");
  const [menuPermissionMap, setMenuPermissionMap] = useState<Record<string, boolean>>(
    getDefaultMenuPermissionMap()
  );
  const [menuSaving, setMenuSaving] = useState(false);

  const buildTeamPathMap = (teamList: Team[]) => {
    const teamMap = new Map(teamList.map((team) => [team.id, team]));
    const cache = new Map<string, string>();

    const getPath = (teamId: string): string => {
      if (cache.has(teamId)) return cache.get(teamId)!;

      const names: string[] = [];
      const visited = new Set<string>();
      let currentId: string | null = teamId;

      while (currentId) {
        if (visited.has(currentId)) break;
        visited.add(currentId);

        const current = teamMap.get(currentId);
        if (!current) break;
        names.unshift(current.name);
        currentId = current.parent_id;
      }

      const path = names.join(" / ");
      cache.set(teamId, path);
      return path;
    };

    return { getPath };
  };

  const expandTeamIdsWithParents = (selectedTeamIds: string[], teamList: Team[]) => {
  const teamMap = new Map(teamList.map((team) => [team.id, team]));
  const result = new Set<string>();

  for (const teamId of selectedTeamIds) {
    let currentId: string | null = teamId;

    while (currentId) {
      if (result.has(currentId)) break;
      result.add(currentId);

      const currentTeam = teamMap.get(currentId);
      currentId = currentTeam?.parent_id ?? null;
    }
  }

    return Array.from(result);
  };

  const load = async () => {
    setLoading(true);
    setErrorMsg("");
    setWarningMsg("");

    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw new Error(authError.message);

      const authUserId = authData.user?.id;
      if (!authUserId) throw new Error("ログインユーザーを取得できません。再ログインしてください。");

      const { data: resolvedProfileId, error: resolvedProfileError } = await supabase.rpc("current_profile_id");
      if (resolvedProfileError) throw new Error(resolvedProfileError.message);

      const currentProfileIdValue = typeof resolvedProfileId === "string" ? resolvedProfileId : authUserId;

      const { data: canManageWorkSettings, error: canManageWorkSettingsError } = await supabase.rpc(
        "can_manage_employee_work_settings",
      );
      if (canManageWorkSettingsError) throw new Error(canManageWorkSettingsError.message);

      // Supabase の select() は、動的な文字列を渡すと型パーサーが
      // ParserError を返すことがあるため、権限ごとにクエリを分岐させます。
      const profileResult =
        canManageWorkSettings === true
          ? await supabase
              .from("profiles_2")
              .select("*")
              .order("created_at", { ascending: false })
          : await supabase
              .from("profiles_2")
              .select(
                "id,email,last_name,first_name,is_admin,is_general_affairs,is_general_affairs_approver,status,created_at"
              )
              .order("created_at", { ascending: false });

      const profileData = (profileResult.data ?? []) as unknown as Partial<Profile>[];
      const profileError = profileResult.error;

      const [
        { data: currentProfile, error: currentProfileError },
        { data: teamData, error: teamError },
        { data: jobData, error: jobError },
        { data: profileTeamData, error: profileTeamError },
        { data: profileJobData, error: profileJobError },
        { data: manMonthData, error: manMonthError },
        { data: teamLeaderData, error: teamLeaderError },
      ] = await Promise.all([
        supabase.from("profiles_2").select("id,is_admin,is_general_affairs").eq("id", currentProfileIdValue).maybeSingle(),
        supabase.from("team").select("id,parent_id,name").order("created_at", { ascending: true }),
        supabase.from("job").select("id,name").order("created_at", { ascending: true }),
        supabase.from("profile_team").select("profile_id,team_id"),
        supabase.from("profile_job").select("profile_id,job_id"),
        supabase
          .from("man_month")
          .select("profile_id,target_year_month,operating_person_months")
          .eq("target_year_month", getCurrentTargetYearMonth()),
        supabase.from("team_leader").select("team_id,profile_id"),
      ]);

      if (currentProfileError) throw new Error(currentProfileError.message);
      if (profileError) throw new Error(profileError.message);
      if (teamError) throw new Error(teamError.message);
      if (jobError) throw new Error(jobError.message);
      if (profileTeamError) throw new Error(profileTeamError.message);
      if (profileJobError) throw new Error(profileJobError.message);
      if (manMonthError) throw new Error(manMonthError.message);
      if (teamLeaderError) throw new Error(teamLeaderError.message);

      const currentIsAdmin = currentProfile?.is_admin === 1;
      const currentIsGeneralAffairs = currentProfile?.is_general_affairs === 1;
      const nextTeamLeaders = (teamLeaderData ?? []) as TeamLeader[];
      const currentLeaderTeamIds = nextTeamLeaders
        .filter((leader) => leader.profile_id === currentProfileIdValue)
        .map((leader) => leader.team_id);

      setCurrentProfileId(currentProfileIdValue);
      setIsAdmin(currentIsAdmin);
      setIsGeneralAffairs(currentIsGeneralAffairs);
      setCanManageEmploymentSettings(canManageWorkSettings === true);
      setIsTeamLeader(currentLeaderTeamIds.length > 0);

      const nextProfiles = profileData.map((profile) => ({
        id: profile.id ?? "",
        email: profile.email ?? null,
        last_name: profile.last_name ?? null,
        first_name: profile.first_name ?? null,
        is_admin: profile.is_admin ?? null,
        is_general_affairs: profile.is_general_affairs ?? null,
        is_general_affairs_approver: profile.is_general_affairs_approver ?? null,
        status: profile.status ?? null,
        hire_date: profile.hire_date ?? null,
        paid_leave_grant_date: profile.paid_leave_grant_date ?? null,
        paid_leave_days: profile.paid_leave_days ?? null,
        scheduled_work_minutes: profile.scheduled_work_minutes ?? null,
        has_break: profile.has_break ?? null,
        created_at: profile.created_at ?? "",
      })) satisfies Profile[];
      const nextTeams = (teamData ?? []) as Team[];
      const nextJobs = (jobData ?? []) as Job[];
      const nextProfileTeams = (profileTeamData ?? []) as ProfileTeam[];
      const nextProfileJobs = (profileJobData ?? []) as ProfileJob[];
      const nextManMonths = (manMonthData ?? []) as ManMonth[];

      setProfiles(nextProfiles);
      setTeams(nextTeams);
      setJobs(nextJobs);
      setProfileTeams(nextProfileTeams);
      setProfileJobs(nextProfileJobs);
      setTeamLeaders(nextTeamLeaders);
      setManMonths(nextManMonths);

      const hasUnregisteredUser = nextProfiles.some(
        (profile) =>
          normalizeStatusValue(profile.status) !== 2 &&
          !!(profile.email ?? "").trim() &&
          !isTemporaryImportEmail(profile.email) &&
          (isBlank(profile.last_name) || isBlank(profile.first_name))
      );

      if ((currentIsAdmin || currentIsGeneralAffairs) && hasUnregisteredUser) {
        setWarningMsg("未登録のユーザーがいます");
      }
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const leaderTeamIds = useMemo(() => {
    if (!currentProfileId) return new Set<string>();
    return new Set(teamLeaders.filter((leader) => leader.profile_id === currentProfileId).map((leader) => leader.team_id));
  }, [currentProfileId, teamLeaders]);

  const leaderEffectiveTeamIds = useMemo(() => {
    const result = new Set(leaderTeamIds);
    const childrenByParent = new Map<string | null, Team[]>();

    for (const team of teams) {
      const parentId = team.parent_id ?? null;
      if (!childrenByParent.has(parentId)) childrenByParent.set(parentId, []);
      childrenByParent.get(parentId)!.push(team);
    }

    const walk = (teamId: string) => {
      for (const child of childrenByParent.get(teamId) ?? []) {
        if (result.has(child.id)) continue;
        result.add(child.id);
        walk(child.id);
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

  const canManageEmployee = isAdmin || isGeneralAffairs;
  const canOpenEmployeeEdit = canManageEmployee || canManageEmploymentSettings;
  const canEditGeneralEmployeeFields = canManageEmployee;

  const canManageMenuForProfile = (profileId: string) => {
    if (canManageEmployee) return true;
    return leaderManagedProfileIds.has(profileId);
  };

  const showOperationColumn = canOpenEmployeeEdit || isTeamLeader;

  const rows = useMemo<EmployeeRow[]>(() => {
    const teamPathHelper = buildTeamPathMap(teams);
    const teamsByProfile = new Map<string, string[]>();
    const jobsByProfile = new Map<string, string[]>();
    const jobNameMap = new Map(jobs.map((job) => [job.id, job.name]));

    const childTeamIdsByProfile = new Map<string, Set<string>>();

    for (const relation of profileTeams) {
      if (!teamsByProfile.has(relation.profile_id)) teamsByProfile.set(relation.profile_id, []);
      teamsByProfile.get(relation.profile_id)!.push(relation.team_id);
    }

    const teamMap = new Map(teams.map((team) => [team.id, team]));

    for (const relation of profileTeams) {
      const team = teamMap.get(relation.team_id);
      const parentId = team?.parent_id ?? null;
      if (!parentId) continue;

      if (!childTeamIdsByProfile.has(relation.profile_id)) {
        childTeamIdsByProfile.set(relation.profile_id, new Set());
      }
      childTeamIdsByProfile.get(relation.profile_id)!.add(parentId);
    }

    for (const relation of profileJobs) {
      const name = jobNameMap.get(relation.job_id) ?? "";
      if (!jobsByProfile.has(relation.profile_id)) jobsByProfile.set(relation.profile_id, []);
      if (name) jobsByProfile.get(relation.profile_id)!.push(name);
    }

    return profiles
      .filter((profile) => {
        if (!canOpenEmployeeEdit && !leaderManagedProfileIds.has(profile.id)) return false;
        const status = normalizeStatusValue(profile.status);
        return visibleStatuses.includes(status) && !isBlank(profile.last_name) && !isBlank(profile.first_name);
      })
      .map((profile) => ({
        profile_id: profile.id,
        email: (profile.email ?? "").trim(),
        last_name: profile.last_name ?? "",
        first_name: profile.first_name ?? "",
        team_paths: (() => {
          const assignedTeamIds = uniq((teamsByProfile.get(profile.id) ?? []).filter(Boolean));
          const parentTeamIds = childTeamIdsByProfile.get(profile.id) ?? new Set<string>();

          const leafTeamPaths = assignedTeamIds
            .filter((teamId) => !parentTeamIds.has(teamId))
            .map((teamId) => teamPathHelper.getPath(teamId))
            .filter(Boolean);

          return uniq(leafTeamPaths).join("、");
        })(),
        jobs: uniq((jobsByProfile.get(profile.id) ?? []).filter(Boolean)).join("、"),
        status: normalizeStatusValue(profile.status),
        created_at: profile.created_at,
      }));
  }, [canOpenEmployeeEdit, jobs, leaderManagedProfileIds, profileJobs, profiles, profileTeams, teams, visibleStatuses]);

  const filteredRows = useMemo(() => {
    const normalizedKeyword = normalizeSearchText(searchKeyword);

    return rows.filter((row) => {
      if (!normalizedKeyword) return true;

      const values = [
        row.email,
        row.last_name,
        row.first_name,
        fullName(row.last_name, row.first_name),
        row.team_paths,
        row.jobs,
        statusValueToLabel(row.status),
      ];

      return values.some((value) => normalizeSearchText(value).includes(normalizedKeyword));
    });
  }, [rows, searchKeyword]);

  const sortedRows = useMemo(() => {
    const nextRows = [...filteredRows];

    nextRows.sort((a, b) => {
      switch (sortKey) {
        case "created_asc":
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        case "name_asc":
          return compareText(fullName(a.last_name, a.first_name), fullName(b.last_name, b.first_name));
        case "name_desc":
          return compareText(fullName(b.last_name, b.first_name), fullName(a.last_name, a.first_name));
        case "email_asc":
          return compareText(a.email, b.email);
        case "email_desc":
          return compareText(b.email, a.email);
        case "team_asc":
          return compareText(a.team_paths, b.team_paths);
        case "team_desc":
          return compareText(b.team_paths, a.team_paths);
        case "job_asc":
          return compareText(a.jobs, b.jobs);
        case "job_desc":
          return compareText(b.jobs, a.jobs);
        case "status_asc":
          return a.status - b.status || compareText(fullName(a.last_name, a.first_name), fullName(b.last_name, b.first_name));
        case "status_desc":
          return b.status - a.status || compareText(fullName(a.last_name, a.first_name), fullName(b.last_name, b.first_name));
        case "created_desc":
        default:
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
    });

    return nextRows;
  }, [filteredRows, sortKey]);

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / PAGE_SIZE));
  const currentPageSafe = Math.min(currentPage, totalPages);
  const pageStartIndex = (currentPageSafe - 1) * PAGE_SIZE;
  const paginatedRows = sortedRows.slice(pageStartIndex, pageStartIndex + PAGE_SIZE);
  const pageDisplayStart = sortedRows.length === 0 ? 0 : pageStartIndex + 1;
  const pageDisplayEnd = Math.min(pageStartIndex + PAGE_SIZE, sortedRows.length);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);


  const unregisteredProfiles = useMemo(() => {
    return profiles
      .filter(
        (profile) =>
          normalizeStatusValue(profile.status) !== 2 &&
          !!(profile.email ?? "").trim() &&
          !isTemporaryImportEmail(profile.email) &&
          (isBlank(profile.last_name) || isBlank(profile.first_name))
      )
      .map((profile) => ({
        id: profile.id,
        email: (profile.email ?? "").trim(),
      }))
      .sort((a, b) => a.email.localeCompare(b.email, "ja"));
  }, [profiles]);

  const unregisteredProfileMap = useMemo(() => {
    return new Map(unregisteredProfiles.map((profile) => [profile.id, profile]));
  }, [unregisteredProfiles]);

  const teamOptions = useMemo(() => {
    const byParent = new Map<string | null, Team[]>();
    for (const team of teams) {
      const key = team.parent_id ?? null;
      if (!byParent.has(key)) byParent.set(key, []);
      byParent.get(key)!.push(team);
    }

    for (const [, value] of byParent) {
      value.sort((a, b) => a.name.localeCompare(b.name, "ja"));
    }

    const options: { id: string; label: string }[] = [];

    const walk = (parentId: string | null, depth: number) => {
      const children = byParent.get(parentId) ?? [];
      for (const child of children) {
        options.push({ id: child.id, label: `${"　".repeat(depth)}${child.name}` });
        walk(child.id, depth + 1);
      }
    };

    walk(null, 0);
    return options;
  }, [teams]);

  const jobOptions = useMemo(() => {
    return [...jobs].sort((a, b) => a.name.localeCompare(b.name, "ja"));
  }, [jobs]);

  const usedJobIds = useMemo(() => new Set(formJobIds.filter(Boolean)), [formJobIds]);

  const resetForm = () => {
    setFormEmail("");
    setFormLastName("");
    setFormFirstName("");
    setFormIsAdmin(false);
    setFormIsGeneralAffairs(false);
    setFormIsGeneralAffairsApprover(false);
    setFormStatus("0");
    setFormTeamIds([""]);
    setFormJobIds([""]);
    setFormOperatingPersonMonths("1");
    setFormHireDate("");
    setFormPaidLeaveGrantDate("");
    setFormPaidLeaveDays("");
    setFormScheduledWorkHours("");
    setFormScheduledWorkMinutes("");
    setFormHasBreak("");
    setEditingProfileId(null);
  };

  const openCreate = () => {
    if (!canManageEmployee) return;
    setErrorMsg("");
    setMode("create");
    resetForm();
    setOpen(true);
  };

  const closeModal = () => {
    setOpen(false);
    setEditingProfileId(null);
  };

  const openEdit = (profileId: string) => {
    if (!canOpenEmployeeEdit) return;

    setErrorMsg("");
    setMode("edit");
    setEditingProfileId(profileId);

    const profile = profiles.find((item) => item.id === profileId);
    if (!profile) {
      setErrorMsg("編集対象のユーザーが見つかりません。再読み込みしてください。");
      return;
    }

    setFormEmail((profile.email ?? "").trim());
    setFormLastName(profile.last_name ?? "");
    setFormFirstName(profile.first_name ?? "");
    setFormIsAdmin(profile.is_admin === 1);
    setFormIsGeneralAffairs(profile.is_general_affairs === 1);
    setFormIsGeneralAffairsApprover(profile.is_general_affairs_approver === 1);
    setFormStatus(String(profile.status ?? 0));

    const nextTeamIds = profileTeams
      .filter((item) => item.profile_id === profileId)
      .map((item) => item.team_id);
    const nextJobIds = profileJobs
      .filter((item) => item.profile_id === profileId)
      .map((item) => item.job_id);

    setFormTeamIds(nextTeamIds.length ? uniq(nextTeamIds) : [""]);
    setFormJobIds(nextJobIds.length ? uniq(nextJobIds) : [""]);

    const currentManMonth = manMonths.find((item) => item.profile_id === profileId);
    setFormOperatingPersonMonths(
      currentManMonth?.operating_person_months != null
        ? String(currentManMonth.operating_person_months)
        : "1"
    );

    setFormHireDate(profile.hire_date ?? "");
    setFormPaidLeaveGrantDate(profile.paid_leave_grant_date ?? "");
    setFormPaidLeaveDays(profile.paid_leave_days != null ? String(profile.paid_leave_days) : "");
    const scheduledWorkParts = scheduledWorkMinutesToParts(profile.scheduled_work_minutes);
    setFormScheduledWorkHours(scheduledWorkParts.hours);
    setFormScheduledWorkMinutes(scheduledWorkParts.minutes);
    setFormHasBreak(profile.has_break == null ? "" : profile.has_break ? "1" : "0");
    setOpen(true);
  };


  const openMenuPermission = async (profileId: string) => {
    if (!canManageMenuForProfile(profileId)) {
      setErrorMsg("画面管理権限がありません。");
      return;
    }

    setErrorMsg("");
    setMenuTargetProfileId(profileId);

    const profile = profiles.find((item) => item.id === profileId);
    if (!profile) {
      setErrorMsg("画面管理対象のユーザーが見つかりません。再読み込みしてください。");
      return;
    }

    setMenuTargetName(fullName(profile.last_name, profile.first_name) || profile.email || "-");

    const nextPermissionMap = getDefaultMenuPermissionMap();

    const { data, error } = await supabase
      .from("profile_menu_permission")
      .select("menu_group_key,menu_item_href,can_view")
      .eq("profile_id", profileId);

    if (error) {
      setErrorMsg(error.message);
      return;
    }

    for (const row of (data ?? []) as ProfileMenuPermission[]) {
      nextPermissionMap[menuPermissionKey(row.menu_group_key, row.menu_item_href ?? "")] = row.can_view !== false;
    }

    setMenuPermissionMap(nextPermissionMap);
    setMenuOpen(true);
  };

  const closeMenuModal = () => {
    if (menuSaving) return;
    setMenuOpen(false);
    setMenuTargetProfileId(null);
    setMenuTargetName("");
    setMenuPermissionMap(getDefaultMenuPermissionMap());
  };

  const setMenuGroupPermission = (groupKey: string, checked: boolean) => {
    const group = MENU_GROUPS.find((item) => item.key === groupKey);
    if (!group) return;

    setMenuPermissionMap((current) => {
      const next = { ...current, [menuPermissionKey(group.key)]: checked };
      for (const item of group.items) {
        next[menuPermissionKey(group.key, item.href)] = checked;
      }
      return next;
    });
  };

  const setMenuItemPermission = (groupKey: string, itemHref: string, checked: boolean) => {
    const group = MENU_GROUPS.find((item) => item.key === groupKey);
    if (!group) return;

    setMenuPermissionMap((current) => {
      const next = { ...current, [menuPermissionKey(groupKey, itemHref)]: checked };
      const hasVisibleItem = group.items.some((item) => {
        if (item.href === itemHref) return checked;
        return next[menuPermissionKey(groupKey, item.href)] !== false;
      });
      next[menuPermissionKey(groupKey)] = hasVisibleItem;
      return next;
    });
  };

  const saveMenuPermissions = async () => {
    if (!menuTargetProfileId) {
      setErrorMsg("画面管理対象のユーザーを取得できません。");
      return;
    }
    if (!canManageMenuForProfile(menuTargetProfileId)) {
      setErrorMsg("画面管理権限がありません。");
      return;
    }

    setMenuSaving(true);
    setErrorMsg("");

    try {
      const updaterId = await getCurrentUpdaterId();
      const payload = MENU_GROUPS.flatMap((group) => [
        {
          profile_id: menuTargetProfileId,
          menu_group_key: group.key,
          menu_item_href: "",
          can_view: menuPermissionMap[menuPermissionKey(group.key)] !== false,
          updated_by: updaterId,
        },
        ...group.items.map((item) => ({
          profile_id: menuTargetProfileId,
          menu_group_key: group.key,
          menu_item_href: item.href,
          can_view: menuPermissionMap[menuPermissionKey(group.key, item.href)] !== false,
          updated_by: updaterId,
        })),
      ]);

      const { error } = await supabase
        .from("profile_menu_permission")
        .upsert(payload, { onConflict: "profile_id,menu_group_key,menu_item_href" });

      if (error) throw new Error(error.message);

      setMenuOpen(false);
      setMenuTargetProfileId(null);
      setMenuTargetName("");
      setMenuPermissionMap(getDefaultMenuPermissionMap());
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : String(error));
    } finally {
      setMenuSaving(false);
    }
  };

  const addTeamRow = () => setFormTeamIds((current) => [...current, ""]);
  const removeTeamRow = (index: number) => {
    setFormTeamIds((current) => (current.length <= 1 ? current : current.filter((_, idx) => idx !== index)));
  };
  const setTeamAt = (index: number, value: string) => {
    setFormTeamIds((current) => current.map((item, idx) => (idx === index ? value : item)));
  };

  const addJobRow = () => setFormJobIds((current) => [...current, ""]);
  const removeJobRow = (index: number) => {
    setFormJobIds((current) => (current.length <= 1 ? current : current.filter((_, idx) => idx !== index)));
  };
  const setJobAt = (index: number, value: string) => {
    setFormJobIds((current) => current.map((item, idx) => (idx === index ? value : item)));
  };


  const toggleVisibleStatus = (status: number) => {
    setVisibleStatuses((current) =>
      current.includes(status) ? current.filter((item) => item !== status) : [...current, status].sort()
    );
    setCurrentPage(1);
  };

  const getSelectedProfileId = () => {
    if (mode === "edit") return editingProfileId;
    return formEmail || null;
  };

  const validate = () => {
    if (mode === "create") {
      if (!canEditGeneralEmployeeFields) return "新規社員登録の権限がありません。";
      if (!formEmail) return "未登録ユーザーを選択してください。";
      if (!unregisteredProfileMap.has(formEmail)) return "未登録ユーザーの中から選択してください。";
    }

    if (!getSelectedProfileId()) return "対象ユーザーを取得できません。";

    if (canEditGeneralEmployeeFields) {
      if (!formLastName.trim()) return "姓を入力してください。";
      if (!formFirstName.trim()) return "名を入力してください。";

      const teamIds = formTeamIds.map((item) => item.trim()).filter(Boolean);
      if (teamIds.length !== uniq(teamIds).length) return "所属組織が重複しています。";

      const jobIds = formJobIds.map((item) => item.trim()).filter(Boolean);
      if (jobIds.length !== uniq(jobIds).length) return "職種が重複しています。";

      const operatingPersonMonths = Number(normalizeOperatingPersonMonths(formOperatingPersonMonths));
      if (!Number.isFinite(operatingPersonMonths) || operatingPersonMonths < 0) {
        return "稼働人月は0以上の数値で入力してください。";
      }
    }

    if (canManageEmploymentSettings) {
      if (formPaidLeaveDays.trim()) {
        const paidLeaveDays = Number(formPaidLeaveDays);
        if (!Number.isFinite(paidLeaveDays) || paidLeaveDays < 0) {
          return "有給日数は0以上の数値で入力してください。";
        }
      }

      const hasScheduledHours = formScheduledWorkHours.trim() !== "";
      const hasScheduledMinutes = formScheduledWorkMinutes.trim() !== "";
      if (hasScheduledHours || hasScheduledMinutes) {
        const hours = Number(formScheduledWorkHours || "0");
        const minutes = Number(formScheduledWorkMinutes || "0");
        if (!Number.isInteger(hours) || hours < 0 || hours > 24) {
          return "所定労働時間の時間は0〜24の整数で入力してください。";
        }
        if (!Number.isInteger(minutes) || minutes < 0 || minutes > 59) {
          return "所定労働時間の分は0〜59の整数で入力してください。";
        }
        if (hours * 60 + minutes > 24 * 60) {
          return "所定労働時間は24時間以内で入力してください。";
        }
      }
    }

    return null;
  };

  const getCurrentUpdaterId = async () => {
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError) throw new Error(authError.message);

    const authUserId = authData.user?.id;
    if (!authUserId) throw new Error("ログインユーザーを取得できません。再ログインしてください。");

    const { data: resolvedProfileId, error: resolvedProfileError } = await supabase.rpc("current_profile_id");
    if (resolvedProfileError) throw new Error(resolvedProfileError.message);

    const profileId = typeof resolvedProfileId === "string" ? resolvedProfileId : authUserId;
    if (!profileId) throw new Error("更新者プロフィールが見つかりません。");

    return profileId;
  };

  const save = async () => {
    if (!canOpenEmployeeEdit) {
      setErrorMsg("編集権限がありません。");
      return;
    }

    setErrorMsg("");

    const validationError = validate();
    if (validationError) {
      setErrorMsg(validationError);
      return;
    }

    setSaving(true);

    try {
      const updaterId = await getCurrentUpdaterId();
      const profileId = getSelectedProfileId();
      if (!profileId) throw new Error("対象ユーザーを取得できません。再度お試しください。");

      const selectedTeamIds = uniq(formTeamIds.map((item) => item.trim()).filter(Boolean));
      const teamIds = expandTeamIdsWithParents(selectedTeamIds, teams);
      const jobIds = uniq(formJobIds.map((item) => item.trim()).filter(Boolean));

      const profileUpdatePayload: Record<string, unknown> = {
        updated_by: updaterId,
      };

      if (canEditGeneralEmployeeFields) {
        Object.assign(profileUpdatePayload, {
          last_name: formLastName.trim(),
          first_name: formFirstName.trim(),
          ...(isAdmin ? { is_admin: formIsAdmin ? 1 : 0 } : {}),
          is_general_affairs: formIsGeneralAffairs ? 1 : 0,
          is_general_affairs_approver: formIsGeneralAffairsApprover ? 1 : 0,
          status: statusLabelToValue(formStatus),
        });
      }

      if (canManageEmploymentSettings) {
        const hasScheduledWorkValue =
          formScheduledWorkHours.trim() !== "" || formScheduledWorkMinutes.trim() !== "";
        const scheduledWorkMinutes = hasScheduledWorkValue
          ? Number(formScheduledWorkHours || "0") * 60 + Number(formScheduledWorkMinutes || "0")
          : null;

        Object.assign(profileUpdatePayload, {
          hire_date: nullableDate(formHireDate),
          paid_leave_grant_date: nullableDate(formPaidLeaveGrantDate),
          paid_leave_days: formPaidLeaveDays.trim() ? Number(formPaidLeaveDays) : null,
          scheduled_work_minutes: scheduledWorkMinutes,
          has_break: formHasBreak === "" ? null : formHasBreak === "1",
        });
      }

      const { error: profileUpdateError } = await supabase
        .from("profiles_2")
        .update(profileUpdatePayload)
        .eq("id", profileId);

      if (profileUpdateError) throw new Error(profileUpdateError.message);

      if (canEditGeneralEmployeeFields) {
        const { error: deleteTeamError } = await supabase.from("profile_team").delete().eq("profile_id", profileId);
        if (deleteTeamError) throw new Error(deleteTeamError.message);

        if (teamIds.length > 0) {
          const teamPayload = teamIds.map((teamId) => ({
            profile_id: profileId,
            team_id: teamId,
            updated_by: updaterId,
          }));

          const { error: insertTeamError } = await supabase.from("profile_team").insert(teamPayload);
          if (insertTeamError) throw new Error(insertTeamError.message);
        }

        const { error: deleteJobError } = await supabase.from("profile_job").delete().eq("profile_id", profileId);
        if (deleteJobError) throw new Error(deleteJobError.message);

        if (jobIds.length > 0) {
          const jobPayload = jobIds.map((jobId) => ({
            profile_id: profileId,
            job_id: jobId,
            updated_by: updaterId,
          }));

          const { error: insertJobError } = await supabase.from("profile_job").insert(jobPayload);
          if (insertJobError) throw new Error(insertJobError.message);
        }

        const normalizedOperatingPersonMonths = Number(normalizeOperatingPersonMonths(formOperatingPersonMonths));
        const currentTargetYearMonth = getCurrentTargetYearMonth();

        if (normalizedOperatingPersonMonths === 1) {
          const { error: deleteManMonthError } = await supabase
            .from("man_month")
            .delete()
            .eq("profile_id", profileId)
            .eq("target_year_month", currentTargetYearMonth);

          if (deleteManMonthError) throw new Error(deleteManMonthError.message);
        } else {
          const { error: upsertManMonthError } = await supabase
            .from("man_month")
            .upsert(
              {
                profile_id: profileId,
                target_year_month: currentTargetYearMonth,
                operating_person_months: normalizedOperatingPersonMonths,
                updated_by: updaterId,
              },
              { onConflict: "profile_id,target_year_month" }
            );

          if (upsertManMonthError) throw new Error(upsertManMonthError.message);
        }
      }

      closeModal();
      await load();
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className={styles.page}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>社員一覧</h1>

        <div className={styles.pageHeaderLinks}>
          {canManageEmploymentSettings && (
            <Link href="/employee-report" className={styles.btnOutline}>
              帳票出力
            </Link>
          )}
          {canManageEmployee && (
            <button type="button" onClick={openCreate} className={styles.btnRed} disabled={saving}>
              ＋ 新規社員登録
            </button>
          )}
        </div>
      </div>

      <div className={styles.topBorder} />

      {canManageEmployee && warningMsg && unregisteredProfiles.length > 0 && (
        <details className={styles.warningBox}>
          <summary className={styles.warningSummary}>{warningMsg}</summary>
          <div className={styles.warningBody}>
            {unregisteredProfiles.length === 0 ? (
              <p className={styles.warningEmpty}>未登録ユーザーはありません。</p>
            ) : (
              <ul className={styles.warningList}>
                {unregisteredProfiles.map((profile) => (
                  <li key={profile.id}>{profile.email}</li>
                ))}
              </ul>
            )}
          </div>
        </details>
      )}
      {errorMsg && <p className={styles.errorText}>{errorMsg}</p>}

      <div className={styles.listControls}>
        <div className={styles.searchControl}>
          <label className={styles.filterLabel} htmlFor="employee-search">検索</label>
          <input
            id="employee-search"
            value={searchKeyword}
            onChange={(event) => {
              setSearchKeyword(event.target.value);
              setCurrentPage(1);
            }}
            className={styles.searchInput}
            placeholder="氏名・メール・所属組織・職種で検索"
          />
        </div>

        <div className={styles.sortControl}>
          <label className={styles.filterLabel} htmlFor="employee-sort">並べ替え</label>
          <select
            id="employee-sort"
            value={sortKey}
            onChange={(event) => {
              setSortKey(event.target.value as EmployeeSortKey);
              setCurrentPage(1);
            }}
            className={styles.sortSelect}
          >
            <option value="created_desc">登録日が新しい順</option>
            <option value="created_asc">登録日が古い順</option>
            <option value="name_asc">社員名 昇順</option>
            <option value="name_desc">社員名 降順</option>
            <option value="email_asc">メールアドレス 昇順</option>
            <option value="email_desc">メールアドレス 降順</option>
            <option value="team_asc">所属組織 昇順</option>
            <option value="team_desc">所属組織 降順</option>
            <option value="job_asc">職種 昇順</option>
            <option value="job_desc">職種 降順</option>
            <option value="status_asc">在籍状況 昇順</option>
            <option value="status_desc">在籍状況 降順</option>
          </select>
        </div>

        <div className={styles.filterBar}>
          <span className={styles.filterLabel}>在籍状況</span>
          <label className={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={visibleStatuses.includes(0)}
              onChange={() => toggleVisibleStatus(0)}
            />
            <span>在籍中</span>
          </label>
          <label className={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={visibleStatuses.includes(1)}
              onChange={() => toggleVisibleStatus(1)}
            />
            <span>休職中</span>
          </label>
          <label className={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={visibleStatuses.includes(2)}
              onChange={() => toggleVisibleStatus(2)}
            />
            <span>離職済み</span>
          </label>
        </div>
      </div>

      <div className={styles.resultSummary}>
        {sortedRows.length === rows.length
          ? `全${sortedRows.length}件`
          : `${sortedRows.length}件 / 全${rows.length}件`}
        {sortedRows.length > 0 && `（${pageDisplayStart}〜${pageDisplayEnd}件目を表示）`}
      </div>

      <div className={styles.tableFrame}>
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th}>#</th>
                <th className={styles.th}>メールアドレス</th>
                <th className={styles.th}>社員名</th>
                <th className={styles.thWide}>所属組織</th>
                <th className={styles.th}>職種</th>
                <th className={styles.th}>在籍状況</th>
                {showOperationColumn && <th className={styles.thRight}>操作</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td className={styles.td} colSpan={showOperationColumn ? 7 : 6}>
                    読み込み中...
                  </td>
                </tr>
              ) : sortedRows.length === 0 ? (
                <tr>
                  <td className={styles.td} colSpan={showOperationColumn ? 7 : 6}>
                    表示対象のユーザーがいません。
                  </td>
                </tr>
              ) : (
                paginatedRows.map((row, index) => (
                  <tr key={row.profile_id}>
                    <td className={styles.tdSmall}>{pageStartIndex + index + 1}</td>
                    <td className={styles.td}>{row.email}</td>
                    <td className={styles.td}>{fullName(row.last_name, row.first_name)}</td>
                    <td className={styles.tdWide}>{row.team_paths}</td>
                    <td className={styles.td}>{row.jobs}</td>
                    <td className={styles.td}>{statusValueToLabel(row.status)}</td>
                    {showOperationColumn && (
                      <td className={styles.tdRight}>
                        <div className={styles.operationButtons}>
                          {canOpenEmployeeEdit && (
                            <button
                              type="button"
                              onClick={() => openEdit(row.profile_id)}
                              className={styles.btnSmall}
                              disabled={saving || menuSaving}
                            >
                              編集
                            </button>
                          )}
                          {canManageMenuForProfile(row.profile_id) && (
                            <button
                              type="button"
                              onClick={() => openMenuPermission(row.profile_id)}
                              className={styles.btnSmall}
                              disabled={saving || menuSaving}
                            >
                              画面管理
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className={styles.paginationBar}>
        <button
          type="button"
          className={styles.pageButton}
          onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
          disabled={loading || currentPageSafe <= 1}
        >
          前へ
        </button>
        <span className={styles.pageInfo}>
          {currentPageSafe} / {totalPages}ページ
        </span>
        <button
          type="button"
          className={styles.pageButton}
          onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
          disabled={loading || currentPageSafe >= totalPages}
        >
          次へ
        </button>
      </div>

      {open && canOpenEmployeeEdit && (
        <div className={styles.modalOverlay} onClick={closeModal}>
          <div className={styles.modalCard} onClick={(event) => event.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>{mode === "edit" ? "社員編集" : "社員登録画面"}</h2>
              <button type="button" onClick={closeModal} className={styles.btnX} aria-label="close">
                ✕
              </button>
            </div>

            <div className={styles.modalForm}>
              {!canEditGeneralEmployeeFields && canManageEmploymentSettings && (
                <p className={styles.limitedEditNotice}>勤務・有給情報のみ編集できます。</p>
              )}
              <div className={styles.formRow}>
                <div className={styles.formLabel}>メール</div>
                <div>
                  {mode === "create" ? (
                    <select
                      value={formEmail}
                      onChange={(event) => setFormEmail(event.target.value)}
                      className={styles.select}
                      disabled={!canEditGeneralEmployeeFields}
                    >
                      <option value="">未登録ユーザーを選択してください</option>
                      {unregisteredProfiles.map((profile) => (
                        <option key={profile.id} value={profile.id}>
                          {profile.email}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input value={formEmail} className={styles.input} readOnly />
                  )}
                </div>
              </div>

              <div className={styles.formRow}>
                <div className={styles.formLabel}>姓</div>
                <input
                  value={formLastName}
                  onChange={(event) => setFormLastName(event.target.value)}
                  className={styles.input}
                  readOnly={!canEditGeneralEmployeeFields}
                />
              </div>

              <div className={styles.formRow}>
                <div className={styles.formLabel}>名</div>
                <input
                  value={formFirstName}
                  onChange={(event) => setFormFirstName(event.target.value)}
                  className={styles.input}
                  readOnly={!canEditGeneralEmployeeFields}
                />
              </div>

              {isAdmin && (
                <div className={styles.formRow}>
                  <div className={styles.formLabel}>管理者</div>
                  <label className={styles.checkboxLabel}>
                    <input
                      type="checkbox"
                      checked={formIsAdmin}
                      onChange={(event) => setFormIsAdmin(event.target.checked)}
                    />
                    <span>管理者にする</span>
                  </label>
                </div>
              )}

              <div className={styles.formRow}>
                <div className={styles.formLabel}>総務権限</div>
                <label className={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={formIsGeneralAffairs}
                    onChange={(event) => setFormIsGeneralAffairs(event.target.checked)}
                    disabled={!canEditGeneralEmployeeFields}
                  />
                  <span>総務権限を付与する</span>
                </label>
              </div>

              <div className={styles.formRow}>
                <div className={styles.formLabel}>総務承認者権限</div>
                <label className={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={formIsGeneralAffairsApprover}
                    onChange={(event) => setFormIsGeneralAffairsApprover(event.target.checked)}
                    disabled={!canEditGeneralEmployeeFields}
                  />
                  <span>総務承認者権限を付与する</span>
                </label>
              </div>

              <div className={styles.formRow}>
                <div className={styles.formLabel}>在籍状況</div>
                <select
                  value={formStatus}
                  onChange={(event) => setFormStatus(event.target.value)}
                  className={styles.select}
                  disabled={!canEditGeneralEmployeeFields}
                >
                  <option value="0">在籍中</option>
                  <option value="1">休職中</option>
                  <option value="2">離職済み</option>
                </select>
              </div>

              <div className={styles.formRow}>
                <div className={styles.formLabel}>稼働人月</div>
                <div>
                  <input
                    value={formOperatingPersonMonths}
                    onChange={(event) => setFormOperatingPersonMonths(event.target.value)}
                    className={styles.input}
                    inputMode="decimal"
                    placeholder="1"
                    readOnly={!canEditGeneralEmployeeFields}
                  />
                  <p className={styles.formHelpText}>当月の稼働人月を入力します。</p>
                </div>
              </div>

              {canManageEmploymentSettings && (
                <>
                  <hr className={styles.divider} />

                  <div className={styles.protectedSection}>
                    <div className={styles.protectedSectionHeader}>
                      <strong>勤務・有給情報</strong>
                    </div>

                    <div className={styles.formRow}>
                      <div className={styles.formLabel}>入社日</div>
                      <input
                        type="date"
                        value={formHireDate}
                        onChange={(event) => setFormHireDate(event.target.value)}
                        className={styles.input}
                      />
                    </div>

                    <div className={styles.formRow}>
                      <div className={styles.formLabel}>有給発生日</div>
                      <input
                        type="date"
                        value={formPaidLeaveGrantDate}
                        onChange={(event) => setFormPaidLeaveGrantDate(event.target.value)}
                        className={styles.input}
                      />
                    </div>

                    <div className={styles.formRow}>
                      <div className={styles.formLabel}>有給日数</div>
                      <div>
                        <input
                          type="number"
                          min="0"
                          step="0.5"
                          value={formPaidLeaveDays}
                          onChange={(event) => setFormPaidLeaveDays(event.target.value)}
                          className={styles.input}
                          placeholder="例：10"
                        />
                        <p className={styles.formHelpText}>半日単位の場合は0.5で入力できます。</p>
                      </div>
                    </div>

                    <div className={styles.formRow}>
                      <div className={styles.formLabel}>所定労働時間</div>
                      <div className={styles.durationInputs}>
                        <label>
                          <input
                            type="number"
                            min="0"
                            max="24"
                            step="1"
                            value={formScheduledWorkHours}
                            onChange={(event) => setFormScheduledWorkHours(event.target.value)}
                            className={styles.durationInput}
                          />
                          <span>時間</span>
                        </label>
                        <label>
                          <input
                            type="number"
                            min="0"
                            max="59"
                            step="1"
                            value={formScheduledWorkMinutes}
                            onChange={(event) => setFormScheduledWorkMinutes(event.target.value)}
                            className={styles.durationInput}
                          />
                          <span>分</span>
                        </label>
                      </div>
                    </div>

                    <div className={styles.formRow}>
                      <div className={styles.formLabel}>休憩時間有無</div>
                      <select
                        value={formHasBreak}
                        onChange={(event) => setFormHasBreak(event.target.value)}
                        className={styles.select}
                      >
                        <option value="">未設定</option>
                        <option value="1">あり</option>
                        <option value="0">なし</option>
                      </select>
                    </div>
                  </div>

                  <hr className={styles.divider} />
                </>
              )}

              <div className={styles.block}>
                <div className={styles.blockHeader}>
                  <div className={styles.blockLabel}>所属組織</div>
                  <button type="button" onClick={addTeamRow} className={styles.btnPlus} disabled={saving || !canEditGeneralEmployeeFields}>
                    ＋ 所属組織を追加
                  </button>
                </div>

                {formTeamIds.map((teamId, index) => (
                  <div key={`team-${index}`} className={styles.dynamicRow}>
                    <select
                      value={teamId}
                      onChange={(event) => setTeamAt(index, event.target.value)}
                      className={styles.selectWide}
                      disabled={!canEditGeneralEmployeeFields}
                    >
                      <option value="">選択してください（組織管理）</option>
                      {teamOptions.map((team) => (
                        <option key={team.id} value={team.id}>
                          {team.label}
                        </option>
                      ))}
                    </select>

                    {index > 0 && (
                      <button
                        type="button"
                        onClick={() => removeTeamRow(index)}
                        className={styles.btnMini}
                        disabled={saving || !canEditGeneralEmployeeFields}
                      >
                        削除
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <div className={styles.block}>
                <div className={styles.blockHeader}>
                  <div className={styles.blockLabel}>職種</div>
                  <button type="button" onClick={addJobRow} className={styles.btnPlus} disabled={saving || !canEditGeneralEmployeeFields}>
                    ＋ 職種を追加
                  </button>
                </div>

                {formJobIds.map((jobId, index) => (
                  <div key={`job-${index}`} className={styles.dynamicRow}>
                    <select
                      value={jobId}
                      onChange={(event) => setJobAt(index, event.target.value)}
                      className={styles.selectWide}
                      disabled={!canEditGeneralEmployeeFields}
                    >
                      <option value="">選択してください（職種管理）</option>
                      {jobOptions.map((job) => {
                        const alreadyUsed = usedJobIds.has(job.id) && job.id !== jobId;
                        return (
                          <option key={job.id} value={job.id} disabled={alreadyUsed}>
                            {job.name}
                          </option>
                        );
                      })}
                    </select>

                    {index > 0 && (
                      <button
                        type="button"
                        onClick={() => removeJobRow(index)}
                        className={styles.btnMini}
                        disabled={saving || !canEditGeneralEmployeeFields}
                      >
                        削除
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <div className={styles.modalButtonRow}>
                <button type="button" onClick={save} className={styles.btnRedBig} disabled={saving}>
                  {saving ? "保存中..." : mode === "edit" ? "更新する" : "登録する"}
                </button>
              </div>

              {errorMsg && <p className={styles.modalErrorText}>{errorMsg}</p>}
            </div>
          </div>
        </div>
      )}


      {menuOpen && menuTargetProfileId && canManageMenuForProfile(menuTargetProfileId) && (
        <div className={styles.modalOverlay} onClick={closeMenuModal}>
          <div className={styles.menuModalCard} onClick={(event) => event.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>画面管理：{menuTargetName}</h2>
              <button type="button" onClick={closeMenuModal} className={styles.btnX} aria-label="close">
                ✕
              </button>
            </div>

            <div className={styles.menuPermissionBody}>
              <p className={styles.formHelpText}>
                チェックを外した画面は、対象社員のメニューから非表示になります。大分類のチェックを外すと配下の画面もまとめて非表示になります。
              </p>

              <div className={styles.menuPermissionList}>
                {MENU_GROUPS.map((group) => {
                  const groupChecked = menuPermissionMap[menuPermissionKey(group.key)] !== false;

                  return (
                    <section key={group.key} className={styles.menuPermissionGroup}>
                      <label className={styles.menuPermissionGroupLabel}>
                        <input
                          type="checkbox"
                          checked={groupChecked}
                          onChange={(event) => setMenuGroupPermission(group.key, event.target.checked)}
                          disabled={menuSaving}
                        />
                        <span>{group.title}</span>
                      </label>

                      <div className={styles.menuPermissionItems}>
                        {group.items.map((item) => {
                          const itemChecked = menuPermissionMap[menuPermissionKey(group.key, item.href)] !== false;

                          return (
                            <label key={item.href} className={styles.menuPermissionItemLabel}>
                              <input
                                type="checkbox"
                                checked={groupChecked && itemChecked}
                                onChange={(event) => setMenuItemPermission(group.key, item.href, event.target.checked)}
                                disabled={menuSaving || !groupChecked}
                              />
                              <span>{item.label}</span>
                              {"adminOnly" in item && item.adminOnly && (
                                <span className={styles.menuPermissionNote}>管理者専用</span>
                              )}
                            </label>
                          );
                        })}
                      </div>
                    </section>
                  );
                })}
              </div>

              <div className={styles.modalButtonRow}>
                <button type="button" onClick={saveMenuPermissions} className={styles.btnRedBig} disabled={menuSaving}>
                  {menuSaving ? "保存中..." : "保存する"}
                </button>
              </div>

              {errorMsg && <p className={styles.modalErrorText}>{errorMsg}</p>}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
