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

function createRequestGroupId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
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

  const calendarDays = useMemo(() => buildCalendarDays(displayMonth), [displayMonth]);

  const load = useCallback(async () => {
    setLoading(true);
    setMessage("");

    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw new Error(authError.message);

      const userId = authData.user?.id;
      if (!userId) throw new Error("ログインユーザーを取得できません。");

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
  }, [supabase]);

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

  const submit = async () => {
    setMessage("");

    if (selectedDates.length === 0) {
      setMessage("申請日を選択してください。");
      return;
    }

    setSaving(true);

    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw new Error(authError.message);

      const userId = authData.user?.id;
      if (!userId) throw new Error("ログインユーザーを取得できません。");

      const requestGroupId = createRequestGroupId();

      const payload = selectedDates.map((dateKey) => ({
        profile_id: userId,
        work_date: dateKey,
        leave_type: selectedLeaveTypes[dateKey] ?? 0,
        approval_status: 0,
        request_group_id: requestGroupId,
        comment: comment.trim() || null,
        updated_by: userId,
      }));

      const { error } = await supabase.from("leave_request").insert(payload);

      if (error) throw new Error(error.message);

      clearSelection();
      setActiveTab("list");
      await load();
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
                <button type="button" className={styles.submitButton} onClick={submit} disabled={saving || loading}>
                  {saving ? "申請中..." : "申請する"}
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
    </main>
  );
}