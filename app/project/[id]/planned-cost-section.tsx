"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/app/utils/supabase/client";
import styles from "./planned-cost-section.module.css";

type Profile = {
  id: string;
  last_name: string | null;
  first_name: string | null;
  email: string | null;
  status: number | null;
};

type Partner = {
  id: string;
  name: string;
};

type Job = {
  id: string;
  name: string;
};

type PlannedCost = {
  id: string;
  project_id: string;
  category: number;
  expense_name: string | null;
  partner_id: string | null;
  job_id: string | null;
  profile_id: string | null;
  operating_person_months: number | string | null;
  target_year_month: string;
  amount: number | string | null;
};

type PlannedCostApprover = {
  id: string;
  request_id: string;
  approver_profile_id: string;
  approval_status: number;
  reviewed_at: string | null;
  reviewed_by: string | null;
};

type MonthEntry = {
  year: string;
  month: string;
  operatingPersonMonths: string;
  amount: string;
};

type CostGroup = {
  key: string;
  category: number;
  expense_name: string | null;
  partner_id: string | null;
  job_id: string | null;
  profile_id: string | null;
  rowIds: string[];
  entries: PlannedCost[];
};

const CATEGORY_LABELS: Record<number, string> = {
  0: "経費",
  1: "外注費",
  2: "工数",
};

const COST_PER_PERSON_DAY = 35000;

const PLANNED_COST_APPROVAL_STATUS = {
  draft: 0,
  pending: 1,
  approved: 2,
  rejected: 3,
  canceled: 4,
} as const;

const APPROVAL_STATUS_LABELS: Record<number, string> = {
  0: "未申請",
  1: "申請中",
  2: "承認済み",
  3: "却下",
  4: "取消",
};

function fullName(lastName?: string | null, firstName?: string | null) {
  const name = `${lastName ?? ""}${firstName ?? ""}`.trim();
  return name || "-";
}

function profileDisplayName(profile?: Profile | null) {
  if (!profile) return "-";
  return fullName(profile.last_name, profile.first_name) || profile.email || "-";
}

