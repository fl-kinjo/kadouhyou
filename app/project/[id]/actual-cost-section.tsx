"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/app/utils/supabase/client";
import styles from "./actual-cost-section.module.css";

type Profile = {
  id: string;
  last_name: string | null;
  first_name: string | null;
  status: number | null;
};

type Partner = {
  id: string;
  name: string;
};

type ActualCost = {
  id: string;
  project_id: string;
  category: number;
  expense_name: string | null;
  partner_id: string | null;
  target_year_month: string;
  amount: number | string | null;
};

type ReportRow = {
  id: string;
  profile_id: string;
  project_id: string;
  work_date: string;
  hours: number | string;
};

type MonthEntry = {
  year: string;
  month: string;
  amount: string;
};

type ManualCostGroup = {
  key: string;
  category: number;
  expense_name: string | null;
  partner_id: string | null;
  rowIds: string[];
  entries: ActualCost[];
};

type LaborEntry = {
  target_year_month: string;
  person_days: number;
  amount: number;
};

type LaborGroup = {
  key: string;
  category: 2;
  profile_id: string;
  entries: LaborEntry[];
};

const CATEGORY_LABELS: Record<number, string> = {
  0: "経費",
  1: "外注費",
  2: "工数",
};

const HOURS_PER_PERSON_DAY = 8;
const COST_PER_PERSON_DAY = 35000;

function fullName(lastName?: string | null, firstName?: string | null) {
  const name = `${lastName ?? ""}${firstName ?? ""}`.trim();
  return name || "-";
}

function uniq<T>(items: T[]) {
  return Array.from(new Set(items));
}

function formatAmount(value: number | string | null) {
  if (value == null) return "";
  const numberValue = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(numberValue)) return String(value);
  return Math.round(numberValue).toLocaleString("ja-JP");
}

function formatYen(value: number) {
  return `¥${Math.round(value).toLocaleString("ja-JP")}`;
}

function formatPersonDays(value: number) {
  const rounded = Math.round(value * 100) / 100;
  return `${rounded.toLocaleString("ja-JP", { maximumFractionDigits: 2 })}人日`;
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
  return { year, month };
}

function buildMonthLabels(startDate: string | null, endDate: string | null, costMonths: string[], reportMonths: string[]) {
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

  return uniq([...costMonths, ...reportMonths]).sort();
}

function buildManualGroupKey(cost: ActualCost) {
  return [cost.category, cost.expense_name ?? "", cost.partner_id ?? ""].join("__");
}

