import styles from "./revenue-allocation-section.module.css";

type Profile = {
  id: string;
  last_name: string | null;
  first_name: string | null;
};

type AllocationMember = {
  profile_id: string;
  assigneeName: string;
  job_name: string;
};

type AllocationRow = {
  roleLabel: string;
  assigneeName: string;
  monthlyAmounts: number[];
  total: number;
};

function fullName(lastName: string | null | undefined, firstName: string | null | undefined) {
  const name = `${lastName ?? ""}${firstName ?? ""}`.trim();
  return name || "-";
}

function formatYen(value: number) {
  return Math.round(value).toLocaleString("ja-JP");
}

function getMonthKeys(startDate: string | null, endDate: string | null) {
  if (!startDate || !endDate) return [] as string[];

  const start = new Date(`${startDate.slice(0, 7)}-01T00:00:00`);
  const end = new Date(`${endDate.slice(0, 7)}-01T00:00:00`);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
    return [] as string[];
  }

  const result: string[] = [];
  let current = new Date(start.getFullYear(), start.getMonth(), 1);

  while (current <= end) {
    const year = current.getFullYear();
    const month = String(current.getMonth() + 1).padStart(2, "0");
    result.push(`${year}/${month}`);
    current = new Date(current.getFullYear(), current.getMonth() + 1, 1);
  }

  return result;
}

export default function RevenueAllocationSection({
  startDate,
  endDate,
  invoiceAmount,
  pmRevenueShare,
  memberRevenueShare,
  projectManager,
  members,
}: {
  startDate: string | null;
  endDate: string | null;
  invoiceAmount: number | string | null;
  pmRevenueShare: number | string | null;
  memberRevenueShare: number | string | null;
  projectManager: Profile | null;
  members: AllocationMember[];
}) {
  const monthLabels = getMonthKeys(startDate, endDate);
  const monthCount = monthLabels.length;

  const invoiceAmountNumber = Number(invoiceAmount ?? 0);
  const pmSharePercent = Number(pmRevenueShare ?? 0);
  const memberSharePercent = Number(memberRevenueShare ?? 0);

  const safeInvoiceAmount = Number.isFinite(invoiceAmountNumber) ? invoiceAmountNumber : 0;
  const safePmSharePercent = Number.isFinite(pmSharePercent) ? pmSharePercent : 0;
  const safeMemberSharePercent = Number.isFinite(memberSharePercent) ? memberSharePercent : 0;

  const pmTotal = safeInvoiceAmount * (safePmSharePercent / 100);
  const memberTotal = safeInvoiceAmount * (safeMemberSharePercent / 100);
  const memberCount = members.length;
  const perMemberTotal = memberCount > 0 ? memberTotal / memberCount : 0;

  const rows: AllocationRow[] = [];

  if (projectManager) {
    const perMonth = monthCount > 0 ? pmTotal / monthCount : 0;
    rows.push({
      roleLabel: "PM",
      assigneeName: fullName(projectManager.last_name, projectManager.first_name),
      monthlyAmounts: monthLabels.map(() => perMonth),
      total: pmTotal,
    });
  }

  for (const member of members) {
    const perMonth = monthCount > 0 ? perMemberTotal / monthCount : 0;
    rows.push({
      roleLabel: member.job_name || "メンバー",
      assigneeName: member.assigneeName,
      monthlyAmounts: monthLabels.map(() => perMonth),
      total: perMemberTotal,
    });
  }

  const monthlyTotals = monthLabels.map((_, index) =>
    rows.reduce((sum, row) => sum + (row.monthlyAmounts[index] ?? 0), 0)
  );
  const grandTotal = rows.reduce((sum, row) => sum + row.total, 0);

  return (
    <section className={styles.section}>
      <div className={styles.headerRow}>
        <h2 className={styles.sectionTitle}>売上計上月</h2>
        <div className={styles.unitText}>単位：円</div>
      </div>

      {monthLabels.length === 0 ? (
        <div className={styles.emptyBox}>開始日と終了日を設定すると売上計上月を表示できます。</div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>職種</th>
                <th>担当者</th>
                {monthLabels.map((month) => (
                  <th key={month}>{month}</th>
                ))}
                <th className={styles.totalHeader}>合計</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={monthLabels.length + 3} className={styles.emptyCell}>
                    表示対象がありません。
                  </td>
                </tr>
              ) : (
                rows.map((row, index) => (
                  <tr key={`${row.roleLabel}-${row.assigneeName}-${index}`}>
                    <td>{row.roleLabel}</td>
                    <td>{row.assigneeName}</td>
                    {row.monthlyAmounts.map((amount, amountIndex) => (
                      <td key={`${row.assigneeName}-${amountIndex}`}>{formatYen(amount)}</td>
                    ))}
                    <td className={styles.totalCell}>{formatYen(row.total)}</td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot>
              <tr>
                <th>合計</th>
                <th></th>
                {monthlyTotals.map((amount, index) => (
                  <th key={`total-${index}`}>{formatYen(amount)}</th>
                ))}
                <th className={styles.totalCell}>{formatYen(grandTotal)}</th>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  );
}