"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/app/utils/supabase/client";
import Link from "next/link";
import ClientSelectModal, { ClientLite } from "./ui/ClientSelectModal";
import MemberSelectModal, { MemberLite } from "./ui/MemberSelectModal";
import styles from "./search-client.module.css";

type ProjectRow = {
  id: string;
  project_no: string | null;
  project_name: string | null;
  client_name: string | null;
  status: string | null;
  invoice_amount: number | string | null;
  invoice_month: string | null;
  payment_due_date: string | null;
  quotation: string | null;
  invoice: string | null;
  start_date: string | null;
  end_date: string | null;
  planned_profit?: number | null;
  planned_profit_rate?: number | null;
  actual_profit?: number | null;
  actual_profit_rate?: number | null;
};

function yen(v: number | string | null | undefined) {
  if (v == null) return "";
  const n = typeof v === "string" ? Number(v) : v;
  if (!Number.isFinite(n)) return String(v);
  return `¥${Math.round(n).toLocaleString("ja-JP")}`;
}

function fmtDate(v: string | null | undefined) {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleDateString("ja-JP");
}

function hasValue(v: string | null | undefined) {
  return !!(v ?? "").trim();
}

function markCircle(v: string | null | undefined) {
  return hasValue(v) ? "◯" : "-";
}

const STATUS_OPTIONS = [
  "保留",
  "営業中",
  "確定前",
  "確定",
  "進行中",
  "完了",
  "滞留",
  "プリセールス（無償）",
  "社内案件（無償）",
] as const;

const COST_PER_PERSON_DAY = 35000;
const HOURS_PER_PERSON_DAY = 8;