export default function ActualCostSection({
  projectId,
  startDate,
  endDate,
  initialCosts,
  reports,
  partners,
  profiles,
}: {
  projectId: string;
  startDate: string | null;
  endDate: string | null;
  initialCosts?: ActualCost[] | null;
  reports: ReportRow[];
  partners: Partner[];
  profiles: Profile[];
}) {
  const router = useRouter();
  const supabase = createClient();

  const [costs, setCosts] = useState<ActualCost[]>(Array.isArray(initialCosts) ? initialCosts : []);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [editGroupKey, setEditGroupKey] = useState<string | null>(null);
  const [category, setCategory] = useState("1");
  const [expenseName, setExpenseName] = useState("");
  const [partnerId, setPartnerId] = useState("");
  const [monthEntries, setMonthEntries] = useState<MonthEntry[]>(() => {
    const today = new Date();
    return [
      {
        year: String(today.getFullYear()),
        month: String(today.getMonth() + 1).padStart(2, "0"),
        amount: "",
      },
    ];
  });

  const profileMap = useMemo(() => new Map(profiles.map((profile) => [profile.id, profile])), [profiles]);
  const partnerMap = useMemo(() => new Map(partners.map((partner) => [partner.id, partner.name])), [partners]);

  const reportMonths = useMemo(
    () => uniq(reports.map((report) => `${report.work_date.slice(0, 7)}-01`).filter(Boolean)).sort(),
    [reports]
  );
  const costMonths = useMemo(() => uniq(costs.map((cost) => cost.target_year_month)).sort(), [costs]);
  const monthLabels = useMemo(
    () => buildMonthLabels(startDate, endDate, costMonths, reportMonths),
    [startDate, endDate, costMonths, reportMonths]
  );

  const manualGroups = useMemo<ManualCostGroup[]>(() => {
    const map = new Map<string, ManualCostGroup>();
    for (const cost of costs) {
      const key = buildManualGroupKey(cost);
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
          rowIds: [cost.id],
          entries: [cost],
        });
      }
    }

    return Array.from(map.values()).sort((a, b) => {
      if (a.category !== b.category) return b.category - a.category;
      const aName = a.category === 1 ? partnerMap.get(a.partner_id ?? "") ?? "" : a.expense_name ?? "";
      const bName = b.category === 1 ? partnerMap.get(b.partner_id ?? "") ?? "" : b.expense_name ?? "";
      return aName.localeCompare(bName, "ja");
    });
  }, [costs, partnerMap]);

  const laborGroups = useMemo<LaborGroup[]>(() => {
    const monthMapByProfile = new Map<string, Map<string, LaborEntry>>();

    for (const report of reports) {
      if (!report.profile_id || !report.work_date) continue;
      const hours = typeof report.hours === "string" ? Number(report.hours) : report.hours;
      if (!Number.isFinite(hours)) continue;
      const month = `${report.work_date.slice(0, 7)}-01`;
      const personDays = hours / HOURS_PER_PERSON_DAY;
      const amount = personDays * COST_PER_PERSON_DAY;

      if (!monthMapByProfile.has(report.profile_id)) {
        monthMapByProfile.set(report.profile_id, new Map());
      }
      const byMonth = monthMapByProfile.get(report.profile_id)!;
      const current = byMonth.get(month);
      if (current) {
        current.person_days += personDays;
        current.amount += amount;
      } else {
        byMonth.set(month, {
          target_year_month: month,
          person_days: personDays,
          amount,
        });
      }
    }

    return Array.from(monthMapByProfile.entries())
      .map(([profileId, byMonth]) => ({
        key: `labor__${profileId}`,
        category: 2 as const,
        profile_id: profileId,
        entries: Array.from(byMonth.values()).sort((a, b) => a.target_year_month.localeCompare(b.target_year_month)),
      }))
      .sort((a, b) => fullName(profileMap.get(a.profile_id)?.last_name, profileMap.get(a.profile_id)?.first_name).localeCompare(fullName(profileMap.get(b.profile_id)?.last_name, profileMap.get(b.profile_id)?.first_name), "ja"));
  }, [reports, profileMap]);

  const allGroups = useMemo(() => {
    const labor = laborGroups.map((group) => ({ kind: "labor" as const, group }));
    const manual = manualGroups.map((group) => ({ kind: "manual" as const, group }));
    return [...labor, ...manual];
  }, [laborGroups, manualGroups]);

  const monthTotals = useMemo(() => {
    const map = new Map<string, number>();
    for (const cost of costs) {
      const amount = Number(cost.amount ?? 0);
      if (Number.isFinite(amount)) {
        map.set(cost.target_year_month, (map.get(cost.target_year_month) ?? 0) + amount);
      }
    }
    for (const group of laborGroups) {
      for (const entry of group.entries) {
        map.set(entry.target_year_month, (map.get(entry.target_year_month) ?? 0) + entry.amount);
      }
    }
    return map;
  }, [costs, laborGroups]);

  const grandTotal = useMemo(() => Array.from(monthTotals.values()).reduce((sum, value) => sum + value, 0), [monthTotals]);

  const resetForm = () => {
    setErrorMsg("");
    setCategory("1");
    setExpenseName("");
    setPartnerId("");
    const baseMonth = monthLabels[0] ?? `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-01`;
    const ym = splitYearMonth(baseMonth);
    setMonthEntries([
      {
        year: ym.year,
        month: ym.month,
        amount: "",
      },
    ]);
  };

  const openCreate = () => {
    resetForm();
    setEditGroupKey(null);
    setOpen(true);
  };

  const openEdit = (group: ManualCostGroup) => {
    setErrorMsg("");
    setEditGroupKey(group.key);
    setCategory(String(group.category));
    setExpenseName(group.expense_name ?? "");
    setPartnerId(group.partner_id ?? "");
    setMonthEntries(
      group.entries
        .slice()
        .sort((a, b) => a.target_year_month.localeCompare(b.target_year_month))
        .map((entry) => {
          const ym = splitYearMonth(entry.target_year_month);
          return {
            year: ym.year,
            month: ym.month,
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
    if (!authUserId) throw new Error("ログインユーザーを取得できません。");

    const { data: profile, error: profileError } = await supabase.from("profiles_2").select("id").eq("id", authUserId).maybeSingle();
    if (profileError) throw new Error(profileError.message);
    if (!profile?.id) throw new Error("更新者プロフィールが見つかりません。");
    return profile.id;
  };

  const save = async () => {
    setErrorMsg("");
    const categoryNumber = Number(category);
    if (categoryNumber === 1 && !partnerId) return setErrorMsg("パートナーを選択してください。");
    if (categoryNumber === 0 && !expenseName.trim()) return setErrorMsg("費目を入力してください。");

    for (const entry of monthEntries) {
      if (!entry.year || !entry.month) return setErrorMsg("年月を入力してください。");
      if (Number(entry.month) < 1 || Number(entry.month) > 12) return setErrorMsg("月は1〜12で入力してください。");
      const amount = Number(entry.amount);
      if (!Number.isFinite(amount) || amount < 0) return setErrorMsg("金額は0以上の数値で入力してください。");
    }

    setSaving(true);
    try {
      const updaterId = await getUpdaterId();
      const payload = monthEntries.map((entry) => ({
        project_id: projectId,
        category: categoryNumber,
        expense_name: categoryNumber === 0 ? expenseName.trim() : null,
        partner_id: categoryNumber === 1 ? partnerId : null,
        target_year_month: monthStartFromParts(entry.year, entry.month),
        amount: Number(entry.amount),
        updated_by: updaterId,
      }));

      if (editGroupKey) {
        const targetGroup = manualGroups.find((group) => group.key === editGroupKey);
        if (targetGroup) {
          const { error: deleteError } = await supabase.from("project_actual_cost").delete().in("id", targetGroup.rowIds);
          if (deleteError) throw new Error(deleteError.message);
        }
      }

      const { data, error } = await supabase
        .from("project_actual_cost")
        .insert(payload)
        .select("id,project_id,category,expense_name,partner_id,target_year_month,amount");
      if (error) throw new Error(error.message);

      const nextInserted = (data ?? []) as ActualCost[];
      setCosts((current) => {
        const filtered = editGroupKey ? current.filter((item) => buildManualGroupKey(item) !== editGroupKey) : current;
        return [...filtered, ...nextInserted].sort((a, b) => a.target_year_month.localeCompare(b.target_year_month));
      });
      setOpen(false);
      setEditGroupKey(null);
      router.refresh();
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  const removeGroup = async (group: ManualCostGroup) => {
    if (!window.confirm("このコスト行を削除しますか？")) return;
    setErrorMsg("");
    try {
      const { error } = await supabase.from("project_actual_cost").delete().in("id", group.rowIds);
      if (error) throw new Error(error.message);
      setCosts((current) => current.filter((item) => !group.rowIds.includes(item.id)));
      router.refresh();
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <section className={styles.section}>
      <div className={styles.headerRow}>
        <h2 className={styles.title}>実工数</h2>
        <div className={styles.headerButtons}>
          <button type="button" className={styles.addButton} onClick={openCreate}>
            コスト行を追加
          </button>
        </div>
      </div>

      {errorMsg && !open && <p className={styles.errorText}>{errorMsg}</p>}

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
            {allGroups.length === 0 ? (
              <tr>
                <td className={styles.emptyCell} colSpan={monthLabels.length + 5}>
                  実工数はまだ登録されていません。
                </td>
              </tr>
            ) : (
              allGroups.map((entry) => {
                if (entry.kind === "labor") {
                  const group = entry.group;
                  const costMap = new Map(group.entries.map((item) => [item.target_year_month, item]));
                  const total = group.entries.reduce((sum, item) => sum + item.amount, 0);
                  const ownerLabel = fullName(profileMap.get(group.profile_id)?.last_name, profileMap.get(group.profile_id)?.first_name);
                  return (
                    <tr key={group.key}>
                      <td className={styles.tdType}>{CATEGORY_LABELS[2]}</td>
                      <td className={styles.tdMain}>工数</td>
                      <td className={styles.tdOwner}>{ownerLabel}</td>
                      {monthLabels.map((label) => {
                        const value = costMap.get(label);
                        return (
                          <td key={label} className={styles.tdMonth}>
                            {value ? `${formatPersonDays(value.person_days)}（${formatYen(value.amount)}）` : ""}
                          </td>
                        );
                      })}
                      <td className={styles.tdTotal}>{formatYen(total)}</td>
                      <td className={styles.tdActions}></td>
                    </tr>
                  );
                }

                const group = entry.group;
                const costMap = new Map(group.entries.map((item) => [item.target_year_month, item]));
                const total = group.entries.reduce((sum, item) => sum + Number(item.amount ?? 0), 0);
                const typeLabel = CATEGORY_LABELS[group.category] ?? "-";
                const itemLabel = group.category === 1 ? "外注" : group.expense_name ?? "-";
                const ownerLabel = group.category === 1 ? partnerMap.get(group.partner_id ?? "") ?? "-" : "-";
                return (
                  <tr key={group.key}>
                    <td className={styles.tdType}>{typeLabel}</td>
                    <td className={styles.tdMain}>{itemLabel}</td>
                    <td className={styles.tdOwner}>{ownerLabel}</td>
                    {monthLabels.map((label) => (
                      <td key={label} className={styles.tdMonth}>
                        {costMap.has(label) ? formatYen(Number(costMap.get(label)?.amount ?? 0)) : ""}
                      </td>
                    ))}
                    <td className={styles.tdTotal}>{formatYen(total)}</td>
                    <td className={styles.tdActions}>
                      <button type="button" className={styles.smallButton} onClick={() => openEdit(group)}>
                        編集
                      </button>
                      <button type="button" className={styles.smallButton} onClick={() => removeGroup(group)}>
                        削除
                      </button>
                    </td>
                  </tr>
                );
              })
            )}

            {allGroups.length > 0 && (
              <tr className={styles.totalRow}>
                <td className={styles.totalLabel} colSpan={3}>合計</td>
                {monthLabels.map((label) => (
                  <td key={label} className={styles.totalValue}>{formatAmount(monthTotals.get(label) ?? 0)}</td>
                ))}
                <td className={styles.totalValueStrong}>{formatYen(grandTotal)}</td>
                <td className={styles.totalBlank}></td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {open && (
        <div className={styles.modalOverlay} onClick={closeModal}>
          <div className={styles.modalCard} onClick={(event) => event.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>実経費/外注費の登録</h3>
              <button type="button" className={styles.closeButton} onClick={closeModal} aria-label="close">✕</button>
            </div>

            <div className={styles.modalBody}>
              <div className={styles.formRow}>
                <label className={styles.formLabel}>区分</label>
                <select value={category} onChange={(e) => setCategory(e.target.value)} className={styles.select}>
                  <option value="1">外注費</option>
                  <option value="0">経費</option>
                </select>
              </div>

              {category === "1" ? (
                <div className={styles.formRow}>
                  <label className={styles.formLabel}>パートナー</label>
                  <select value={partnerId} onChange={(e) => setPartnerId(e.target.value)} className={styles.select}>
                    <option value="">選択してください</option>
                    {partners.map((partner) => (
                      <option key={partner.id} value={partner.id}>{partner.name}</option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className={styles.formRow}>
                  <label className={styles.formLabel}>費目</label>
                  <input value={expenseName} onChange={(e) => setExpenseName(e.target.value)} className={styles.input} placeholder="例: 交通費" />
                </div>
              )}

              <div className={styles.monthBlock}>
                <div className={styles.monthBlockHeader}>月別コスト</div>
                {monthEntries.map((entry, index) => (
                  <div key={`month-${index}`} className={styles.entryRow}>
                    <select value={entry.year} onChange={(e) => setMonthEntryAt(index, "year", e.target.value)} className={styles.inputSmall}>
                      {Array.from({ length: 6 }).map((_, offset) => {
                        const year = String(new Date().getFullYear() - 1 + offset);
                        return <option key={year} value={year}>{year}</option>;
                      })}
                    </select>
                    <span>年</span>
                    <select value={entry.month} onChange={(e) => setMonthEntryAt(index, "month", e.target.value)} className={styles.inputSmall}>
                      {Array.from({ length: 12 }).map((_, m) => {
                        const month = String(m + 1).padStart(2, "0");
                        return <option key={month} value={month}>{month}</option>;
                      })}
                    </select>
                    <span>月</span>
                    <input value={entry.amount} onChange={(e) => setMonthEntryAt(index, "amount", e.target.value)} className={styles.inputMedium} inputMode="numeric" placeholder="金額" />
                    <span>円</span>
                    {index > 0 && (
                      <button type="button" className={styles.removeLineButton} onClick={() => removeMonthEntry(index)}>削除</button>
                    )}
                  </div>
                ))}
                <button type="button" className={styles.addMonthLink} onClick={addMonthEntry}>＋ 月を追加</button>
              </div>

              <div className={styles.submitRow}>
                <button type="button" className={styles.submitButton} onClick={save} disabled={saving}>
                  {saving ? "保存中..." : editGroupKey ? "更新する" : "登録する"}
                </button>
              </div>

              {errorMsg && <p className={styles.errorText}>{errorMsg}</p>}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
