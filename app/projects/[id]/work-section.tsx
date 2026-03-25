"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/app/utils/supabase/client";
import styles from "./work-section.module.css";

type WorkMonthlyRow = {
  project_id: string;
  user_id: string;
  ym: string;
  total_hours: number | string | null;
};

type ProfileLite = {
  id: string;
  display_name: string | null;
  email: string | null;
};

type PartnerRow = {
  id: string;
  name: string;
  is_key: boolean;
  created_at: string;
};

type ActualCostRow = {
  id: string;
  project_id: string;
  category: "OUTSOURCE" | "EXPENSE" | string;
  partner_id?: string | null;
  name: string | null;
  ym: string;
  amount: number | string | null;
  created_at?: string | null;
};

const COST_PER_PERSON_DAY = 35000;
const HOURS_PER_PERSON_DAY = 8;

function fmtYen(v: number | null) {
  if (v == null) return "";
  return `¥${Math.round(v).toLocaleString("ja-JP")}`;
}

function toNumber(v: number | string | null | undefined) {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function fmtPersonDays(v: number) {
  const rounded = Math.round(v * 1000) / 1000;
  const s = String(rounded);
  return s.includes(".") ? s.replace(/0+$/, "").replace(/\.$/, "") : s;
}

function userLabel(p: ProfileLite | undefined, fallbackId: string) {
  if (!p) return fallbackId;
  const name = (p.display_name ?? "").trim();
  const email = (p.email ?? "").trim();
  return name || email || fallbackId;
}

function monthStart(dateStr: string) {
  const [y, m] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, 1);
}
function addMonths(d: Date, months: number) {
  return new Date(d.getFullYear(), d.getMonth() + months, 1);
}
function toYMKey(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}
function toYMLabel(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}/${m}`;
}
function monthsBetweenInclusive(startDate: string, endDate: string) {
  const start = monthStart(startDate);
  const end = monthStart(endDate);
  const out: Date[] = [];
  for (let cur = start; cur.getTime() <= end.getTime(); cur = addMonths(cur, 1)) out.push(cur);
  return out;
}

function categoryLabel(cat: string) {
  if (cat === "OUTSOURCE") return "外注費";
  if (cat === "EXPENSE") return "経費";
  return cat;
}

export default function WorkSection(props: {
  projectId: string;
  startDate: string | null;
  endDate: string | null;
  workMonthly: WorkMonthlyRow[];
  users: ProfileLite[];
  initialActualCosts: ActualCostRow[];
}) {
  const supabase = createClient();
  const { projectId, startDate, endDate, workMonthly, users, initialActualCosts } = props;

  const [actualCosts, setActualCosts] = useState<ActualCostRow[]>(initialActualCosts ?? []);
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);
  const [partners, setPartners] = useState<PartnerRow[]>([]);

  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  const [formCategory, setFormCategory] = useState<"OUTSOURCE" | "EXPENSE">("OUTSOURCE");
  const [formPartnerId, setFormPartnerId] = useState<string>("");
  const [formName, setFormName] = useState("");
  const [formYm, setFormYm] = useState("");
  const [formAmount, setFormAmount] = useState("");

  useEffect(() => {
    const loadPartners = async () => {
      try {
        const { data, error } = await supabase.from("partners").select("id,name,is_key,created_at").order("name", { ascending: true });
        if (error) throw new Error(error.message);
        setPartners((data ?? []) as PartnerRow[]);
      } catch (e: any) {
        console.error(e?.message ?? e);
      }
    };
    loadPartners();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const months = useMemo(() => {
    if (!startDate || !endDate) return [];
    return monthsBetweenInclusive(startDate, endDate);
  }, [startDate, endDate]);

  const monthKeys = useMemo(() => months.map((m) => toYMKey(m)), [months]);
  const monthLabels = useMemo(() => months.map((m) => toYMLabel(m)), [months]);

  const userMap = useMemo(() => {
    const m = new Map<string, ProfileLite>();
    for (const u of users) m.set(u.id, u);
    return m;
  }, [users]);

  const laborRows = useMemo(() => {
    type Row = { user_id: string; byYM: Map<string, number> };
    const rowsMap = new Map<string, Row>();

    for (const w of workMonthly) {
      const hours = toNumber(w.total_hours) ?? 0;
      if (!rowsMap.has(w.user_id)) rowsMap.set(w.user_id, { user_id: w.user_id, byYM: new Map() });
      const row = rowsMap.get(w.user_id)!;
      row.byYM.set(w.ym, (row.byYM.get(w.ym) ?? 0) + hours);
    }

    const rows = Array.from(rowsMap.values()).sort((a, b) => {
      const na = userLabel(userMap.get(a.user_id), a.user_id);
      const nb = userLabel(userMap.get(b.user_id), b.user_id);
      return na.localeCompare(nb, "ja");
    });

    return rows;
  }, [workMonthly, userMap]);

  const laborCellText = (hours: number) => {
    if (!hours) return "";
    const personDays = hours / HOURS_PER_PERSON_DAY;
    const yen = personDays * COST_PER_PERSON_DAY;
    return `${fmtPersonDays(personDays)}（${fmtYen(yen)}）`;
  };

  const laborRowTotalYen = (r: { byYM: Map<string, number> }) => {
    let totalHours = 0;
    for (const ym of monthKeys) totalHours += r.byYM.get(ym) ?? 0;
    return (totalHours / HOURS_PER_PERSON_DAY) * COST_PER_PERSON_DAY;
  };

  const laborColTotalYen = (ym: string) => {
    let totalHours = 0;
    for (const r of laborRows) totalHours += r.byYM.get(ym) ?? 0;
    return (totalHours / HOURS_PER_PERSON_DAY) * COST_PER_PERSON_DAY;
  };

  const laborGrandTotalYen = () => {
    let totalHours = 0;
    for (const r of laborRows) for (const ym of monthKeys) totalHours += r.byYM.get(ym) ?? 0;
    return (totalHours / HOURS_PER_PERSON_DAY) * COST_PER_PERSON_DAY;
  };

  const actualRowTotal = (r: ActualCostRow) => {
    return toNumber(r.amount) ?? 0;
  };

  const actualColTotal = (ym: string) => {
    let sum = 0;
    for (const r of actualCosts) {
      if (r.ym === ym) sum += toNumber(r.amount) ?? 0;
    }
    return sum;
  };

  const actualGrandTotal = () => {
    return actualCosts.reduce((acc, r) => acc + (toNumber(r.amount) ?? 0), 0);
  };

  const allGrandTotal = () => {
    return laborGrandTotalYen() + actualGrandTotal();
  };

  const openAdd = () => {
    setMsg("");
    setEditId(null);
    setFormCategory("OUTSOURCE");
    setFormPartnerId(partners[0]?.id ?? "");
    setFormName("");
    setFormYm(monthKeys[0] ?? "");
    setFormAmount("");
    setOpen(true);
  };

  const openEdit = (id: string) => {
    setMsg("");
    const row = actualCosts.find((x) => x.id === id);
    if (!row) return;
    setEditId(id);
    setFormCategory((row.category as any) === "EXPENSE" ? "EXPENSE" : "OUTSOURCE");
    setFormPartnerId(row.partner_id ?? "");
    setFormName((row.name ?? "").toString());
    setFormYm(row.ym ?? "");
    setFormAmount(row.amount == null ? "" : String(row.amount));
    setOpen(true);
  };

  const close = () => {
    setOpen(false);
    setEditId(null);
  };

  const validate = () => {
    if (!formYm || !/^\d{4}-\d{2}$/.test(formYm)) return "年月(YYYY-MM)を選択してください。";

    if (formCategory === "OUTSOURCE") {
      if (!formPartnerId) return "パートナーを選択してください。";
    } else {
      if (!formName.trim()) return "費目を入力してください。";
    }

    const amt = toNumber(formAmount.replace(/,/g, ""));
    if (amt == null || amt < 0) return "金額は0以上の数値で入力してください。";
    return null;
  };

  const save = async () => {
    setMsg("");
    const err = validate();
    if (err) return setMsg(err);

    setSaving(true);
    try {
      const amountNum = Number(formAmount.replace(/,/g, ""));
      const partnerName =
        formCategory === "OUTSOURCE"
          ? (partners.find((p) => p.id === formPartnerId)?.name ?? "")
          : "";

      if (formCategory === "OUTSOURCE" && !partnerName) {
        throw new Error("選択したパートナーが見つかりません。画面を更新してやり直してください。");
      }

      if (editId) {
        const payload =
          formCategory === "OUTSOURCE"
            ? {
                category: formCategory,
                partner_id: formPartnerId,
                name: partnerName,
                ym: formYm,
                amount: amountNum,
              }
            : {
                category: formCategory,
                partner_id: null,
                name: formName.trim(),
                ym: formYm,
                amount: amountNum,
              };

        const { error } = await supabase.from("project_actual_costs").update(payload).eq("id", editId);
        if (error) throw new Error(error.message);

        setActualCosts((prev) =>
          prev.map((r) =>
            r.id === editId
              ? {
                  ...r,
                  category: formCategory,
                  partner_id: formCategory === "OUTSOURCE" ? formPartnerId : null,
                  name: formCategory === "OUTSOURCE" ? partnerName : formName.trim(),
                  ym: formYm,
                  amount: amountNum,
                }
              : r
          )
        );
      } else {
        const payload =
          formCategory === "OUTSOURCE"
            ? {
                project_id: projectId,
                category: formCategory,
                partner_id: formPartnerId,
                name: partnerName,
                ym: formYm,
                amount: amountNum,
              }
            : {
                project_id: projectId,
                category: formCategory,
                partner_id: null,
                name: formName.trim(),
                ym: formYm,
                amount: amountNum,
              };

        const { data, error } = await supabase
          .from("project_actual_costs")
          .insert(payload)
          .select("id,project_id,category,partner_id,name,ym,amount,created_at")
          .single();

        if (error) throw new Error(error.message);

        setActualCosts((prev) => [...prev, data as any]);
      }

      close();
    } catch (e: any) {
      setMsg(e?.message ?? String(e));
    } finally {
      setSaving(false);
    }
  };

  const del = async (id: string) => {
    if (!confirm("この行を削除しますか？")) return;
    setMsg("");
    setSaving(true);
    try {
      const { error } = await supabase.from("project_actual_costs").delete().eq("id", id);
      if (error) throw new Error(error.message);
      setActualCosts((prev) => prev.filter((x) => x.id !== id));
    } catch (e: any) {
      setMsg(e?.message ?? String(e));
    } finally {
      setSaving(false);
    }
  };

  if (!startDate || !endDate) {
    return (
      <section className={styles.section}>
        <h2 className={styles.title}>実工数</h2>
        <p className={styles.errorText}>開始日と終了日が未設定のため、実工数を月別に表示できません。</p>
      </section>
    );
  }

  return (
    <section className={styles.section}>
      <div className={styles.headerRow}>
        <h2 className={styles.title}>実工数</h2>

        <button type="button" onClick={openAdd} disabled={saving} className={styles.btnRedOutline}>
          外注費/経費を追加する
        </button>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.thLeft}> </th>
              <th className={styles.thLeft}> </th>
              <th className={styles.thLeft}> </th>

              {monthLabels.map((lab, i) => (
                <th key={monthKeys[i]} className={styles.thMonth}>
                  {lab}
                </th>
              ))}
              <th className={styles.thMonth}>合計</th>
              <th className={styles.thActions}> </th>
            </tr>
          </thead>

          <tbody>
            {laborRows.length === 0 ? (
              <tr>
                <td className={styles.tdEmpty} colSpan={3 + monthKeys.length + 2}>
                  まだ業務報告がありません。
                </td>
              </tr>
            ) : (
              laborRows.map((r, idx) => {
                const name = userLabel(userMap.get(r.user_id), r.user_id);
                return (
                  <tr key={`labor-${r.user_id}`}>
                    <td className={styles.tdLabel}>{idx === 0 ? "工数" : ""}</td>
                    <td className={styles.tdRole}></td>
                    <td className={styles.tdName}>{name}</td>

                    {monthKeys.map((ym) => (
                      <td key={ym} className={styles.tdCell}>
                        {laborCellText(r.byYM.get(ym) ?? 0)}
                      </td>
                    ))}

                    <td className={styles.tdSum}>{fmtYen(laborRowTotalYen(r))}</td>
                    <td className={styles.tdActions}></td>
                  </tr>
                );
              })
            )}

            {actualCosts.map((r) => {
              const label =
                r.category === "OUTSOURCE"
                  ? partners.find((p) => p.id === (r.partner_id ?? ""))?.name ?? (r.name ?? "")
                  : (r.name ?? "");

              return (
                <tr key={`ac-${r.id}`}>
                  <td className={styles.tdLabel}>{categoryLabel(r.category)}</td>
                  <td className={styles.tdRole}>{categoryLabel(r.category)}</td>
                  <td className={styles.tdName}>{label}</td>

                  {monthKeys.map((ym) => (
                    <td key={ym} className={styles.tdCell}>
                      {r.ym === ym ? fmtYen(toNumber(r.amount) ?? 0) : ""}
                    </td>
                  ))}

                  <td className={styles.tdSum}>{fmtYen(actualRowTotal(r))}</td>

                  <td className={styles.tdActions}>
                    <div className={styles.actionButtons}>
                      <button type="button" onClick={() => openEdit(r.id)} className={styles.btnSmall} disabled={saving}>
                        編集
                      </button>
                      <button type="button" onClick={() => del(r.id)} className={styles.btnSmall} disabled={saving}>
                        削除
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}

            {(laborRows.length > 0 || actualCosts.length > 0) && (
              <tr>
                <td className={styles.tdTotalLabel}>合計</td>
                <td className={styles.tdTotalLabel}></td>
                <td className={styles.tdTotalLabel}></td>

                {monthKeys.map((ym) => (
                  <td key={ym} className={styles.tdTotal}>
                    {fmtYen(laborColTotalYen(ym) + actualColTotal(ym))}
                  </td>
                ))}

                <td className={styles.tdTotal}>{fmtYen(allGrandTotal())}</td>
                <td className={styles.tdTotalActions}></td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className={styles.note}>
        ※ 工数換算：{HOURS_PER_PERSON_DAY}時間 = 1人日、1人日 = {fmtYen(COST_PER_PERSON_DAY)}
      </div>

      {msg && <p className={styles.errorText}>{msg}</p>}

      {open && (
        <div className={styles.modalOverlay} onClick={close}>
          <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>{editId ? "外注費/経費の編集" : "外注費/経費の追加"}</h3>
              <button type="button" onClick={close} className={styles.btnX}>
                ✕
              </button>
            </div>

            <div className={styles.modalForm}>
              <div className={styles.formRow}>
                <div className={styles.formLabel}>区分</div>
                <select
                  value={formCategory}
                  onChange={(e) => {
                    const v = e.target.value as any;
                    setFormCategory(v);
                    setMsg("");
                    if (v === "OUTSOURCE") {
                      setFormPartnerId(partners[0]?.id ?? "");
                      setFormName("");
                    } else {
                      setFormPartnerId("");
                      setFormName("");
                    }
                  }}
                  className={styles.select}
                >
                  <option value="OUTSOURCE">外注費</option>
                  <option value="EXPENSE">経費</option>
                </select>
              </div>

              {formCategory === "OUTSOURCE" ? (
                <div className={styles.formRow}>
                  <div className={styles.formLabel}>パートナー</div>
                  <select value={formPartnerId} onChange={(e) => setFormPartnerId(e.target.value)} className={styles.select}>
                    <option value="">選択してください</option>
                    {partners.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                        {p.is_key ? "（重点）" : ""}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className={styles.formRow}>
                  <div className={styles.formLabel}>費目</div>
                  <input value={formName} onChange={(e) => setFormName(e.target.value)} className={styles.input} />
                </div>
              )}

              <div className={styles.formRow}>
                <div className={styles.formLabel}>年月</div>
                <select value={formYm} onChange={(e) => setFormYm(e.target.value)} className={styles.select}>
                  <option value="">選択してください</option>
                  {monthKeys.map((ym, i) => (
                    <option key={ym} value={ym}>
                      {monthLabels[i]}
                    </option>
                  ))}
                </select>
              </div>

              <div className={styles.formRow}>
                <div className={styles.formLabel}>金額</div>
                <input value={formAmount} onChange={(e) => setFormAmount(e.target.value)} className={styles.input} placeholder="例: 60000" />
              </div>

              <div className={styles.modalButtonRow}>
                <button type="button" onClick={save} disabled={saving} className={styles.btnRed}>
                  {saving ? "保存中..." : "登録する"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}