export default function SearchClient() {
  const supabase = createClient();

  const [keyword, setKeyword] = useState("");
  const [clientIds, setClientIds] = useState<string[]>([]);
  const [clientLabel, setClientLabel] = useState<string>("クライアントを選択");

  const [memberUserIds, setMemberUserIds] = useState<string[]>([]);
  const [memberNames, setMemberNames] = useState<string[]>([]);
  const [memberLabel, setMemberLabel] = useState<string>("メンバーを選択");

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const [amountMin, setAmountMin] = useState<string>("");
  const [amountMax, setAmountMax] = useState<string>("");

  const [planProfitMin, setPlanProfitMin] = useState<string>("");
  const [planProfitMax, setPlanProfitMax] = useState<string>("");
  const [actualProfitMin, setActualProfitMin] = useState<string>("");
  const [actualProfitMax, setActualProfitMax] = useState<string>("");

  const [statuses, setStatuses] = useState<string[]>([]);

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [rows, setRows] = useState<ProjectRow[]>([]);

  const [openClientModal, setOpenClientModal] = useState(false);
  const [openMemberModal, setOpenMemberModal] = useState(false);

  const toggleStatus = (v: string) => {
    setStatuses((prev) => (prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]));
  };

  const clearAll = () => {
    setKeyword("");
    setClientIds([]);
    setClientLabel("クライアントを選択");
    setMemberUserIds([]);
    setMemberNames([]);
    setMemberLabel("メンバーを選択");
    setStartDate("");
    setEndDate("");
    setAmountMin("");
    setAmountMax("");
    setPlanProfitMin("");
    setPlanProfitMax("");
    setActualProfitMin("");
    setActualProfitMax("");
    setStatuses([]);
    setRows([]);
    setMsg("");
  };

  const validateRange = (minStr: string, maxStr: string) => {
    const min = minStr === "" ? null : Number(minStr);
    const max = maxStr === "" ? null : Number(maxStr);
    if (min != null && !Number.isFinite(min)) return "数値を入力してください。";
    if (max != null && !Number.isFinite(max)) return "数値を入力してください。";
    if (min != null && max != null && min > max) return "範囲が不正です（最小 > 最大）";
    return "";
  };

  const search = async () => {
    setMsg("");

    const r1 = validateRange(amountMin, amountMax);
    if (r1) return setMsg(`請求額：${r1}`);

    const r2 = validateRange(planProfitMin, planProfitMax);
    if (r2) return setMsg(`予定利益率：${r2}`);

    const r3 = validateRange(actualProfitMin, actualProfitMax);
    if (r3) return setMsg(`実利益率：${r3}`);

    if (startDate && endDate && startDate > endDate) {
      return setMsg("期間：開始日が終了日より後です。");
    }

    setLoading(true);
    try {
      let q = supabase
        .from("projects")
        .select(
          "id,project_no,project_name,client_name,status,invoice_amount,invoice_month,payment_due_date,quotation,invoice,start_date,end_date,project_manager,director,client_id"
        )
        .order("created_at", { ascending: false })
        .limit(200);

      const kw = keyword.trim();
      if (kw) {
        const isNumberOnly = /^[0-9]+$/.test(kw);

        if (isNumberOnly) {
          q = q.or(`project_name.ilike.%${kw}%,project_no.eq.${kw}`);
        } else {
          q = q.ilike("project_name", `%${kw}%`);
        }
      }

      if (clientIds.length > 0) {
        q = q.in("client_id", clientIds);
      }

      if (memberNames.length > 0) {
        const normalizedNames = memberNames.map((name) => name.replace(/\s+/g, ""));
        const conditions = normalizedNames.flatMap((name) => [
          `project_manager.ilike.%${name}%`,
          `director.ilike.%${name}%`,
        ]);
        q = q.or(conditions.join(","));
      }

      if (startDate) q = q.gte("start_date", startDate);
      if (endDate) q = q.lte("end_date", endDate);

      if (amountMin !== "") q = q.gte("invoice_amount", Number(amountMin));
      if (amountMax !== "") q = q.lte("invoice_amount", Number(amountMax));

      if (statuses.length > 0) q = q.in("status", statuses);

      const { data, error } = await q;
      if (error) throw new Error(error.message);

      const projects = (data ?? []) as ProjectRow[];
      const projectIds = projects.map((p) => p.id);

      const plannedCostMap = new Map<string, number>();

      if (projectIds.length > 0) {
        const { data: plannedCosts, error: pcErr } = await supabase
          .from("project_costs")
          .select("project_id,category,person_days,amount")
          .in("project_id", projectIds);

        if (pcErr) throw new Error(pcErr.message);

        for (const row of plannedCosts ?? []) {
          const pid = String((row as any).project_id);

          let cost = 0;

          if ((row as any).category === "工数") {
            const pd =
              (row as any).person_days == null
                ? 0
                : typeof (row as any).person_days === "string"
                ? Number((row as any).person_days)
                : (row as any).person_days;

            cost = (Number.isFinite(pd) ? pd : 0) * COST_PER_PERSON_DAY;
          } else {
            const amt =
              (row as any).amount == null
                ? 0
                : typeof (row as any).amount === "string"
                ? Number((row as any).amount)
                : (row as any).amount;

            cost = Number.isFinite(amt) ? amt : 0;
          }

          plannedCostMap.set(pid, (plannedCostMap.get(pid) ?? 0) + cost);
        }
      }

      const laborActualCostMap = new Map<string, number>();

      if (projectIds.length > 0) {
        const { data: workMonthly, error: wmErr } = await supabase
          .from("project_work_monthly")
          .select("project_id,total_hours")
          .in("project_id", projectIds);

        if (wmErr) throw new Error(wmErr.message);

        for (const row of workMonthly ?? []) {
          const pid = String((row as any).project_id);
          const hours =
            (row as any).total_hours == null
              ? 0
              : typeof (row as any).total_hours === "string"
              ? Number((row as any).total_hours)
              : (row as any).total_hours;

          const safeHours = Number.isFinite(hours) ? hours : 0;
          const laborCost = (safeHours / HOURS_PER_PERSON_DAY) * COST_PER_PERSON_DAY;

          laborActualCostMap.set(pid, (laborActualCostMap.get(pid) ?? 0) + laborCost);
        }
      }

      const actualExtraCostMap = new Map<string, number>();

      if (projectIds.length > 0) {
        const { data: actualCosts, error: acErr } = await supabase
          .from("project_actual_costs")
          .select("project_id,amount")
          .in("project_id", projectIds);

        if (acErr) throw new Error(acErr.message);

        for (const row of actualCosts ?? []) {
          const pid = String((row as any).project_id);
          const amt =
            (row as any).amount == null
              ? 0
              : typeof (row as any).amount === "string"
              ? Number((row as any).amount)
              : (row as any).amount;

          actualExtraCostMap.set(pid, (actualExtraCostMap.get(pid) ?? 0) + (Number.isFinite(amt) ? amt : 0));
        }
      }

      let merged = projects.map((p) => {
        const invoice =
          p.invoice_amount == null
            ? 0
            : typeof p.invoice_amount === "string"
            ? Number(p.invoice_amount)
            : p.invoice_amount;

        const safeInvoice = Number.isFinite(invoice) ? invoice : 0;

        const totalPlannedCost = plannedCostMap.get(p.id) ?? 0;
        const plannedProfit = safeInvoice - totalPlannedCost;
        const plannedProfitRate = safeInvoice > 0 ? (plannedProfit / safeInvoice) * 100 : null;

        const totalLaborActualCost = laborActualCostMap.get(p.id) ?? 0;
        const totalActualExtraCost = actualExtraCostMap.get(p.id) ?? 0;
        const totalActualCost = totalLaborActualCost + totalActualExtraCost;

        const actualProfit = safeInvoice - totalActualCost;
        const actualProfitRate = safeInvoice > 0 ? (actualProfit / safeInvoice) * 100 : null;

        return {
          ...p,
          planned_profit: plannedProfit,
          planned_profit_rate: plannedProfitRate,
          actual_profit: actualProfit,
          actual_profit_rate: actualProfitRate,
        };
      });

      if (planProfitMin !== "") {
        const min = Number(planProfitMin);
        merged = merged.filter((p) => {
          if (p.planned_profit_rate == null) return false;
          return p.planned_profit_rate >= min;
        });
      }

      if (planProfitMax !== "") {
        const max = Number(planProfitMax);
        merged = merged.filter((p) => {
          if (p.planned_profit_rate == null) return false;
          return p.planned_profit_rate <= max;
        });
      }

      if (actualProfitMin !== "") {
        const min = Number(actualProfitMin);
        merged = merged.filter((p) => {
          if (p.actual_profit_rate == null) return false;
          return p.actual_profit_rate >= min;
        });
      }

      if (actualProfitMax !== "") {
        const max = Number(actualProfitMax);
        merged = merged.filter((p) => {
          if (p.actual_profit_rate == null) return false;
          return p.actual_profit_rate <= max;
        });
      }

      setRows(merged);

      if (merged.length === 0) {
        setMsg("該当する案件がありません。");
      }
    } catch (e: any) {
      setMsg(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  };

  const resultCountLabel = useMemo(() => {
    if (loading) return "検索中…";
    return `検索結果：${rows.length}件`;
  }, [loading, rows.length]);

  return (
    <main className={styles.page}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>案件検索</h1>
        <div className={styles.headerLinks}>
          <Link href="/projects" className={styles.backLink}>
            一覧へ
          </Link>
        </div>
      </div>

      <div className={styles.topBorder} />

      <section className={styles.formCard}>
        <div className={styles.grid}>
          <div className={styles.row}>
            <div className={styles.label}>キーワード</div>
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="検索キーワードまたは案件番号を入力"
              className={styles.textInput}
            />
          </div>

          <div className={styles.row}>
            <div className={styles.label}>クライアント</div>
            <button type="button" className={styles.pickerBtn} onClick={() => setOpenClientModal(true)}>
              <span>{clientLabel}</span>
              <span className={styles.chevron}>›</span>
            </button>
          </div>

          <div className={styles.row}>
            <div className={styles.label}>メンバー</div>
            <button type="button" className={styles.pickerBtn} onClick={() => setOpenMemberModal(true)}>
              <span>{memberLabel}</span>
              <span className={styles.chevron}>›</span>
            </button>
          </div>

          <div className={styles.row}>
            <div className={styles.label}>期間</div>
            <div className={styles.inlineRow}>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={styles.dateInput} />
              <span>〜</span>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={styles.dateInput} />
            </div>
          </div>

          <div className={styles.row}>
            <div className={styles.label}>請求額</div>
            <div className={styles.inlineRow}>
              <span>¥</span>
              <input
                inputMode="numeric"
                value={amountMin}
                onChange={(e) => setAmountMin(e.target.value)}
                placeholder="100000"
                className={styles.moneyInput}
              />
              <span>〜</span>
              <span>¥</span>
              <input
                inputMode="numeric"
                value={amountMax}
                onChange={(e) => setAmountMax(e.target.value)}
                placeholder="200000"
                className={styles.moneyInput}
              />
            </div>
          </div>

          <div className={styles.row}>
            <div className={styles.label}>予定利益率</div>
            <div className={styles.inlineRow}>
              <input
                inputMode="numeric"
                value={planProfitMin}
                onChange={(e) => setPlanProfitMin(e.target.value)}
                placeholder="30"
                className={styles.pctInput}
              />
              <span>%</span>
              <span>〜</span>
              <input
                inputMode="numeric"
                value={planProfitMax}
                onChange={(e) => setPlanProfitMax(e.target.value)}
                placeholder="50"
                className={styles.pctInput}
              />
              <span>%</span>
            </div>
          </div>

          <div className={styles.row}>
            <div className={styles.label}>実利益率</div>
            <div className={styles.inlineRow}>
              <input
                inputMode="numeric"
                value={actualProfitMin}
                onChange={(e) => setActualProfitMin(e.target.value)}
                placeholder="30"
                className={styles.pctInput}
              />
              <span>%</span>
              <span>〜</span>
              <input
                inputMode="numeric"
                value={actualProfitMax}
                onChange={(e) => setActualProfitMax(e.target.value)}
                placeholder="50"
                className={styles.pctInput}
              />
              <span>%</span>
            </div>
          </div>

          <div className={styles.row}>
            <div className={styles.label}>状態</div>
            <div className={styles.statusWrap}>
              {STATUS_OPTIONS.map((s) => (
                <label key={s} className={styles.statusItem}>
                  <input type="checkbox" checked={statuses.includes(s)} onChange={() => toggleStatus(s)} />
                  <span className={styles.statusText}>{s}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className={styles.buttonRow}>
          <button type="button" className={styles.btnClear} onClick={clearAll}>
            指定した条件をクリア
          </button>
          <button type="button" className={styles.btnSearch} onClick={search} disabled={loading}>
            {loading ? "検索中..." : "検索する"}
          </button>
        </div>

        {msg && <p className={styles.message}>{msg}</p>}
      </section>

      <div className={styles.resultCount}>{resultCountLabel}</div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.thNo}>NO</th>
              <th className={styles.thLeft}>案件名</th>
              <th className={styles.thLeft}>クライアント</th>
              <th className={styles.thLeft}>状態</th>
              <th className={styles.thRight}>請求額</th>
              <th className={styles.thCenter}>請求月</th>
              <th className={styles.thCenter}>支払期日</th>
              <th className={styles.thCenter}>見積書</th>
              <th className={styles.thCenter}>請求書</th>
              <th className={styles.thCenter}>期間</th>
              <th className={styles.thRight}>予定利益</th>
            </tr>
          </thead>

          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className={styles.tdEmpty} colSpan={11}>
                  {loading ? "検索中..." : "検索結果はありません。"}
                </td>
              </tr>
            ) : (
              rows.map((p, idx) => (
                <tr key={p.id}>
                  <td className={styles.tdNo}>{idx + 1}</td>
                  <td className={styles.tdLeft}>
                    <Link href={`/projects/${p.id}`} className={styles.projectLink}>
                      {p.project_name ?? ""}
                    </Link>
                    {p.project_no ? <span className={styles.projectNo}>（{p.project_no}）</span> : null}
                  </td>
                  <td className={styles.tdLeft}>{p.client_name ?? ""}</td>
                  <td className={styles.tdLeft}>{p.status ?? ""}</td>
                  <td className={styles.tdRight}>{yen(p.invoice_amount)}</td>
                  <td className={styles.tdCenter}>{p.invoice_month ?? ""}</td>
                  <td className={styles.tdCenter}>{fmtDate(p.payment_due_date)}</td>
                  <td className={styles.tdCenter}>{markCircle(p.quotation)}</td>
                  <td className={styles.tdCenter}>{markCircle(p.invoice)}</td>
                  <td className={styles.tdCenter}>
                    {fmtDate(p.start_date)}
                    {(p.start_date || p.end_date) && " 〜 "}
                    {fmtDate(p.end_date)}
                  </td>
                  <td className={styles.tdRight}>{yen(p.planned_profit)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {openClientModal && (
        <ClientSelectModal
          open={openClientModal}
          onClose={() => setOpenClientModal(false)}
          initialSelectedIds={clientIds}
          onConfirm={(selected: ClientLite[]) => {
            const ids = selected.map((c) => c.id);
            setClientIds(ids);

            if (selected.length === 0) {
              setClientLabel("クライアントを選択");
            } else if (selected.length === 1) {
              setClientLabel(selected[0].name ?? "（名称なし）");
            } else {
              setClientLabel(`${selected[0].name ?? "（名称なし）"} 他${selected.length - 1}件`);
            }

            setOpenClientModal(false);
          }}
        />
      )}

      {openMemberModal && (
        <MemberSelectModal
          open={openMemberModal}
          onClose={() => setOpenMemberModal(false)}
          initialSelectedUserIds={memberUserIds}
          onConfirm={(selected: MemberLite[]) => {
            const ids = selected.map((m) => m.user_id);
            const names = selected.map((m) => m.name);

            setMemberUserIds(ids);
            setMemberNames(names);

            if (selected.length === 0) {
              setMemberLabel("メンバーを選択");
            } else if (selected.length === 1) {
              setMemberLabel(selected[0].name);
            } else {
              setMemberLabel(`${selected[0].name} 他${selected.length - 1}名`);
            }

            setOpenMemberModal(false);
          }}
        />
      )}
    </main>
  );
}