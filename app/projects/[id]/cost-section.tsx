"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/app/utils/supabase/client";
import styles from "./cost-section.module.css";

const COST_PER_PERSON_DAY = 35000;

function monthStart(dateStr: string) {
  const [y, m] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, 1);
}
function addMonths(d: Date, months: number) {
  return new Date(d.getFullYear(), d.getMonth() + months, 1);
}
function toYMValue(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}
function toYMLabel(ym: string) {
  return ym.replace("-", "/");
}
function monthsBetweenInclusive(startDate: string, endDate: string) {
  const start = monthStart(startDate);
  const end = monthStart(endDate);
  const out: string[] = [];
  for (let cur = start; cur.getTime() <= end.getTime(); cur = addMonths(cur, 1)) {
    out.push(toYMValue(cur));
  }
  return out;
}
function yen(n: number) {
  return `¥${Math.round(n).toLocaleString("ja-JP")}`;
}

type Category = "" | "工数" | "外注費" | "経費";

export type CostRow = {
  id: string;
  category: "工数" | "外注費" | "経費";
  role: string | null;
  name: string | null;
  ym: string;
  person_days: number | null;
  amount: number | null;
};

type MonthWork = { id: string; ym: string; personDays: string };
type MonthMoney = { id: string; ym: string; amount: string };

type CostGroup = {
  key: string;
  category: "工数" | "外注費" | "経費";
  role: string;
  name: string;
  rows: CostRow[];
  byMonth: Map<string, CostRow[]>;
};

