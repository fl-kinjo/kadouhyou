"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/app/utils/supabase/client";
import styles from "./leave-request-client.module.css";

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

type PaidLeaveBalanceRow = {
  profile_id: string;
  remaining_days: number | string;
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

type TabType = "form" | "list";

type SelectedLeaveTypeMap = Record<string, number>;

type GroupedRequest = {
  requestGroupId: string;
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

const LEAVE_TYPE_OPTIONS = [
  { value: 0, label: "有給" },
  { value: 1, label: "午前休" },
  { value: 2, label: "午後休" },
  { value: 3, label: "特別休暇" },
  { value: 4, label: "無給" },
  { value: 5, label: "夏休" },
] as const;

const APPROVAL_STATUS_LABELS: Record<number, string> = {
  0: "申請中",
  1: "承認",
  2: "却下",
  3: "取消",
};

function getLeaveTypeLabel(value: number) {
  return LEAVE_TYPE_OPTIONS.find((item) => item.value === value)?.label ?? String(value);
}

function getLeaveDays(value: number) {
  if (value === 1 || value === 2) return 0.5;
  return 1;
}

function formatDays(value: number) {
  return Number.isInteger(value) ? `${value.toFixed(1)}日` : `${value}日`;
}

function formatDateJP(dateText: string) {
  return dateText.replaceAll("-", "/");
}

function getMonthStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function formatMonthTitle(date: Date) {
  return `${date.getFullYear()}年${date.getMonth() + 1}月`;
}

function toDateKey(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function buildCalendarDays(baseDate: Date) {
  const start = getMonthStart(baseDate);
  const startWeekday = start.getDay();
  const first = new Date(start);
  first.setDate(first.getDate() - startWeekday);

  const days: { key: string; day: number; inMonth: boolean }[] = [];

  for (let i = 0; i < 35; i += 1) {
    const current = new Date(first);
    current.setDate(first.getDate() + i);
    days.push({
      key: toDateKey(current),
      day: current.getDate(),
      inMonth: current.getMonth() === baseDate.getMonth(),
    });
  }

  return days;
}

function sortDateKeys(dateKeys: string[]) {
  return [...dateKeys].sort((a, b) => a.localeCompare(b, "ja"));
}

function getProfileDisplayName(profile: Pick<ProfileOption, "last_name" | "first_name" | "email">) {
  const name = [profile.last_name, profile.first_name].filter(Boolean).join(" ").trim();
  return name || profile.email || "氏名未設定";
}

function uniq(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function getApprovalStatusClass(status: number) {
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

export default function LeaveRequestClient() {
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [activeTab, setActiveTab] = useState<TabType>("form");

  const [displayMonth, setDisplayMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const [remainingDays, setRemainingDays] = useState(0);
  const [summerLeaveDays, setSummerLeaveDays] = useState(0);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequestRow[]>([]);

  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [selectedLeaveTypes, setSelectedLeaveTypes] = useState<SelectedLeaveTypeMap>({});
  const [comment, setComment] = useState("");

  const [approvalFlowOpen, setApprovalFlowOpen] = useState(false);
  const [approvalFlowLoading, setApprovalFlowLoading] = useState(false);
  const [approvalMemberOptions, setApprovalMemberOptions] = useState<ProfileOption[]>([]);
  const [selectedStep1ApproverIds, setSelectedStep1ApproverIds] = useState<string[]>([]);
  const [selectedShareMemberIds, setSelectedShareMemberIds] = useState<string[]>([]);
  const [shareMemberSearch, setShareMemberSearch] = useState("");
  const [generalAffairsApproverCount, setGeneralAffairsApproverCount] = useState(0);

  const calendarDays = useMemo(() => buildCalendarDays(displayMonth), [displayMonth]);

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

  const resolveCurrentProfile = useCallback(async (): Promise<CurrentProfile> => {
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
  }, [supabase]);

  const load = useCallback(async () => {
    setLoading(true);
    setMessage("");

    try {
      const currentProfile = await resolveCurrentProfile();
      const userId = currentProfile.id;

      const [{ data: balanceData, error: balanceError }, { data: requestData, error: requestError }] =
        await Promise.all([
          supabase
            .from("paid_leave_balance")
            .select("profile_id,remaining_days")
            .eq("profile_id", userId)
            .maybeSingle(),
          supabase
            .from("leave_request")
            .select("id,profile_id,work_date,leave_type,approval_status,request_group_id,comment,created_at")
            .eq("profile_id", userId)
            .order("work_date", { ascending: false })
            .order("created_at", { ascending: false }),
        ]);

      if (balanceError) throw new Error(balanceError.message);
      if (requestError) throw new Error(requestError.message);

      const balance = (balanceData ?? null) as PaidLeaveBalanceRow | null;
      const requests = (requestData ?? []) as LeaveRequestRow[];

      const baseRemainingDays = Number(balance?.remaining_days ?? 0);

      const approvedUsedDays = requests.reduce((sum, row) => {
        if (row.approval_status !== 1) return sum;
        if (row.leave_type === 0 || row.leave_type === 5) return sum + 1;
        if (row.leave_type === 1 || row.leave_type === 2) return sum + 0.5;
        return sum;
      }, 0);

      setRemainingDays(baseRemainingDays - approvedUsedDays);
      setSummerLeaveDays(requests.filter((row) => row.leave_type === 5).length);
      setLeaveRequests(requests);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }, [resolveCurrentProfile, supabase]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleDateSelection = (dateKey: string, inMonth: boolean) => {
    if (!inMonth) return;

    setSelectedDates((current) => {
      if (current.includes(dateKey)) {
        const next = current.filter((item) => item !== dateKey);
        return sortDateKeys(next);
      }
      return sortDateKeys([...current, dateKey]);
    });

    setSelectedLeaveTypes((current) => {
      if (current[dateKey] != null) {
        const next = { ...current };
        delete next[dateKey];
        return next;
      }
      return {
        ...current,
        [dateKey]: 0,
      };
    });
  };

  const setLeaveTypeAtDate = (dateKey: string, value: number) => {
    setSelectedLeaveTypes((current) => ({
      ...current,
      [dateKey]: value,
    }));
  };

  const clearSelection = () => {
    setSelectedDates([]);
    setSelectedLeaveTypes({});
    setComment("");
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

  const validateLeaveRequestForm = () => {
    if (selectedDates.length === 0) {
      throw new Error("申請日を選択してください。");
    }

    const workDates = sortDateKeys(selectedDates);
    const leaveTypes = workDates.map((dateKey) => selectedLeaveTypes[dateKey] ?? 0);

    return { workDates, leaveTypes };
  };

  const openApprovalFlowModal = async () => {
    setMessage("");

    try {
      validateLeaveRequestForm();
      setSelectedStep1ApproverIds([]);
      setSelectedShareMemberIds([]);
      setShareMemberSearch("");
      await loadApprovalFlowOptions();
      setApprovalFlowOpen(true);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  };

  const closeApprovalFlowModal = () => {
    if (saving) return;
    setApprovalFlowOpen(false);
    setSelectedStep1ApproverIds([]);
    setSelectedShareMemberIds([]);
    setShareMemberSearch("");
  };

  const submit = async () => {
    setMessage("");

    setSaving(true);

    try {
      const { workDates, leaveTypes } = validateLeaveRequestForm();
      const step1ApproverIds = uniq([...selectedStep1ApproverIds, ...selectedShareMemberIds]);

      if (step1ApproverIds.length === 0) {
        throw new Error("STEP 1 または共有先に承認者を1名以上選択してください。");
      }

      if (generalAffairsApproverCount === 0) {
        throw new Error("総務承認者権限を持つ社員が設定されていません。社員管理画面で総務承認者を設定してください。");
      }

      const { error } = await supabase.rpc("create_leave_request_with_flow", {
        target_work_dates: workDates,
        target_leave_types: leaveTypes,
        target_comment: comment.trim() || null,
        target_step1_approver_profile_ids: step1ApproverIds,
        target_shared_profile_ids: [],
      });

      if (error) throw new Error(error.message);

      closeApprovalFlowModal();
      clearSelection();
      setActiveTab("list");
      await load();
      setMessage("休暇申請が完了しました。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  const groupedRequests = useMemo<GroupedRequest[]>(() => {
    const map = new Map<string, GroupedRequest>();

    for (const row of leaveRequests) {
      const current = map.get(row.request_group_id);

      if (!current) {
        map.set(row.request_group_id, {
          requestGroupId: row.request_group_id,
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
  }, [leaveRequests]);

  return (
    <main className={styles.page}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>休暇申請</h1>
      </div>

      {message && <p className={styles.message}>{message}</p>}

      <div className={styles.summaryRow}>
        <div className={styles.summaryCard}>
          <div className={styles.summaryLabel}>有給休暇残日数</div>
          <div className={styles.summaryValue}>{formatDays(remainingDays)}</div>
        </div>

        <div className={styles.summaryCard}>
          <div className={styles.summaryLabel}>夏季休暇</div>
          <div className={styles.summaryValue}>{formatDays(summerLeaveDays)}</div>
        </div>
      </div>

      <div className={styles.tabBar}>
        <button
          type="button"
          className={`${styles.tabButton} ${activeTab === "form" ? styles.tabButtonActive : ""}`}
          onClick={() => setActiveTab("form")}
        >
          申請フォーム
        </button>
        <button
          type="button"
          className={`${styles.tabButton} ${activeTab === "list" ? styles.tabButtonActive : ""}`}
          onClick={() => setActiveTab("list")}
        >
          申請一覧
        </button>
      </div>

      {activeTab === "form" ? (
        <section className={styles.formSection}>
          <div className={styles.formGrid}>
            <div className={styles.calendarCard}>
              <div className={styles.calendarHeader}>
                <button
                  type="button"
                  className={styles.monthButton}
                  onClick={() =>
                    setDisplayMonth(
                      (current) => new Date(current.getFullYear(), current.getMonth() - 1, 1)
                    )
                  }
                >
                  ‹
                </button>
                <div className={styles.monthTitle}>{formatMonthTitle(displayMonth)}</div>
                <button
                  type="button"
                  className={styles.monthButton}
                  onClick={() =>
                    setDisplayMonth(
                      (current) => new Date(current.getFullYear(), current.getMonth() + 1, 1)
                    )
                  }
                >
                  ›
                </button>
              </div>

              <div className={styles.weekHeader}>
                {["日", "月", "火", "水", "木", "金", "土"].map((day) => (
                  <div key={day} className={styles.weekCell}>
                    {day}
                  </div>
                ))}
              </div>

              <div className={styles.calendarGrid}>
                {calendarDays.map((day) => {
                  const selected = selectedDates.includes(day.key);

                  return (
                    <button
                      key={day.key}
                      type="button"
                      className={`${styles.dayCell} ${day.inMonth ? "" : styles.dayCellMuted} ${
                        selected ? styles.dayCellSelected : ""
                      }`}
                      onClick={() => toggleDateSelection(day.key, day.inMonth)}
                    >
                      {day.day}
                    </button>
                  );
                })}
              </div>

              <p className={styles.calendarHelp}>日付をクリックして選択・解除</p>
            </div>

            <div className={styles.formRight}>
              <div className={styles.selectionCard}>
                {selectedDates.length === 0 ? (
                  <div className={styles.selectionEmpty}>カレンダーから日付を選択してください</div>
                ) : (
                  <div className={styles.selectionList}>
                    {selectedDates.map((dateKey) => (
                      <div key={dateKey} className={styles.selectionRow}>
                        <div className={styles.selectionDate}>{formatDateJP(dateKey)}</div>
                        <select
                          value={String(selectedLeaveTypes[dateKey] ?? 0)}
                          onChange={(event) => setLeaveTypeAtDate(dateKey, Number(event.target.value))}
                          className={styles.select}
                        >
                          {LEAVE_TYPE_OPTIONS.map((option) => (
                            <option key={option.value} value={String(option.value)}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className={styles.commentBlock}>
                <label className={styles.commentLabel}>コメント（任意）</label>
                <textarea
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                  className={styles.textarea}
                  rows={4}
                />
              </div>

              <div className={styles.actionRow}>
                <button type="button" className={styles.clearButton} onClick={clearSelection} disabled={saving}>
                  クリア
                </button>
                <button
                  type="button"
                  className={styles.submitButton}
                  onClick={openApprovalFlowModal}
                  disabled={saving || loading || approvalFlowLoading}
                >
                  {saving || approvalFlowLoading ? "処理中..." : "次へ"}
                </button>
              </div>
            </div>
          </div>
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
                  <div className={styles.requestCardHeader}>
                    <div>
                      <div className={styles.requestRange}>
                        {group.dateRangeLabel}（{formatDays(group.totalDays)}分）
                      </div>
                      <div className={styles.requestDate}>
                        申請日：{formatDateJP(group.createdAt.slice(0, 10))}
                      </div>
                    </div>
                    <div className={`${styles.requestStatus} ${getApprovalStatusClass(group.approvalStatus)}`}>
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

                  <div className={styles.requestComment}>
                    コメント：{group.comment || "-"}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}


      {approvalFlowOpen && (
        <div className={styles.modalOverlay} onClick={closeApprovalFlowModal}>
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

                <p className={styles.approvalFlowNote}>※ 上長の承認後に総務承認者へ通知されます</p>
                {selectedStep1ApproverIds.length === 0 && selectedShareMemberIds.length === 0 && (
                  <p className={styles.approvalFlowWarning}>STEP 1 または共有先に承認者を1名以上選択してください。</p>
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
              <button type="button" className={styles.modalCancelButton} onClick={closeApprovalFlowModal} disabled={saving}>
                キャンセル
              </button>
              <button
                type="button"
                className={styles.modalSaveButton}
                onClick={submit}
                disabled={
                  saving ||
                  (selectedStep1ApproverIds.length === 0 && selectedShareMemberIds.length === 0) ||
                  generalAffairsApproverCount === 0
                }
              >
                {saving ? "申請中..." : "申請する"}
              </button>
            </div>
          </div>
        </div>
      )}

    </main>
  );
}