function normalizeSearchText(value: string | null | undefined) {
  return (value ?? "").toLowerCase().replace(/\s+/g, "");
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${y}/${m}/${d} ${hh}:${mm}`;
}

function uniq<T>(items: T[]) {
  return Array.from(new Set(items));
}

function toMonthLabel(value: string) {
  const [year, month] = value.split("-");
  return `${year}/${month}`;
}

function monthStartFromParts(year: string, month: string) {
  return `${year}-${month.padStart(2, "0")}-01`;
}

function splitYearMonth(value: string) {
  const [year, month] = value.split("-");
  return { year: year ?? "", month: month ?? "" };
}

function formatAmount(value: number | string | null) {
  if (value == null) return "";
  const numberValue = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(numberValue)) return String(value);
  return Math.round(numberValue).toLocaleString("ja-JP");
}

function formatCell(entry: PlannedCost, category: number) {
  if (category === 2) {
    const personMonths = entry.operating_person_months == null ? "-" : String(entry.operating_person_months);
    return `${personMonths}（${formatAmount(entry.amount)}）`;
  }
  return formatAmount(entry.amount);
}

function formatYen(value: number) {
  return `¥${Math.round(value).toLocaleString("ja-JP")}`;
}

function buildMonthLabels(startDate: string | null, endDate: string | null, costs: PlannedCost[]) {
  if (startDate && endDate) {
    const [startYear, startMonth] = startDate.split("-").map(Number);
    const [endYear, endMonth] = endDate.split("-").map(Number);
    const result: string[] = [];
    let year = startYear;
    let month = startMonth;
    while (year < endYear || (year === endYear && month <= endMonth)) {
      result.push(`${year}-${String(month).padStart(2, "0")}-01`);
      month += 1;
      if (month > 12) {
        year += 1;
        month = 1;
      }
    }
    return result;
  }

  return uniq(costs.map((cost) => cost.target_year_month)).sort();
}

function buildGroupKey(cost: PlannedCost) {
  return [cost.category, cost.expense_name ?? "", cost.partner_id ?? "", cost.job_id ?? "", cost.profile_id ?? ""].join("__");
}

export default function PlannedCostSection({
  projectId,
  startDate,
  endDate,
  initialCosts,
  initialRows,
  initialApprovers,
  initialRequestId = null,
  initialApprovalStatus = 0,
  initialRequestedAt = null,
  initialReviewedAt = null,
  profiles,
  partners,
  jobs,
  showHeader = true,
  sectionTitle = "予定コスト",
  openCreateSignal = 0,
}: {
  projectId: string;
  startDate: string | null;
  endDate: string | null;
  initialCosts?: PlannedCost[] | null;
  initialRows?: PlannedCost[] | null;
  initialApprovers?: PlannedCostApprover[] | null;
  initialRequestId?: string | null;
  initialApprovalStatus?: number | null;
  initialRequestedAt?: string | null;
  initialReviewedAt?: string | null;
  profiles: Profile[];
  partners: Partner[];
  jobs: Job[];
  showHeader?: boolean;
  sectionTitle?: string;
  openCreateSignal?: number;
}) {
  const router = useRouter();
  const supabase = createClient();

  const [costs, setCosts] = useState<PlannedCost[]>(Array.isArray(initialCosts) ? initialCosts : Array.isArray(initialRows) ? initialRows : []);
  const [, setCurrentRequestId] = useState<string | null>(initialRequestId ?? null);
  const [approvalStatus, setApprovalStatus] = useState<number>(initialApprovalStatus ?? 0);
  const [requestedAt, setRequestedAt] = useState<string | null>(initialRequestedAt ?? null);
  const [reviewedAt, setReviewedAt] = useState<string | null>(initialReviewedAt ?? null);
  const [approvers, setApprovers] = useState<PlannedCostApprover[]>(Array.isArray(initialApprovers) ? initialApprovers : []);
  const [requestOpen, setRequestOpen] = useState(false);
  const [requestSaving, setRequestSaving] = useState(false);
  const [approverSearch, setApproverSearch] = useState("");
  const [selectedApproverIds, setSelectedApproverIds] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [editGroupKey, setEditGroupKey] = useState<string | null>(null);
  const [category, setCategory] = useState("2");
  const [expenseName, setExpenseName] = useState("");
  const [partnerId, setPartnerId] = useState("");
  const [jobId, setJobId] = useState("");
  const [profileId, setProfileId] = useState("");
  const [monthEntries, setMonthEntries] = useState<MonthEntry[]>(() => {
    const today = new Date();
    return [
      {
        year: String(today.getFullYear()),
        month: String(today.getMonth() + 1).padStart(2, "0"),
        operatingPersonMonths: "1",
        amount: "",
      },
    ];
  });

  const profileMap = useMemo(() => new Map(profiles.map((profile) => [profile.id, profile])), [profiles]);
  const partnerMap = useMemo(() => new Map(partners.map((partner) => [partner.id, partner.name])), [partners]);
  const jobMap = useMemo(() => new Map(jobs.map((job) => [job.id, job.name])), [jobs]);
  const selectableProfiles = useMemo(() => profiles.filter((profile) => profile.status !== 2), [profiles]);
  const monthLabels = useMemo(() => buildMonthLabels(startDate, endDate, costs), [costs, endDate, startDate]);
  const approverNameText = useMemo(() => {
    if (approvers.length === 0) return "-";
    return approvers
      .map((approver) => {
        const profile = profileMap.get(approver.approver_profile_id);
        const name = profileDisplayName(profile);
        const status = APPROVAL_STATUS_LABELS[approver.approval_status] ?? "-";
        return `${name}（${status}）`;
      })
      .join("、");
  }, [approvers, profileMap]);
  const filteredApproverCandidates = useMemo(() => {
    const keyword = normalizeSearchText(approverSearch);
    return selectableProfiles.filter((profile) => {
      if (selectedApproverIds.includes(profile.id)) return false;
      if (!keyword) return true;
      const values = [
        profile.last_name,
        profile.first_name,
        profileDisplayName(profile),
        profile.email,
      ];
      return values.some((value) => normalizeSearchText(value).includes(keyword));
    });
  }, [approverSearch, selectableProfiles, selectedApproverIds]);

  const groups = useMemo<CostGroup[]>(() => {
    const map = new Map<string, CostGroup>();
    for (const cost of costs) {
      const key = buildGroupKey(cost);
      const current = map.get(key);
      if (current) {
        current.rowIds.push(cost.id);
        current.entries.push(cost);
      } else {
        map.set(key, {
          key,
          category: cost.category,
          expense_name: cost.expense_name,
          partner_id: cost.partner_id,
          job_id: cost.job_id,
          profile_id: cost.profile_id,
          rowIds: [cost.id],
          entries: [cost],
        });
      }
    }

    return Array.from(map.values()).sort((a, b) => {
      if (a.category !== b.category) return b.category - a.category;
      const aName = a.category === 2 ? jobMap.get(a.job_id ?? "") ?? "" : a.category === 1 ? "外注" : a.expense_name ?? "";
      const bName = b.category === 2 ? jobMap.get(b.job_id ?? "") ?? "" : b.category === 1 ? "外注" : b.expense_name ?? "";
      return aName.localeCompare(bName, "ja");
    });
  }, [costs, jobMap]);

  const plannedLaborGroups = useMemo(() => groups.filter((group) => group.category === 2), [groups]);
  const isApprovalPending = approvalStatus === PLANNED_COST_APPROVAL_STATUS.pending;
  const isApprovalCompleted = [
    PLANNED_COST_APPROVAL_STATUS.approved,
    PLANNED_COST_APPROVAL_STATUS.rejected,
    PLANNED_COST_APPROVAL_STATUS.canceled,
  ].includes(approvalStatus as 2 | 3 | 4);
  const requestButtonLabel = isApprovalPending
    ? "申請中"
    : isApprovalCompleted
    ? "予定工数を再申請する"
    : "予定工数を申請する";

  const markApprovalDraftAfterCostChange = () => {
    if (!isApprovalCompleted) return;
    setCurrentRequestId(null);
    setApprovalStatus(PLANNED_COST_APPROVAL_STATUS.draft);
    setRequestedAt(null);
    setReviewedAt(null);
    setApprovers([]);
  };

  const monthTotals = useMemo(() => {
    const map = new Map<string, number>();
    for (const cost of costs) {
      const amount = Number(cost.amount ?? 0);
      map.set(cost.target_year_month, (map.get(cost.target_year_month) ?? 0) + (Number.isFinite(amount) ? amount : 0));
    }
    return map;
  }, [costs]);

  const grandTotal = useMemo(() => Array.from(monthTotals.values()).reduce((sum, value) => sum + value, 0), [monthTotals]);

  const openCreate = () => {
    if (isApprovalPending) {
      setErrorMsg("予定工数申請中は予定工数を編集できません。承認・却下・取消後に再編集してください。");
      return;
    }
    resetForm();
    setEditGroupKey(null);
    setOpen(true);
  };

  useEffect(() => {
    if (openCreateSignal > 0) {
      openCreate();
    }
  }, [openCreateSignal]);

  const resetForm = () => {
    setErrorMsg("");
    setCategory("2");
    setExpenseName("");
    setPartnerId("");
    setJobId("");
    setProfileId("");
    const baseMonth = monthLabels[0] ?? `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-01`;
    const ym = splitYearMonth(baseMonth);
    setMonthEntries([
      {
        year: ym.year,
        month: ym.month,
        operatingPersonMonths: "1",
        amount: "",
      },
    ]);
  };

  const openEdit = (group: CostGroup) => {
    if (isApprovalPending) {
      setErrorMsg("予定工数申請中は予定工数を編集できません。承認・却下・取消後に再編集してください。");
      return;
    }
    setErrorMsg("");
    setEditGroupKey(group.key);
    setCategory(String(group.category));
    setExpenseName(group.expense_name ?? "");
    setPartnerId(group.partner_id ?? "");
    setJobId(group.job_id ?? "");
    setProfileId(group.profile_id ?? "");
    setMonthEntries(
      group.entries
        .slice()
        .sort((a, b) => a.target_year_month.localeCompare(b.target_year_month))
        .map((entry) => {
          const ym = splitYearMonth(entry.target_year_month);
          return {
            year: ym.year,
            month: ym.month,
            operatingPersonMonths: entry.operating_person_months == null ? "1" : String(entry.operating_person_months),
            amount: entry.amount == null ? "" : String(entry.amount),
          };
        })
    );
    setOpen(true);
  };

  const closeModal = () => {
    if (saving) return;
    setOpen(false);
    setEditGroupKey(null);
    setErrorMsg("");
  };

  const setMonthEntryAt = (index: number, key: keyof MonthEntry, value: string) => {
    setMonthEntries((current) => current.map((entry, idx) => (idx === index ? { ...entry, [key]: value } : entry)));
  };

  const addMonthEntry = () => {
    const last = monthEntries[monthEntries.length - 1];
    setMonthEntries((current) => [
      ...current,
      {
        year: last?.year || String(new Date().getFullYear()),
        month: last?.month || String(new Date().getMonth() + 1).padStart(2, "0"),
        operatingPersonMonths: category === "2" ? "1" : "",
        amount: "",
      },
    ]);
  };

  const removeMonthEntry = (index: number) => {
    setMonthEntries((current) => (current.length === 1 ? current : current.filter((_, idx) => idx !== index)));
  };

  const getUpdaterId = async () => {
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError) throw new Error(authError.message);
    const authUserId = authData.user?.id;
    const authUserEmail = authData.user?.email;
    if (!authUserId) throw new Error("ログインユーザーを取得できません。");

    const { data: profileById, error: profileByIdError } = await supabase
      .from("profiles_2")
      .select("id")
      .eq("id", authUserId)
      .maybeSingle();

    if (profileByIdError) throw new Error(profileByIdError.message);
    if (profileById?.id) return profileById.id;

    if (!authUserEmail) throw new Error("ログインユーザーのメールアドレスを取得できません。");

    const { data: profileByEmail, error: profileByEmailError } = await supabase
      .from("profiles_2")
      .select("id")
      .ilike("email", authUserEmail)
      .maybeSingle();

    if (profileByEmailError) throw new Error(profileByEmailError.message);
    if (!profileByEmail?.id) throw new Error("更新者プロフィールが見つかりません。");

    return profileByEmail.id;
  };

  const save = async () => {
    setErrorMsg("");
    const categoryNumber = Number(category);

    if (categoryNumber === 2) {
      if (!profileId) return setErrorMsg("メンバーを選択してください。");
      if (!jobId) return setErrorMsg("職種を選択してください。");
    }
    if (categoryNumber === 1 && !partnerId) return setErrorMsg("パートナーを選択してください。");
    if (categoryNumber === 0 && !expenseName.trim()) return setErrorMsg("費目を入力してください。");

    for (const entry of monthEntries) {
      if (!entry.year || !entry.month) return setErrorMsg("年月を入力してください。");
      if (Number(entry.month) < 1 || Number(entry.month) > 12) return setErrorMsg("月は1〜12で入力してください。");
      if (categoryNumber === 2) {
        const pm = Number(entry.operatingPersonMonths);
        if (!Number.isFinite(pm) || pm < 0) return setErrorMsg("工数は0以上の数値で入力してください。");
      } else {
        const amount = Number(entry.amount);
        if (!Number.isFinite(amount) || amount < 0) return setErrorMsg("金額は0以上の数値で入力してください。");
      }
    }

    setSaving(true);
    try {
      const updaterId = await getUpdaterId();
      const targetGroup = editGroupKey ? groups.find((group) => group.key === editGroupKey) : null;
      const payload = monthEntries.map((entry) => ({
        project_id: projectId,
        category: categoryNumber,
        expense_name: categoryNumber === 0 ? expenseName.trim() : null,
        partner_id: categoryNumber === 1 ? partnerId : null,
        job_id: categoryNumber === 2 ? jobId : null,
        profile_id: categoryNumber === 2 ? profileId : null,
        operating_person_months: categoryNumber === 2 ? Number(entry.operatingPersonMonths || "0") : null,
        target_year_month: monthStartFromParts(entry.year, entry.month),
        amount: categoryNumber === 2
          ? Math.round(Number(entry.operatingPersonMonths || "0") * COST_PER_PERSON_DAY)
          : Number(entry.amount),
        updated_by: updaterId,
      }));

      if (editGroupKey && targetGroup) {
        const { error: deleteError } = await supabase.from("project_planned_cost").delete().in("id", targetGroup.rowIds);
        if (deleteError) throw new Error(deleteError.message);
      }

      const { data, error } = await supabase
        .from("project_planned_cost")
        .insert(payload)
        .select("id,project_id,category,expense_name,partner_id,job_id,profile_id,operating_person_months,target_year_month,amount");

      if (error) throw new Error(error.message);


      const nextInserted = (data ?? []) as PlannedCost[];
      setCosts((current) => {
        const filtered = editGroupKey
          ? current.filter((item) => buildGroupKey(item) !== editGroupKey)
          : current;
        return [...filtered, ...nextInserted].sort((a, b) => a.target_year_month.localeCompare(b.target_year_month));
      });
      markApprovalDraftAfterCostChange();
      setOpen(false);
      setEditGroupKey(null);
      router.refresh();
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  const removeGroup = async (group: CostGroup) => {
    if (isApprovalPending) {
      setErrorMsg("予定工数申請中は予定工数を削除できません。承認・却下・取消後に再編集してください。");
      return;
    }
    if (!window.confirm("このコスト行を削除しますか？")) return;
    setErrorMsg("");
    try {
      const updaterId = await getUpdaterId();
      const { error } = await supabase.from("project_planned_cost").delete().in("id", group.rowIds);
      if (error) throw new Error(error.message);


      setCosts((current) => current.filter((item) => !group.rowIds.includes(item.id)));
      markApprovalDraftAfterCostChange();
      router.refresh();
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : String(error));
    }
  };

  const openRequestModal = () => {
    setErrorMsg("");
    if (isApprovalPending) {
      setErrorMsg("申請中の承認者は変更できません。承認・却下・取消後に再申請してください。");
      return;
    }
    if (plannedLaborGroups.length === 0) {
      setErrorMsg("予定工数を1件以上入力してから申請してください。");
      return;
    }
    setSelectedApproverIds([]);
    setApproverSearch("");
    setRequestOpen(true);
  };

  const closeRequestModal = () => {
    if (requestSaving) return;
    setRequestOpen(false);
    setApproverSearch("");
  };

  const addApprover = (profileId: string) => {
    setSelectedApproverIds((current) => (current.includes(profileId) ? current : [...current, profileId]));
    setApproverSearch("");
  };

  const removeApprover = (profileId: string) => {
    setSelectedApproverIds((current) => current.filter((id) => id !== profileId));
  };

  const submitApprovalRequest = async () => {
    setErrorMsg("");
    if (plannedLaborGroups.length === 0) {
      setErrorMsg("予定工数を1件以上入力してから申請してください。");
      return;
    }
    if (selectedApproverIds.length === 0) {
      setErrorMsg("承認者を1名以上選択してください。");
      return;
    }

    setRequestSaving(true);
    try {
      const { data: requestIdData, error } = await supabase.rpc("request_project_planned_cost_review", {
        target_project_id: projectId,
        approver_profile_ids: selectedApproverIds,
      });

      if (error) throw new Error(error.message);

      const nextRequestId = typeof requestIdData === "string" ? requestIdData : null;
      if (!nextRequestId) throw new Error("申請IDを取得できませんでした。");

      const { data: approverData, error: approverError } = await supabase
        .from("project_planned_cost_request_approver")
        .select("id,request_id,approver_profile_id,approval_status,reviewed_at,reviewed_by")
        .eq("request_id", nextRequestId)
        .order("created_at", { ascending: true });

      if (approverError) throw new Error(approverError.message);

      setCurrentRequestId(nextRequestId);
      setApprovers((approverData ?? []) as PlannedCostApprover[]);
      setApprovalStatus(PLANNED_COST_APPROVAL_STATUS.pending);
      setRequestedAt(new Date().toISOString());
      setReviewedAt(null);
      setRequestOpen(false);
      router.refresh();
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : String(error));
    } finally {
      setRequestSaving(false);
    }
  };

  return (
    <section className={styles.section}>
      {showHeader && (
        <div className={styles.headerRow}>
          <h2 className={styles.title}>{sectionTitle}</h2>
          <div className={styles.headerButtons}>
            <button type="button" className={styles.addButton} onClick={openCreate}>
              コスト行を追加
            </button>
            <button type="button" className={styles.confirmButton} onClick={openRequestModal} disabled={requestSaving || isApprovalPending}>
              {requestButtonLabel}
            </button>
          </div>
        </div>
      )}

      {errorMsg && !open && !requestOpen && <p className={styles.errorText}>{errorMsg}</p>}

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.th}>種別</th>
              <th className={styles.th}>職種/費目</th>
              <th className={styles.th}>担当者</th>
              {monthLabels.map((label) => (
                <th key={label} className={styles.thMonth}>{toMonthLabel(label)}</th>
              ))}
              <th className={styles.thTotal}>合計</th>
              <th className={styles.thAction}></th>
            </tr>
          </thead>
          <tbody>
            {groups.length === 0 ? (
              <tr>
                <td className={styles.emptyCell} colSpan={monthLabels.length + 5}>
                  予定コストはまだ登録されていません。
                </td>
              </tr>
            ) : (
              groups.map((group) => {
                const costMap = new Map(group.entries.map((entry) => [entry.target_year_month, entry]));
                const total = group.entries.reduce((sum, entry) => sum + Number(entry.amount ?? 0), 0);
                const typeLabel = CATEGORY_LABELS[group.category] ?? "-";
                const itemLabel =
                  group.category === 2
                    ? jobMap.get(group.job_id ?? "") ?? "-"
                    : group.category === 1
                    ? "外注"
                    : group.expense_name ?? "-";
                const ownerLabel =
                  group.category === 2
                    ? fullName(profileMap.get(group.profile_id ?? "")?.last_name, profileMap.get(group.profile_id ?? "")?.first_name)
                    : group.category === 1
                    ? partnerMap.get(group.partner_id ?? "") ?? "-"
                    : "-";

                return (
                  <tr key={group.key}>
                    <td className={styles.tdType}>{typeLabel}</td>
                    <td className={styles.tdMain}>{itemLabel}</td>
                    <td className={styles.tdOwner}>{ownerLabel}</td>
                    {monthLabels.map((label) => (
                      <td key={label} className={styles.tdMonth}>
                        {costMap.has(label) ? formatCell(costMap.get(label)!, group.category) : ""}
                      </td>
                    ))}
                    <td className={styles.tdTotal}>{formatYen(total)}</td>
                    <td className={styles.tdActions}>
                      <button type="button" className={styles.smallButton} onClick={() => openEdit(group)} disabled={isApprovalPending}>
                        編集
                      </button>
                      <button type="button" className={styles.smallButton} onClick={() => removeGroup(group)} disabled={isApprovalPending}>
                        削除
                      </button>
                    </td>
                  </tr>
                );
              })
            )}

            {groups.length > 0 && (
              <tr className={styles.totalRow}>
                <td className={styles.totalLabel} colSpan={3}>
                  合計
                </td>
                {monthLabels.map((label) => (
                  <td key={label} className={styles.totalValue}>
                    {formatAmount(monthTotals.get(label) ?? 0)}
                  </td>
                ))}
                <td className={styles.totalValueStrong}>{formatYen(grandTotal)}</td>
                <td className={styles.totalBlank}></td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className={styles.approvalPanel}>
        <div className={styles.approvalInfoGrid}>
          <div>
            <div className={styles.approvalLabel}>予定工数申請ステータス</div>
            <div className={styles.approvalValue}>{APPROVAL_STATUS_LABELS[approvalStatus] ?? "-"}</div>
          </div>
          <div>
            <div className={styles.approvalLabel}>申請日時</div>
            <div className={styles.approvalValue}>{formatDateTime(requestedAt)}</div>
          </div>
          <div>
            <div className={styles.approvalLabel}>承認完了日時</div>
            <div className={styles.approvalValue}>{formatDateTime(reviewedAt)}</div>
          </div>
          <div>
            <div className={styles.approvalLabel}>承認者</div>
            <div className={styles.approvalValue}>{approverNameText}</div>
          </div>
        </div>
        <button type="button" className={styles.confirmButton} onClick={openRequestModal} disabled={requestSaving || isApprovalPending}>
          {requestButtonLabel}
        </button>
        {isApprovalPending && (
          <p className={styles.approvalNotice}>申請中は予定工数と承認者を変更できません。</p>
        )}
      </div>

      {requestOpen && (
        <div className={styles.modalOverlay} onClick={closeRequestModal}>
          <div className={styles.modalCard} onClick={(event) => event.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>予定工数の申請</h3>
              <button type="button" className={styles.closeButton} onClick={closeRequestModal} aria-label="close">
                ✕
              </button>
            </div>

            <div className={styles.modalBody}>
              <p className={styles.formHelpText}>
                予定工数を確認してもらう承認者を選択してください。承認者は複数追加できます。
              </p>

              <div className={styles.formRow}>
                <label className={styles.formLabel}>承認者検索</label>
                <input
                  value={approverSearch}
                  onChange={(event) => setApproverSearch(event.target.value)}
                  className={styles.input}
                  placeholder="氏名・メールアドレスで検索"
                />
              </div>

              <div className={styles.candidateList}>
                {filteredApproverCandidates.length === 0 ? (
                  <div className={styles.candidateEmpty}>候補がありません。</div>
                ) : (
                  filteredApproverCandidates.slice(0, 20).map((profile) => (
                    <button
                      key={profile.id}
                      type="button"
                      className={styles.candidateButton}
                      onClick={() => addApprover(profile.id)}
                    >
                      <span>{profileDisplayName(profile)}</span>
                      <small>{profile.email ?? ""}</small>
                    </button>
                  ))
                )}
              </div>

              <div className={styles.selectedApproverArea}>
                <div className={styles.selectedApproverTitle}>選択中の承認者</div>
                {selectedApproverIds.length === 0 ? (
                  <p className={styles.formHelpText}>承認者が選択されていません。</p>
                ) : (
                  <div className={styles.selectedApproverList}>
                    {selectedApproverIds.map((profileId) => {
                      const profile = profileMap.get(profileId);
                      return (
                        <span key={profileId} className={styles.selectedApproverChip}>
                          {profileDisplayName(profile)}
                          <button type="button" onClick={() => removeApprover(profileId)} aria-label="remove">
                            ×
                          </button>
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>

              {errorMsg && <p className={styles.errorText}>{errorMsg}</p>}

              <div className={styles.submitRow}>
                <button type="button" onClick={submitApprovalRequest} className={styles.submitButton} disabled={requestSaving}>
                  {requestSaving ? "申請中..." : "申請する"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {open && (
        <div className={styles.modalOverlay} onClick={closeModal}>
          <div className={styles.modalCard} onClick={(event) => event.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>予定工数/経費の登録</h3>
              <button type="button" className={styles.closeButton} onClick={closeModal} aria-label="close">
                ✕
              </button>
            </div>

            <div className={styles.modalBody}>
              <div className={styles.formRow}>
                <label className={styles.formLabel}>区分</label>
                <select value={category} onChange={(e) => setCategory(e.target.value)} className={styles.select}>
                  <option value="2">工数</option>
                  <option value="1">外注費</option>
                  <option value="0">経費</option>
                </select>
              </div>

              {category === "2" && (
                <>
                  <div className={styles.formRow}>
                    <label className={styles.formLabel}>メンバー</label>
                    <select value={profileId} onChange={(e) => setProfileId(e.target.value)} className={styles.select}>
                      <option value="">選択してください</option>
                      {selectableProfiles.map((profile) => (
                        <option key={profile.id} value={profile.id}>
                          {fullName(profile.last_name, profile.first_name)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className={styles.formRow}>
                    <label className={styles.formLabel}>職種</label>
                    <select value={jobId} onChange={(e) => setJobId(e.target.value)} className={styles.select}>
                      <option value="">選択してください</option>
                      {jobs.map((job) => (
                        <option key={job.id} value={job.id}>
                          {job.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              {category === "1" && (
                <div className={styles.formRow}>
                  <label className={styles.formLabel}>パートナー</label>
                  <select value={partnerId} onChange={(e) => setPartnerId(e.target.value)} className={styles.select}>
                    <option value="">選択してください</option>
                    {partners.map((partner) => (
                      <option key={partner.id} value={partner.id}>
                        {partner.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {category === "0" && (
                <div className={styles.formRow}>
                  <label className={styles.formLabel}>費目</label>
                  <input value={expenseName} onChange={(e) => setExpenseName(e.target.value)} className={styles.input} />
                </div>
              )}

              <div className={styles.divider}></div>

              {monthEntries.map((entry, index) => (
                <div key={`entry-${index}`} className={styles.entryBlock}>
                  <div className={styles.entryRow}>
                    <input
                      value={entry.year}
                      onChange={(e) => setMonthEntryAt(index, "year", e.target.value)}
                      className={styles.inputSmall}
                      placeholder="2025"
                    />
                    <span className={styles.inlineLabel}>年</span>
                    <input
                      value={entry.month}
                      onChange={(e) => setMonthEntryAt(index, "month", e.target.value)}
                      className={styles.inputSmall}
                      placeholder="07"
                    />
                    <span className={styles.inlineLabel}>月</span>
                    {category === "2" ? (
                      <>
                        <span className={styles.slash}>/</span>
                        <input
                          value={entry.operatingPersonMonths}
                          onChange={(e) => setMonthEntryAt(index, "operatingPersonMonths", e.target.value)}
                          className={styles.inputSmall}
                          placeholder="1"
                        />
                        <span className={styles.inlineLabel}>人日</span>
                        <span className={styles.slash}>/</span>
                        <span className={styles.inlineLabel}>¥</span>
                        <input
                          value={String(Math.round((Number(entry.operatingPersonMonths) || 0) * COST_PER_PERSON_DAY))}
                          className={styles.inputMedium}
                          readOnly
                        />
                      </>
                    ) : (
                      <>
                        <span className={styles.slash}>/</span>
                        <span className={styles.inlineLabel}>¥</span>
                        <input
                          value={entry.amount}
                          onChange={(e) => setMonthEntryAt(index, "amount", e.target.value)}
                          className={styles.inputMedium}
                          placeholder="30000"
                        />
                      </>
                    )}
                    {index > 0 && (
                      <button type="button" className={styles.removeLineButton} onClick={() => removeMonthEntry(index)}>
                        削除
                      </button>
                    )}
                  </div>
                </div>
              ))}

              <button type="button" className={styles.addMonthLink} onClick={addMonthEntry}>
                +月別の{category === "2" ? "工数" : "金額"}を追加
              </button>

              {errorMsg && <p className={styles.errorText}>{errorMsg}</p>}

              <div className={styles.submitRow}>
                <button type="button" onClick={save} className={styles.submitButton} disabled={saving}>
                  {saving ? "登録中..." : "登録する"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