export default function CostSection(props: {
  projectId: string;
  startDate: string | null;
  endDate: string | null;
  initialCosts: CostRow[];
}) {
  const router = useRouter();
  const supabase = createClient();

  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState("");

  const [mode, setMode] = useState<"create" | "edit">("create");
  const [editingGroupKey, setEditingGroupKey] = useState<string | null>(null);

  const monthOptions = useMemo(() => {
    if (!props.startDate || !props.endDate) return [];
    if (props.startDate > props.endDate) return [];
    return monthsBetweenInclusive(props.startDate, props.endDate);
  }, [props.startDate, props.endDate]);

  const groups: CostGroup[] = useMemo(() => {
    const map = new Map<string, CostGroup>();

    for (const c of props.initialCosts) {
      const role = (c.role ?? "").trim();
      const name = (c.name ?? "").trim();
      const key = `${c.category}|||${role}|||${name}`;

      if (!map.has(key)) {
        map.set(key, {
          key,
          category: c.category,
          role,
          name,
          rows: [],
          byMonth: new Map(),
        });
      }
      const g = map.get(key)!;
      g.rows.push(c);

      if (!g.byMonth.has(c.ym)) g.byMonth.set(c.ym, []);
      g.byMonth.get(c.ym)!.push(c);
    }

    const arr = Array.from(map.values());
    const orderCat = (cat: string) => (cat === "工数" ? 0 : cat === "外注費" ? 1 : 2);
    arr.sort((a, b) => {
      const c = orderCat(a.category) - orderCat(b.category);
      if (c !== 0) return c;
      const r = a.role.localeCompare(b.role, "ja");
      if (r !== 0) return r;
      return a.name.localeCompare(b.name, "ja");
    });

    return arr;
  }, [props.initialCosts]);

  const cellText = (rows: CostRow[]) => {
    if (rows.length === 0) return "";
    const category = rows[0].category;
    if (category === "工数") {
      const pd = rows.reduce((a, r) => a + (r.person_days ?? 0), 0);
      if (pd === 0) return "";
      return `${pd}（${yen(pd * COST_PER_PERSON_DAY)}）`;
    } else {
      const amount = rows.reduce((a, r) => a + (r.amount ?? 0), 0);
      if (amount === 0) return "";
      return yen(amount);
    }
  };

  const cellAmountNumber = (rows: CostRow[]) => {
    if (rows.length === 0) return 0;
    const category = rows[0].category;
    if (category === "工数") {
      const pd = rows.reduce((a, r) => a + (r.person_days ?? 0), 0);
      return pd * COST_PER_PERSON_DAY;
    }
    return rows.reduce((a, r) => a + (r.amount ?? 0), 0);
  };

  const monthTotals = useMemo(() => {
    const totals = new Map<string, number>();
    for (const ym of monthOptions) totals.set(ym, 0);

    for (const g of groups) {
      for (const ym of monthOptions) {
        const rows = g.byMonth.get(ym) ?? [];
        totals.set(ym, (totals.get(ym) ?? 0) + cellAmountNumber(rows));
      }
    }
    const grand = Array.from(totals.values()).reduce((a, b) => a + b, 0);
    return { totals, grand };
  }, [groups, monthOptions]);

  const [category, setCategory] = useState<Category>("");
  const [role, setRole] = useState("");
  const [memberName, setMemberName] = useState("");
  const [works, setWorks] = useState<MonthWork[]>([{ id: crypto.randomUUID(), ym: "", personDays: "" }]);
  const [partnerName, setPartnerName] = useState("");
  const [outsources, setOutsources] = useState<MonthMoney[]>([{ id: crypto.randomUUID(), ym: "", amount: "" }]);
  const [expenseItem, setExpenseItem] = useState("");
  const [expenseName, setExpenseName] = useState("");
  const [expenses, setExpenses] = useState<MonthMoney[]>([{ id: crypto.randomUUID(), ym: "", amount: "" }]);

  const resetForm = () => {
    setCategory("");
    setRole("");
    setMemberName("");
    setPartnerName("");
    setExpenseItem("");
    setExpenseName("");
    setWorks([{ id: crypto.randomUUID(), ym: "", personDays: "" }]);
    setOutsources([{ id: crypto.randomUUID(), ym: "", amount: "" }]);
    setExpenses([{ id: crypto.randomUUID(), ym: "", amount: "" }]);
    setMsg("");
  };

  const close = () => {
    setOpen(false);
    setMsg("");
    setMode("create");
    setEditingGroupKey(null);
  };

  const updateWork = (id: string, patch: Partial<MonthWork>) =>
    setWorks((p) => p.map((w) => (w.id === id ? { ...w, ...patch } : w)));
  const addWorkRow = () => setWorks((p) => [...p, { id: crypto.randomUUID(), ym: "", personDays: "" }]);
  const removeWorkRow = (id: string) => setWorks((p) => (p.length <= 1 ? p : p.filter((x) => x.id !== id)));

  const updateMoneyRow = (kind: "outsources" | "expenses", id: string, patch: Partial<MonthMoney>) => {
    if (kind === "outsources") setOutsources((p) => p.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    else setExpenses((p) => p.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };
  const addMoneyRow = (kind: "outsources" | "expenses") => {
    if (kind === "outsources") setOutsources((p) => [...p, { id: crypto.randomUUID(), ym: "", amount: "" }]);
    else setExpenses((p) => [...p, { id: crypto.randomUUID(), ym: "", amount: "" }]);
  };
  const removeMoneyRow = (kind: "outsources" | "expenses", id: string) => {
    if (kind === "outsources") setOutsources((p) => (p.length <= 1 ? p : p.filter((x) => x.id !== id)));
    else setExpenses((p) => (p.length <= 1 ? p : p.filter((x) => x.id !== id)));
  };

  const validateCommon = () => {
    if (!props.startDate || !props.endDate) return "開始日/終了日が未設定のため、年月を選べません。";
    if (monthOptions.length === 0) return "開始日/終了日の範囲が不正です。";
    if (!category) return "区分を選択してください。";
    return null;
  };
  const validateMonthsUnique = (months: string[]) => {
    const dup = months.find((m, idx) => months.indexOf(m) !== idx);
    if (dup) return `同じ月（${toYMLabel(dup)}）が重複しています。`;
    return null;
  };

  const validate = () => {
    const c = validateCommon();
    if (c) return c;

    if (category === "工数") {
      if (!role.trim()) return "役割を入力してください。";
      if (!memberName.trim()) return "メンバー名を入力してください。";
      for (const w of works) {
        if (!w.ym) return "年月を選択してください。";
        if (!w.personDays.trim()) return "人日を入力してください。";
        const d = Number(w.personDays);
        if (Number.isNaN(d) || d < 0) return "人日は 0以上の数値で入力してください。";
      }
      return validateMonthsUnique(works.map((w) => w.ym));
    }

    if (category === "外注費") {
      if (!partnerName.trim()) return "パートナーを入力してください。";
      for (const r of outsources) {
        if (!r.ym) return "年月を選択してください。";
        if (!r.amount.trim()) return "金額を入力してください。";
        const a = Number(r.amount.replace(/,/g, ""));
        if (Number.isNaN(a) || a < 0) return "金額は 0以上の数値で入力してください。";
      }
      return validateMonthsUnique(outsources.map((r) => r.ym));
    }

    if (category === "経費") {
      if (!expenseItem.trim()) return "費目を入力してください。";
      if (!expenseName.trim()) return "費用名を入力してください。";
      for (const r of expenses) {
        if (!r.ym) return "年月を選択してください。";
        if (!r.amount.trim()) return "金額を入力してください。";
        const a = Number(r.amount.replace(/,/g, ""));
        if (Number.isNaN(a) || a < 0) return "金額は 0以上の数値で入力してください。";
      }
      return validateMonthsUnique(expenses.map((r) => r.ym));
    }

    return null;
  };

  const canSubmit = useMemo(() => validate() === null, [
    category,
    role,
    memberName,
    works,
    partnerName,
    outsources,
    expenseItem,
    expenseName,
    expenses,
    monthOptions,
    props.startDate,
    props.endDate,
  ]);

  const openCreate = () => {
    resetForm();
    setMode("create");
    setEditingGroupKey(null);
    setOpen(true);
  };

  const openEdit = (g: CostGroup) => {
    resetForm();
    setMode("edit");
    setEditingGroupKey(g.key);

    setCategory(g.category);

    if (g.category === "工数") {
      setRole(g.role);
      setMemberName(g.name);

      const sorted = [...g.rows].sort((a, b) => a.ym.localeCompare(b.ym));
      const w: MonthWork[] = sorted.map((r) => ({
        id: crypto.randomUUID(),
        ym: r.ym,
        personDays: String(r.person_days ?? 0),
      }));
      setWorks(w.length ? w : [{ id: crypto.randomUUID(), ym: "", personDays: "" }]);
    }

    if (g.category === "外注費") {
      setPartnerName(g.name);

      const sorted = [...g.rows].sort((a, b) => a.ym.localeCompare(b.ym));
      const m: MonthMoney[] = sorted.map((r) => ({
        id: crypto.randomUUID(),
        ym: r.ym,
        amount: String(r.amount ?? 0),
      }));
      setOutsources(m.length ? m : [{ id: crypto.randomUUID(), ym: "", amount: "" }]);
    }

    if (g.category === "経費") {
      setExpenseItem(g.role);
      setExpenseName(g.name);

      const sorted = [...g.rows].sort((a, b) => a.ym.localeCompare(b.ym));
      const m: MonthMoney[] = sorted.map((r) => ({
        id: crypto.randomUUID(),
        ym: r.ym,
        amount: String(r.amount ?? 0),
      }));
      setExpenses(m.length ? m : [{ id: crypto.randomUUID(), ym: "", amount: "" }]);
    }

    setOpen(true);
  };

  const deleteGroup = async (g: CostGroup) => {
    const ok = window.confirm(`この行を削除しますか？\n${g.category} / ${g.role} / ${g.name}`);
    if (!ok) return;

    const ids = g.rows.map((r) => r.id);
    const { error } = await supabase.from("project_costs").delete().in("id", ids);

    if (error) {
      alert(error.message);
      return;
    }

    router.refresh();
  };

  const submit = async () => {
    setMsg("");
    const err = validate();
    if (err) return setMsg(err);

    if (mode === "edit" && editingGroupKey) {
      const g = groups.find((x) => x.key === editingGroupKey);
      if (!g) return setMsg("編集中の行が見つかりません。画面を更新してやり直してください。");

      const ids = g.rows.map((r) => r.id);
      const { error: delErr } = await supabase.from("project_costs").delete().in("id", ids);
      if (delErr) return setMsg(delErr.message);
    }

    const payload: any[] = [];

    if (category === "工数") {
      for (const w of works) {
        payload.push({
          project_id: props.projectId,
          category: "工数",
          role: role.trim(),
          name: memberName.trim(),
          ym: w.ym,
          person_days: Number(w.personDays),
          amount: null,
        });
      }
    }

    if (category === "外注費") {
      for (const r of outsources) {
        payload.push({
          project_id: props.projectId,
          category: "外注費",
          role: "外注",
          name: partnerName.trim(),
          ym: r.ym,
          person_days: null,
          amount: Number(r.amount.replace(/,/g, "")),
        });
      }
    }

    if (category === "経費") {
      for (const r of expenses) {
        payload.push({
          project_id: props.projectId,
          category: "経費",
          role: expenseItem.trim(),
          name: expenseName.trim(),
          ym: r.ym,
          person_days: null,
          amount: Number(r.amount.replace(/,/g, "")),
        });
      }
    }

    const { error } = await supabase.from("project_costs").insert(payload);
    if (error) return setMsg(error.message);

    close();
    router.refresh();
  };

  return (
    <section className={styles.section}>
      <div className={styles.headerRow}>
        <h2 className={styles.title}>予定コスト</h2>

        <div className={styles.headerActions}>
          <button onClick={openCreate} className={styles.btnAdd}>
            コスト行を追加
          </button>
        </div>
      </div>

      <div className={styles.tableOuter}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.thLeft}>区分</th>
              <th className={styles.thLeft}>役割</th>
              <th className={styles.thLeft}>名前</th>

              {monthOptions.map((ym) => (
                <th key={ym} className={styles.thMonth}>
                  {toYMLabel(ym)}
                </th>
              ))}
              <th className={styles.thMonth}>合計</th>
              <th className={styles.thStickyRight}>操作</th>
            </tr>
          </thead>

          <tbody>
            {groups.map((g) => {
              let rowSum = 0;

              return (
                <tr key={g.key}>
                  <td className={styles.tdLeft}>{g.category}</td>
                  <td className={styles.tdLeft}>{g.role}</td>
                  <td className={styles.tdLeft}>{g.name}</td>

                  {monthOptions.map((ym) => {
                    const rows = g.byMonth.get(ym) ?? [];
                    const amt = cellAmountNumber(rows);
                    rowSum += amt;

                    return (
                      <td key={ym} className={styles.tdCenter}>
                        {cellText(rows)}
                      </td>
                    );
                  })}

                  <td className={styles.tdCenterStrong}>{yen(rowSum)}</td>

                  <td className={styles.tdStickyRight}>
                    <button type="button" onClick={() => openEdit(g)} className={styles.btnOp}>
                      編集
                    </button>
                    <button type="button" onClick={() => deleteGroup(g)} className={styles.btnOp}>
                      削除
                    </button>
                  </td>
                </tr>
              );
            })}

            <tr>
              <td className={styles.tdLeftStrong}>合計</td>
              <td className={styles.tdLeftStrong}></td>
              <td className={styles.tdLeftStrong}></td>

              {monthOptions.map((ym) => (
                <td key={ym} className={styles.tdCenterStrong}>
                  {yen(monthTotals.totals.get(ym) ?? 0)}
                </td>
              ))}
              <td className={styles.tdCenterStrong}>{yen(monthTotals.grand)}</td>
              <td className={styles.tdStickyRight}></td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className={styles.note}>
        工数は {yen(COST_PER_PERSON_DAY)} / 人日で計算して表示します。
      </div>

      {open && (
        <Modal onClose={close}>
          <div className={styles.modalInner}>
            <button onClick={close} aria-label="close" className={styles.btnClose}>
              ×
            </button>

            <h3 className={styles.modalTitle}>
              {mode === "edit" ? "予定工数/経費の編集" : "予定工数/経費の登録"}
            </h3>

            <div className={styles.modalBody}>
              <FieldRow label="区分">
                <select
                  value={category}
                  onChange={(e) => {
                    setCategory(e.target.value as Category);
                    setMsg("");
                  }}
                  className={styles.select}
                >
                  <option value="">選択してください</option>
                  <option value="工数">工数</option>
                  <option value="外注費">外注費</option>
                  <option value="経費">経費</option>
                </select>
              </FieldRow>

              {category === "工数" && (
                <>
                  <FieldRow label="役割">
                    <input value={role} onChange={(e) => setRole(e.target.value)} className={styles.input} placeholder="例：PM" />
                  </FieldRow>
                  <FieldRow label="メンバー">
                    <input
                      value={memberName}
                      onChange={(e) => setMemberName(e.target.value)}
                      className={styles.input}
                      placeholder="例：鶴喰"
                    />
                  </FieldRow>
                </>
              )}

              {category === "外注費" && (
                <FieldRow label="パートナー">
                  <input
                    value={partnerName}
                    onChange={(e) => setPartnerName(e.target.value)}
                    className={styles.input}
                    placeholder="例：Go Green"
                  />
                </FieldRow>
              )}

              {category === "経費" && (
                <>
                  <FieldRow label="費目">
                    <input
                      value={expenseItem}
                      onChange={(e) => setExpenseItem(e.target.value)}
                      className={styles.input}
                      placeholder="例：出張費"
                    />
                  </FieldRow>
                  <FieldRow label="費用名">
                    <input
                      value={expenseName}
                      onChange={(e) => setExpenseName(e.target.value)}
                      className={styles.input}
                      placeholder="例：新幹線"
                    />
                  </FieldRow>
                </>
              )}

              <hr className={styles.hr} />

              {category === "工数" && (
                <MonthWorkArea
                  monthOptions={monthOptions}
                  works={works}
                  onAdd={addWorkRow}
                  onRemove={removeWorkRow}
                  onChange={updateWork}
                />
              )}

              {(category === "外注費" || category === "経費") && (
                <MonthMoneyArea
                  monthOptions={monthOptions}
                  rows={category === "外注費" ? outsources : expenses}
                  onAdd={() => addMoneyRow(category === "外注費" ? "outsources" : "expenses")}
                  onRemove={(id) => removeMoneyRow(category === "外注費" ? "outsources" : "expenses", id)}
                  onChange={(id, patch) => updateMoneyRow(category === "外注費" ? "outsources" : "expenses", id, patch)}
                  addText="＋別月の金額を追加"
                />
              )}

              <div className={styles.submitRow}>
                <button onClick={submit} disabled={!canSubmit} className={canSubmit ? styles.btnSubmitEnabled : styles.btnSubmitDisabled}>
                  {mode === "edit" ? "更新する" : "登録する"}
                </button>
              </div>

              {msg && <p className={styles.errorTextCenter}>{msg}</p>}
            </div>
          </div>
        </Modal>
      )}
    </section>
  );
}

function MonthWorkArea(props: {
  monthOptions: string[];
  works: MonthWork[];
  onAdd: () => void;
  onRemove: (id: string) => void;
  onChange: (id: string, patch: Partial<MonthWork>) => void;
}) {
  const { monthOptions, works, onAdd, onRemove, onChange } = props;
  return (
    <div className={styles.areaGrid}>
      <div className={styles.areaLabel}>工数</div>
      <div className={styles.areaBody}>
        {works.map((w, idx) => (
          <div key={w.id} className={styles.rowInline}>
            <select value={w.ym} onChange={(e) => onChange(w.id, { ym: e.target.value })} className={styles.selectSmall}>
              <option value="">年月を選択</option>
              {monthOptions.map((ym) => (
                <option key={ym} value={ym}>
                  {toYMLabel(ym)}
                </option>
              ))}
            </select>
            <span>/</span>
            <input
              value={w.personDays}
              onChange={(e) => onChange(w.id, { personDays: e.target.value })}
              className={styles.inputSmall}
              placeholder="人日"
            />
            <span>人日</span>
            {idx > 0 && (
              <button type="button" onClick={() => onRemove(w.id)} className={styles.btnMini}>
                削除
              </button>
            )}
          </div>
        ))}
        <button type="button" onClick={onAdd} className={styles.linkLike}>
          ＋別月の工数を追加
        </button>
      </div>
    </div>
  );
}

function MonthMoneyArea(props: {
  monthOptions: string[];
  rows: MonthMoney[];
  onAdd: () => void;
  onRemove: (id: string) => void;
  onChange: (id: string, patch: Partial<MonthMoney>) => void;
  addText: string;
}) {
  const { monthOptions, rows, onAdd, onRemove, onChange, addText } = props;
  return (
    <div className={styles.areaGrid}>
      <div className={styles.areaLabel}></div>
      <div className={styles.areaBody}>
        {rows.map((r, idx) => (
          <div key={r.id} className={styles.rowInline}>
            <select value={r.ym} onChange={(e) => onChange(r.id, { ym: e.target.value })} className={styles.selectSmall}>
              <option value="">年月を選択</option>
              {monthOptions.map((ym) => (
                <option key={ym} value={ym}>
                  {toYMLabel(ym)}
                </option>
              ))}
            </select>
            <span>/</span>
            <span>¥</span>
            <input
              value={r.amount}
              onChange={(e) => onChange(r.id, { amount: e.target.value })}
              className={styles.inputMoney}
              placeholder="金額"
            />
            {idx > 0 && (
              <button type="button" onClick={() => onRemove(r.id)} className={styles.btnMini}>
                削除
              </button>
            )}
          </div>
        ))}
        <button type="button" onClick={onAdd} className={styles.linkLike}>
          {addText}
        </button>
      </div>
    </div>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className={styles.fieldRow}>
      <div className={styles.fieldLabel}>{label}</div>
      <div>{children}</div>
    </div>
  );
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className={styles.overlay} onMouseDown={onClose}>
      <div className={styles.modal} onMouseDown={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}