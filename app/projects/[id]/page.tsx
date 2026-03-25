import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/app/utils/supabase/server";
import CostSection from "./cost-section";
import WorkSection from "./work-section";
import DetailActions from "./detail-actions";
import styles from "./page.module.css";

type PageProps = {
  params: Promise<{ id: string }>;
};

function fmtDate(v: string | null) {
  return v ?? "";
}

function fmtAmountYen(v: number | string | null) {
  if (v == null) return "";
  const n = typeof v === "string" ? Number(v) : v;
  if (Number.isNaN(n)) return String(v);
  return `¥${Math.round(n).toLocaleString("ja-JP")}`;
}

function fmtSharePct(v: number | string | null) {
  if (v == null) return "";
  const n = typeof v === "string" ? Number(v) : v;
  if (Number.isNaN(n)) return String(v);
  return `${(n * 100).toFixed(2)}%`;
}

function isUrl(s: string | null) {
  if (!s) return false;
  return /^https?:\/\//i.test(s);
}

function monthStart(dateStr: string) {
  const [y, m] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, 1);
}

function addMonths(d: Date, months: number) {
  return new Date(d.getFullYear(), d.getMonth() + months, 1);
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

function RevenueTable(props: {
  start_date: string | null;
  end_date: string | null;
  invoice_amount: number | string | null;
  project_manager: string | null;
  pm_revenue_share: number | string | null;
  director: string | null;
  director_revenue_share: number | string | null;
}) {
  const {
    start_date,
    end_date,
    invoice_amount,
    project_manager,
    pm_revenue_share,
    director,
    director_revenue_share,
  } = props;

  if (!start_date || !end_date) {
    return (
      <div className={styles.revenueSection}>
        <h2 className={styles.revenueTitle}>売上計上月</h2>
        <p className={styles.errorText}>開始日と終了日が未設定のため、売上計上月を計算できません。</p>
      </div>
    );
  }

  const months = monthsBetweenInclusive(start_date, end_date);
  const monthCount = months.length;

  const amountNum =
    invoice_amount == null ? null : typeof invoice_amount === "string" ? Number(invoice_amount) : invoice_amount;

  if (amountNum == null || Number.isNaN(amountNum)) {
    return (
      <div className={styles.revenueSection}>
        <h2 className={styles.revenueTitle}>売上計上月</h2>
        <p className={styles.errorText}>請求額が未設定（または不正）です。</p>
      </div>
    );
  }

  const pmShare =
    pm_revenue_share == null ? 0 : typeof pm_revenue_share === "string" ? Number(pm_revenue_share) : pm_revenue_share;
  const dirShare =
    director_revenue_share == null
      ? 0
      : typeof director_revenue_share === "string"
      ? Number(director_revenue_share)
      : director_revenue_share;

  const basePerMonth = amountNum / monthCount;

  const pmPerMonth = () => Math.round(basePerMonth * pmShare);
  const dirPerMonth = () => Math.round(basePerMonth * dirShare);
  const totalPerMonth = () => pmPerMonth() + dirPerMonth();

  const sum = (fn: () => number) => months.reduce((acc) => acc + fn(), 0);

  return (
    <div className={styles.revenueSection}>
      <h2 className={styles.revenueTitle}>売上計上月</h2>

      <div className={styles.tableScroll}>
        <table className={styles.revenueTable}>
          <thead>
            <tr>
              <th className={styles.thLeft}> </th>
              <th className={styles.thLeft}> </th>

              {months.map((m) => (
                <th key={m.toISOString()} className={styles.thMonth}>
                  {toYMLabel(m)}
                </th>
              ))}
              <th className={styles.thMonth}>合計</th>
            </tr>
          </thead>

          <tbody>
            <tr>
              <td className={styles.tdLabel}>PM</td>
              <td className={styles.tdName}>{project_manager ?? ""}</td>

              {months.map((m) => (
                <td key={m.toISOString()} className={styles.tdMoney}>
                  {fmtAmountYen(pmPerMonth())}
                </td>
              ))}
              <td className={styles.tdMoneyStrong}>{fmtAmountYen(sum(pmPerMonth))}</td>
            </tr>

            <tr>
              <td className={styles.tdLabel}>ディレクター</td>
              <td className={styles.tdName}>{director ?? ""}</td>

              {months.map((m) => (
                <td key={m.toISOString()} className={styles.tdMoney}>
                  {fmtAmountYen(dirPerMonth())}
                </td>
              ))}
              <td className={styles.tdMoneyStrong}>{fmtAmountYen(sum(dirPerMonth))}</td>
            </tr>

            <tr>
              <td className={styles.tdLabelStrong}>合計</td>
              <td className={styles.tdName}></td>

              {months.map((m) => (
                <td key={m.toISOString()} className={styles.tdMoneyStrong}>
                  {fmtAmountYen(totalPerMonth())}
                </td>
              ))}
              <td className={styles.tdMoneyStrong}>{fmtAmountYen(sum(totalPerMonth))}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default async function ProjectDetailPage(props: PageProps) {
  const { id } = await props.params;

  const supabase = await createClient();
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) redirect("/login");

  const { data, error } = await supabase
    .from("projects")
    .select(
      `
      id,
      client_id,
      client_name,
      project_name,
      start_date,
      end_date,
      project_manager,
      pm_revenue_share,
      director,
      director_revenue_share,
      status,
      invoice_amount,
      invoice_month,
      payment_due_date,
      quotation,
      invoice,
      created_at,
      updated_at,
      created_by
    `
    )
    .eq("id", id)
    .single();

  if (error) throw new Error(error.message);

  const { data: costs, error: costErr } = await supabase
    .from("project_costs")
    .select("id,category,role,name,ym,person_days,amount")
    .eq("project_id", id)
    .order("created_at", { ascending: true });

  if (costErr) throw new Error(costErr.message);

  const { data: works, error: workErr } = await supabase
    .from("project_work_monthly")
    .select("project_id,user_id,ym,total_hours")
    .eq("project_id", id);

  if (workErr) throw new Error(workErr.message);

  const userIds = Array.from(new Set((works ?? []).map((w: any) => w.user_id).filter(Boolean)));

  const { data: workUsers, error: wuErr } = await supabase
    .from("profiles")
    .select("id,display_name,email")
    .in("id", userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"]);

  if (wuErr) throw new Error(wuErr.message);

  const { data: actualCosts, error: acErr } = await supabase
    .from("project_actual_costs")
    .select("id,project_id,category,partner_id,name,ym,amount,created_at")
    .eq("project_id", id)
    .order("created_at", { ascending: true });

  if (acErr) throw new Error(acErr.message);

  return (
    <main className={styles.page}>
      <div className={styles.headerRow}>
        <h1 className={styles.pageTitle}>案件詳細</h1>

        <div className={styles.headerActions}>
          <DetailActions projectId={data.id} />
          <Link href="/projects" className={styles.backLink}>
            一覧へ戻る
          </Link>
        </div>
      </div>

      <div className={styles.card}>
        <Row label="クライアント名" value={data.client_name} />
        <Row label="案件名" value={data.project_name} />
        <Row label="期間" value={`${fmtDate(data.start_date)} 〜 ${fmtDate(data.end_date)}`} />
        <Row label="PM" value={data.project_manager ?? ""} />
        <Row label="PM売上比率" value={fmtSharePct(data.pm_revenue_share)} />
        <Row label="ディレクター" value={data.director ?? ""} />
        <Row label="ディレクター売上比率" value={fmtSharePct(data.director_revenue_share)} />
        <Row label="状態" value={data.status} />
        <Row label="請求額" value={fmtAmountYen(data.invoice_amount)} />
        <Row label="請求月" value={data.invoice_month ?? ""} />
        <Row label="支払期日" value={fmtDate(data.payment_due_date)} />

        <Row
          label="見積書"
          value={
            isUrl(data.quotation) ? (
              <a href={data.quotation} target="_blank" rel="noreferrer" className={styles.link}>
                Google Drive を開く
              </a>
            ) : (
              data.quotation ?? ""
            )
          }
        />

        <Row
          label="請求書"
          value={
            isUrl(data.invoice) ? (
              <a href={data.invoice} target="_blank" rel="noreferrer" className={styles.link}>
                Google Drive を開く
              </a>
            ) : (
              data.invoice ?? ""
            )
          }
        />

        <RevenueTable
          start_date={data.start_date}
          end_date={data.end_date}
          invoice_amount={data.invoice_amount}
          project_manager={data.project_manager}
          pm_revenue_share={data.pm_revenue_share}
          director={data.director}
          director_revenue_share={data.director_revenue_share}
        />
      </div>

      <CostSection projectId={data.id} startDate={data.start_date} endDate={data.end_date} initialCosts={costs ?? []} />

      <WorkSection
        projectId={data.id}
        startDate={data.start_date}
        endDate={data.end_date}
        workMonthly={(works ?? []) as any}
        users={(workUsers ?? []) as any}
        initialActualCosts={(actualCosts ?? []) as any}
      />
    </main>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className={styles.row}>
      <div>{label}</div>
      <div className={styles.rowValue}>{value}</div>
    </div>
  );
}