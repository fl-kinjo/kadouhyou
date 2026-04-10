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
  status: number | null;
  created_at: string;
};

type ProfileTeam = {
  profile_id: string;
  team_id: string;
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

export default function EmployeeClient() {
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [warningMsg, setWarningMsg] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);

  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [profileTeams, setProfileTeams] = useState<ProfileTeam[]>([]);
  const [profileJobs, setProfileJobs] = useState<ProfileJob[]>([]);
  const [manMonths, setManMonths] = useState<ManMonth[]>([]);

  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"create" | "edit">("create");
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);

  const [formEmail, setFormEmail] = useState("");
  const [formLastName, setFormLastName] = useState("");
  const [formFirstName, setFormFirstName] = useState("");
  const [formIsAdmin, setFormIsAdmin] = useState(false);
  const [formStatus, setFormStatus] = useState("0");
  const [formTeamIds, setFormTeamIds] = useState<string[]>([""]);
  const [formJobIds, setFormJobIds] = useState<string[]>([""]);
  const [formOperatingPersonMonths, setFormOperatingPersonMonths] = useState("1");
  const [visibleStatuses, setVisibleStatuses] = useState<number[]>([0]);

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

      const [
        { data: currentProfile, error: currentProfileError },
        { data: profileData, error: profileError },
        { data: teamData, error: teamError },
        { data: jobData, error: jobError },
        { data: profileTeamData, error: profileTeamError },
        { data: profileJobData, error: profileJobError },
        { data: manMonthData, error: manMonthError },
      ] = await Promise.all([
        supabase.from("profiles_2").select("id,is_admin").eq("id", authUserId).maybeSingle(),
        supabase
          .from("profiles_2")
          .select("id,email,last_name,first_name,is_admin,status,created_at")
          .order("created_at", { ascending: false }),
        supabase.from("team").select("id,parent_id,name").order("created_at", { ascending: true }),
        supabase.from("job").select("id,name").order("created_at", { ascending: true }),
        supabase.from("profile_team").select("profile_id,team_id"),
        supabase.from("profile_job").select("profile_id,job_id"),
        supabase
          .from("man_month")
          .select("profile_id,target_year_month,operating_person_months")
          .eq("target_year_month", getCurrentTargetYearMonth()),
      ]);

      if (currentProfileError) throw new Error(currentProfileError.message);
      if (profileError) throw new Error(profileError.message);
      if (teamError) throw new Error(teamError.message);
      if (jobError) throw new Error(jobError.message);
      if (profileTeamError) throw new Error(profileTeamError.message);
      if (profileJobError) throw new Error(profileJobError.message);
      if (manMonthError) throw new Error(manMonthError.message);

      const currentIsAdmin = currentProfile?.is_admin === 1;
      setIsAdmin(currentIsAdmin);

      const nextProfiles = (profileData ?? []) as Profile[];
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
      setManMonths(nextManMonths);

      const hasUnregisteredUser = nextProfiles.some(
        (profile) => normalizeStatusValue(profile.status) !== 2 && (isBlank(profile.last_name) || isBlank(profile.first_name))
      );

      if (currentIsAdmin && hasUnregisteredUser) {
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
  }, [jobs, profileJobs, profiles, profileTeams, teams, visibleStatuses]);

  const unregisteredProfiles = useMemo(() => {
    return profiles
      .filter(
        (profile) =>
          normalizeStatusValue(profile.status) !== 2 &&
          !!(profile.email ?? "").trim() &&
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
    setFormStatus("0");
    setFormTeamIds([""]);
    setFormJobIds([""]);
    setFormOperatingPersonMonths("1");
    setEditingProfileId(null);
  };

  const openCreate = () => {
    if (!isAdmin) return;
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
    if (!isAdmin) return;

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
    setOpen(true);
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
  };

  const getSelectedProfileId = () => {
    if (mode === "edit") return editingProfileId;
    return formEmail || null;
  };

  const validate = () => {
    if (mode === "create") {
      if (!formEmail) return "未登録ユーザーを選択してください。";
      if (!unregisteredProfileMap.has(formEmail)) return "未登録ユーザーの中から選択してください。";
    }

    if (!getSelectedProfileId()) return "対象ユーザーを取得できません。";
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

    return null;
  };

  const getCurrentUpdaterId = async () => {
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError) throw new Error(authError.message);

    const authUserId = authData.user?.id;
    if (!authUserId) throw new Error("ログインユーザーを取得できません。再ログインしてください。");

    const { data: profile, error: profileError } = await supabase
      .from("profiles_2")
      .select("id")
      .eq("id", authUserId)
      .maybeSingle();

    if (profileError) throw new Error(profileError.message);
    if (!profile?.id) throw new Error("更新者プロフィールが見つかりません。");

    return profile.id;
  };

  const save = async () => {
    if (!isAdmin) {
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

      const { error: profileUpdateError } = await supabase
        .from("profiles_2")
        .update({
          last_name: formLastName.trim(),
          first_name: formFirstName.trim(),
          is_admin: formIsAdmin ? 1 : 0,
          status: statusLabelToValue(formStatus),
          updated_by: updaterId,
        })
        .eq("id", profileId);

      if (profileUpdateError) throw new Error(profileUpdateError.message);

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
          <Link href="/team" className={styles.headerLink}>
            組織管理へ
          </Link>
          <Link href="/job" className={styles.headerLink}>
            職種管理へ
          </Link>
          {isAdmin && (
            <button type="button" onClick={openCreate} className={styles.btnRed} disabled={saving}>
              ＋ 新規社員登録
            </button>
          )}
        </div>
      </div>

      <div className={styles.topBorder} />

      {isAdmin && warningMsg && (
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
                {isAdmin && <th className={styles.thRight}>操作</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td className={styles.td} colSpan={isAdmin ? 7 : 6}>
                    読み込み中...
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td className={styles.td} colSpan={isAdmin ? 7 : 6}>
                    表示対象のユーザーがいません。
                  </td>
                </tr>
              ) : (
                rows.map((row, index) => (
                  <tr key={row.profile_id}>
                    <td className={styles.tdSmall}>{index + 1}</td>
                    <td className={styles.td}>{row.email}</td>
                    <td className={styles.td}>{fullName(row.last_name, row.first_name)}</td>
                    <td className={styles.tdWide}>{row.team_paths}</td>
                    <td className={styles.td}>{row.jobs}</td>
                    <td className={styles.td}>{statusValueToLabel(row.status)}</td>
                    {isAdmin && (
                      <td className={styles.tdRight}>
                        <div className={styles.operationButtons}>
                          <button
                            type="button"
                            onClick={() => openEdit(row.profile_id)}
                            className={styles.btnSmall}
                            disabled={saving}
                          >
                            編集
                          </button>
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

      {open && isAdmin && (
        <div className={styles.modalOverlay} onClick={closeModal}>
          <div className={styles.modalCard} onClick={(event) => event.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>{mode === "edit" ? "社員編集" : "社員登録画面"}</h2>
              <button type="button" onClick={closeModal} className={styles.btnX} aria-label="close">
                ✕
              </button>
            </div>

            <div className={styles.modalForm}>
              <div className={styles.formRow}>
                <div className={styles.formLabel}>メール</div>
                <div>
                  {mode === "create" ? (
                    <select
                      value={formEmail}
                      onChange={(event) => setFormEmail(event.target.value)}
                      className={styles.select}
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
                />
              </div>

              <div className={styles.formRow}>
                <div className={styles.formLabel}>名</div>
                <input
                  value={formFirstName}
                  onChange={(event) => setFormFirstName(event.target.value)}
                  className={styles.input}
                />
              </div>

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

              <div className={styles.formRow}>
                <div className={styles.formLabel}>在籍状況</div>
                <select
                  value={formStatus}
                  onChange={(event) => setFormStatus(event.target.value)}
                  className={styles.select}
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
                  />
                  <p className={styles.formHelpText}>当月の稼働人月を入力します。</p>
                </div>
              </div>

              <hr className={styles.divider} />

              <div className={styles.block}>
                <div className={styles.blockHeader}>
                  <div className={styles.blockLabel}>所属組織</div>
                  <button type="button" onClick={addTeamRow} className={styles.btnPlus} disabled={saving}>
                    ＋ 所属組織を追加
                  </button>
                </div>

                {formTeamIds.map((teamId, index) => (
                  <div key={`team-${index}`} className={styles.dynamicRow}>
                    <select
                      value={teamId}
                      onChange={(event) => setTeamAt(index, event.target.value)}
                      className={styles.selectWide}
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
                        disabled={saving}
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
                  <button type="button" onClick={addJobRow} className={styles.btnPlus} disabled={saving}>
                    ＋ 職種を追加
                  </button>
                </div>

                {formJobIds.map((jobId, index) => (
                  <div key={`job-${index}`} className={styles.dynamicRow}>
                    <select
                      value={jobId}
                      onChange={(event) => setJobAt(index, event.target.value)}
                      className={styles.selectWide}
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
                        disabled={saving}
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
    </main>
  );
}
