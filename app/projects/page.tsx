import { redirect } from "next/navigation";
import { createClient } from "@/app/utils/supabase/server";
import Link from "next/link";
import styles from "./page.module.css";

type ProjectRow = {
  id: string;
  project_name: string | null;
  client_name: string | null;
  status: string | null;
  invoice_amount: number | string | null;
  invoice_month: string | null;
  payment_due_date: string | null;
  quotation: string | null;
  invoice: string | null;
  planned_profit?: number | null;
  planned_profit_rate?: number | null;
  actual_profit?: number | null;
  actual_profit_rate?: number | null;
};

const COST_PER_PERSON_DAY = 35000;
const HOURS_PER_PERSON_DAY = 8;

function yen(v: number | string | null | undefined) {
  if (v == null) return "";
  const n = typeof v === "string" ? Number(v) : v;
  if (!Number.isFinite(n)) return String(v);
  return `¥${Math.round(n).toLocaleString("ja-JP")}`;
}

function pct(v: number | null | undefined) {
  if (v == null || !Number.isFinite(v)) return "";
  return `${v.toFixed(2)}%`;
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

export default async function ProjectsPage() {
  const supabase = await createClient();
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) redirect("/login");

  const { data, error } = await supabase
    .from("projects")
    .select("id,project_name,client_name,status,invoice_amount,invoice_month,payment_due_date,quotation,invoice")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) throw new Error(error.message);

  const baseRows = (data ?? []) as ProjectRow[];
  const projectIds = baseRows.map((r) => r.id);

  const plannedCostMap = new Map<string, number>();
  const laborActualCostMap = new Map<string, number>();
  const actualExtraCostMap = new Map<string, number>();

  if (projectIds.length > 0) {
    const [
      { data: costs, error: costErr },
      { data: workMonthly, error: wmErr },
      { data: actualCosts, error: acErr },
    ] = await Promise.all([
      supabase
        .from("project_costs")
        .select("project_id,category,person_days,amount")
        .in("project_id", projectIds),

      supabase
        .from("project_work_monthly")
        .select("project_id,total_hours")
        .in("project_id", projectIds),

      supabase
        .from("project_actual_costs")
        .select("project_id,amount")
        .in("project_id", projectIds),
    ]);

    if (costErr) throw new Error(costErr.message);
    if (wmErr) throw new Error(wmErr.message);
    if (acErr) throw new Error(acErr.message);

    for (const row of costs ?? []) {
      const projectId = String((row as any).project_id);

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

      plannedCostMap.set(projectId, (plannedCostMap.get(projectId) ?? 0) + cost);
    }

    for (const row of workMonthly ?? []) {
      const projectId = String((row as any).project_id);
      const hours =
        (row as any).total_hours == null
          ? 0
          : typeof (row as any).total_hours === "string"
            ? Number((row as any).total_hours)
            : (row as any).total_hours;

      const safeHours = Number.isFinite(hours) ? hours : 0;
      const laborCost = (safeHours / HOURS_PER_PERSON_DAY) * COST_PER_PERSON_DAY;

      laborActualCostMap.set(projectId, (laborActualCostMap.get(projectId) ?? 0) + laborCost);
    }

    for (const row of actualCosts ?? []) {
      const projectId = String((row as any).project_id);
      const amt =
        (row as any).amount == null
          ? 0
          : typeof (row as any).amount === "string"
            ? Number((row as any).amount)
            : (row as any).amount;

      actualExtraCostMap.set(projectId, (actualExtraCostMap.get(projectId) ?? 0) + (Number.isFinite(amt) ? amt : 0));
    }
  }

  const rows: ProjectRow[] = baseRows.map((r) => {
    const invoice =
      r.invoice_amount == null
        ? 0
        : typeof r.invoice_amount === "string"
          ? Number(r.invoice_amount)
          : r.invoice_amount;

    const safeInvoice = Number.isFinite(invoice) ? invoice : 0;

    const totalPlannedCost = plannedCostMap.get(r.id) ?? 0;
    const plannedProfit = safeInvoice - totalPlannedCost;
    const plannedProfitRate = safeInvoice > 0 ? (plannedProfit / safeInvoice) * 100 : null;

    const totalLaborActualCost = laborActualCostMap.get(r.id) ?? 0;
    const totalActualExtraCost = actualExtraCostMap.get(r.id) ?? 0;
    const totalActualCost = totalLaborActualCost + totalActualExtraCost;

    const actualProfit = safeInvoice - totalActualCost;
    const actualProfitRate = safeInvoice > 0 ? (actualProfit / safeInvoice) * 100 : null;

    return {
      ...r,
      planned_profit: plannedProfit,
      planned_profit_rate: plannedProfitRate,
      actual_profit: actualProfit,
      actual_profit_rate: actualProfitRate,
    };
  });

  const missingInvoice = rows.filter((r) => !hasValue(r.invoice));
  const missingInvoiceCount = missingInvoice.length;

  return (
    <main className={styles.page}>
      <div>
        <h1 className={styles.pageTitle}>案件進捗管理</h1>
      </div>

      <div className={styles.topBorder} />

      <div className={styles.tabRow}>
        <Link href="/projects/new" className={styles.tabLink}>
          登録
        </Link>
        <Link href="/projects/search" className={styles.tabLink}>
          検索
        </Link>
      </div>

      <div className={styles.sectionBorder} />

      <section className={styles.alertSection}>
        <details className={styles.detailsBox}>
          <summary className={styles.summaryRow}>
            <div className={styles.summaryInner}>
              <div className={styles.summaryAlert}>
                請求書が{missingInvoiceCount}件アップロードされていません
              </div>
              <div className={styles.summaryDate}>
                {new Date().toLocaleDateString("ja-JP")}
              </div>
            </div>
          </summary>

          <div className={styles.detailsBody}>
            {missingInvoiceCount === 0 ? (
              <div className={styles.emptySubText}>未アップロードの案件はありません。</div>
            ) : (
              <div className={styles.mainListWrap}>
                <div className={styles.leftScrollArea}>
                  <table className={styles.tableMain}>
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
                        <th className={styles.thRight}>予定利益</th>
                      </tr>
                    </thead>

                    <tbody>
                      {missingInvoice.map((p, idx) => (
                        <tr key={p.id} className={styles.alertRow}>
                          <td className={styles.tdNo}>{idx + 1}</td>
                          <td className={styles.tdLeft}>
                            <Link href={`/projects/${p.id}`} className={styles.projectLink}>
                              {p.project_name ?? ""}
                            </Link>
                          </td>
                          <td className={styles.tdLeft}>{p.client_name ?? ""}</td>
                          <td className={styles.tdLeft}>{p.status ?? ""}</td>
                          <td className={styles.tdRight}>{yen(p.invoice_amount)}</td>
                          <td className={styles.tdCenter}>{p.invoice_month ?? ""}</td>
                          <td className={styles.tdCenter}>{fmtDate(p.payment_due_date)}</td>
                          <td className={styles.tdCenter}>{markCircle(p.quotation)}</td>
                          <td className={styles.tdCenter}>{markCircle(p.invoice)}</td>
                          <td className={styles.tdRight}>{yen(p.planned_profit)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className={styles.rightFixedArea}>
                  <div className={styles.sideHeaderRow}>
                    <div className={styles.sideHeaderCell}>予定利益率</div>
                    <div className={styles.sideHeaderCell}>実利益</div>
                    <div className={styles.sideHeaderCell}>利益率</div>
                  </div>

                  {missingInvoice.map((p) => (
                    <div key={`side-missing-${p.id}`} className={styles.sideRow}>
                      <div className={styles.sideCell}>{pct(p.planned_profit_rate)}</div>
                      <div className={styles.sideCell}>{yen(p.actual_profit)}</div>
                      <div className={styles.sideCell}>{pct(p.actual_profit_rate)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </details>
      </section>

      <div className={styles.allListSection}>
        <div className={styles.mainListWrap}>
          <div className={styles.leftScrollArea}>
            <table className={styles.tableMain}>
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
                  <th className={styles.thRight}>予定利益</th>
                </tr>
              </thead>

              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td className={styles.tdEmpty} colSpan={10}>
                      まだ案件がありません。
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
                      </td>
                      <td className={styles.tdLeft}>{p.client_name ?? ""}</td>
                      <td className={styles.tdLeft}>{p.status ?? ""}</td>
                      <td className={styles.tdRight}>{yen(p.invoice_amount)}</td>
                      <td className={styles.tdCenter}>{p.invoice_month ?? ""}</td>
                      <td className={styles.tdCenter}>{fmtDate(p.payment_due_date)}</td>
                      <td className={styles.tdCenter}>{markCircle(p.quotation)}</td>
                      <td className={styles.tdCenter}>{markCircle(p.invoice)}</td>
                      <td className={styles.tdRight}>{yen(p.planned_profit)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {rows.length > 0 && (
            <div className={styles.rightFixedArea}>
              <div className={styles.sideHeaderRow}>
                <div className={styles.sideHeaderCell}>予定利益率</div>
                <div className={styles.sideHeaderCell}>実利益</div>
                <div className={styles.sideHeaderCell}>利益率</div>
              </div>

              {rows.map((p) => (
                <div key={`side-${p.id}`} className={styles.sideRow}>
                  <div className={styles.sideCell}>{pct(p.planned_profit_rate)}</div>
                  <div className={styles.sideCell}>{yen(p.actual_profit)}</div>
                  <div className={styles.sideCell}>{pct(p.actual_profit_rate)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}