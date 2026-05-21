"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { createClient } from "@/app/utils/supabase/client";
import TestProjectDetailActions from "./test-project-detail-actions";
import styles from "./page.module.css";

type SalesRecognitionRow = {
  profileId: string;
  roleLabel: string;
  memberName: string;
  monthlyAmounts: number[];
};

type SavedRecognitionCell = {
  profileId: string;
  targetYearMonth: string;
  amount: number;
};

type InitialData = {
  projectId: string;
  header: {
    title: string;
    projectNo: number | null;
    createdByName: string;
    createdAt: string;
    updatedByName: string;
    updatedAt: string;
    statusLabel: string;
  };
  summary: {
    invoiceAmount: number;
    invoiceMonthLabel: string;
    plannedGrossProfit: number;
    plannedGrossProfitRate: number;
    actualGrossProfit: number;
    actualGrossProfitRate: number;
    paymentDueDateLabel: string;
    overdueLabel: string;
  };
  basicInfo: {
    periodLabel: string;
    clientName: string;
    pmLabel: string;
    directorLabel: string;
    invoiceUrl: string | null;
  };
  profitSummary: {
    plannedTotal: number;
    plannedLabor: number;
    plannedExpense: number;
    plannedExternal: number;
    actualTotal: number;
    actualLabor: number;
    actualExpense: number;
    actualExternal: number;
  };
  sales: {
    monthKeys: string[];
    autoRows: SalesRecognitionRow[];
    currentRows: SalesRecognitionRow[];
    savedCells: SavedRecognitionCell[];
    invoiceAmount: number;
  };
};

function toSafeNumber(value: number | string | null | undefined): number {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num : 0;
}

function formatMonth(value: string | null | undefined): string {
  if (!value) return "-";
  return value.slice(0, 7).replace("-", "/");
}

function formatCurrency(value: number | string | null | undefined): string {
  const num = toSafeNumber(value);
  return `¥${Math.round(num).toLocaleString("ja-JP")}`;
}

function formatSignedCurrency(value: number): string {
  const rounded = Math.round(value);
  const absText = Math.abs(rounded).toLocaleString("ja-JP");
  if (rounded < 0) return `-¥${absText}`;
  if (rounded > 0) return `¥${absText}`;
  return "¥0";
}

function isUrl(value: string | null | undefined): boolean {
  return !!value && /^https?:\/\//i.test(value);
}

function cloneRows(rows: SalesRecognitionRow[]): SalesRecognitionRow[] {
  return rows.map((row) => ({
    ...row,
    monthlyAmounts: [...row.monthlyAmounts],
  }));
}

function buildCellKey(profileId: string, targetYearMonth: string): string {
  return `${profileId}_${targetYearMonth}`;
}

export default function ProjectDetailTestClient({ initialData }: { initialData: InitialData }) {
  const supabase = createClient();

  const [displaySalesRows, setDisplaySalesRows] = useState<SalesRecognitionRow[]>(
    cloneRows(initialData.sales.currentRows)
  );
  const [savedCells, setSavedCells] = useState<SavedRecognitionCell[]>([...initialData.sales.savedCells]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editRows, setEditRows] = useState<SalesRecognitionRow[]>(cloneRows(initialData.sales.currentRows));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const autoRowMap = useMemo(() => {
    const map = new Map<string, SalesRecognitionRow>();
    for (const row of initialData.sales.autoRows) {
      map.set(row.profileId, row);
    }
    return map;
  }, [initialData.sales.autoRows]);

  const salesMonthlyTotals = useMemo(
    () =>
      initialData.sales.monthKeys.map((_, index) =>
        displaySalesRows.reduce<number>((sum, row) => sum + toSafeNumber(row.monthlyAmounts[index]), 0)
      ),
    [displaySalesRows, initialData.sales.monthKeys]
  );

  const salesGrandTotal = useMemo(
    () =>
      displaySalesRows.reduce<number>(
        (sum, row) =>
          sum +
          row.monthlyAmounts.reduce<number>((inner, amount) => inner + toSafeNumber(amount), 0),
        0
      ),
    [displaySalesRows]
  );

  const editMonthlyTotals = useMemo(
    () =>
      initialData.sales.monthKeys.map((_, index) =>
        editRows.reduce<number>((sum, row) => sum + toSafeNumber(row.monthlyAmounts[index]), 0)
      ),
    [editRows, initialData.sales.monthKeys]
  );

  const editGrandTotal = useMemo(
    () =>
      editRows.reduce<number>(
        (sum, row) =>
          sum +
          row.monthlyAmounts.reduce<number>((inner, amount) => inner + toSafeNumber(amount), 0),
        0
      ),
    [editRows]
  );

  const overShortAmount = editGrandTotal - initialData.sales.invoiceAmount;
  const canSave =
    !saving &&
    initialData.sales.monthKeys.length > 0 &&
    editRows.length > 0 &&
    overShortAmount === 0;

  const openEditModal = () => {
    setMessage("");
    setEditRows(cloneRows(displaySalesRows));
    setIsModalOpen(true);
  };

  const closeEditModal = () => {
    if (saving) return;
    setIsModalOpen(false);
    setMessage("");
  };

  const updateCell = (rowIndex: number, monthIndex: number, rawValue: string) => {
    const normalized = rawValue.replace(/[^\d]/g, "");
    const nextValue = normalized ? Number(normalized) : 0;

    setEditRows((current) =>
      current.map((row, currentRowIndex) => {
        if (currentRowIndex !== rowIndex) return row;
        return {
          ...row,
          monthlyAmounts: row.monthlyAmounts.map((amount, currentMonthIndex) =>
            currentMonthIndex === monthIndex ? nextValue : amount
          ),
        };
      })
    );
  };

  const saveSalesRecognition = async () => {
    if (!canSave) return;

    setSaving(true);
    setMessage("");

    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw new Error(authError.message);

      const userId = authData.user?.id;
      if (!userId) throw new Error("ログインユーザーを取得できません。");

      const nextDiffCells: SavedRecognitionCell[] = [];

      for (const row of editRows) {
        const autoRow = autoRowMap.get(row.profileId);
        if (!autoRow) continue;

        for (let monthIndex = 0; monthIndex < initialData.sales.monthKeys.length; monthIndex += 1) {
          const monthKey = initialData.sales.monthKeys[monthIndex];
          const editedAmount = Math.round(toSafeNumber(row.monthlyAmounts[monthIndex]));
          const autoAmount = Math.round(toSafeNumber(autoRow.monthlyAmounts[monthIndex]));

          if (editedAmount !== autoAmount) {
            nextDiffCells.push({
              profileId: row.profileId,
              targetYearMonth: monthKey,
              amount: editedAmount,
            });
          }
        }
      }

      const currentSavedKeySet = new Set(
        savedCells.map((cell) => buildCellKey(cell.profileId, cell.targetYearMonth))
      );
      const nextSavedKeySet = new Set(
        nextDiffCells.map((cell) => buildCellKey(cell.profileId, cell.targetYearMonth))
      );

      const cellsToDelete = savedCells.filter(
        (cell) => !nextSavedKeySet.has(buildCellKey(cell.profileId, cell.targetYearMonth))
      );

      if (cellsToDelete.length > 0) {
        const deleteResults = await Promise.all(
          cellsToDelete.map((cell) =>
            supabase
              .from("project_sales_recognition")
              .delete()
              .eq("project_id", initialData.projectId)
              .eq("profile_id", cell.profileId)
              .eq("target_year_month", cell.targetYearMonth)
          )
        );

        const deleteError = deleteResults.find((result) => result.error)?.error;
        if (deleteError) throw new Error(deleteError.message);
      }

      const cellsToUpsert = nextDiffCells.filter((cell) => {
        const key = buildCellKey(cell.profileId, cell.targetYearMonth);
        if (!currentSavedKeySet.has(key)) return true;

        const currentCell = savedCells.find(
          (savedCell) => buildCellKey(savedCell.profileId, savedCell.targetYearMonth) === key
        );
        return !currentCell || Math.round(currentCell.amount) !== Math.round(cell.amount);
      });

      if (cellsToUpsert.length > 0) {
        const payload = cellsToUpsert.map((cell) => ({
          project_id: initialData.projectId,
          profile_id: cell.profileId,
          target_year_month: cell.targetYearMonth,
          amount: Math.round(cell.amount),
          updated_by: userId,
        }));

        const { error: upsertError } = await supabase
          .from("project_sales_recognition")
          .upsert(payload, {
            onConflict: "project_id,profile_id,target_year_month",
          });

        if (upsertError) throw new Error(upsertError.message);
      }

      const nextRows = cloneRows(editRows);
      setDisplaySalesRows(nextRows);
      setSavedCells(nextDiffCells);
      setIsModalOpen(false);
      setMessage("売上計上を更新しました。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className={styles.page}>
      <div className={styles.backRow}>
        <Link href="/project" className={styles.backLink}>
          ← 戻る
        </Link>
      </div>

      <div className={styles.topBorder} />

      {message && <p className={styles.message}>{message}</p>}

      <div className={styles.headerRow}>
        <div className={styles.headerLeft}>
          <h1 className={styles.pageTitle}>{initialData.header.title}</h1>

          <div className={styles.metaLine}>案件No：{initialData.header.projectNo ?? "-"}</div>
          <div className={styles.metaLine}>
            登録者：{initialData.header.createdByName}（{initialData.header.createdAt}）
            <span className={styles.metaDivider}>　</span>
            最終更新者：{initialData.header.updatedByName}（{initialData.header.updatedAt}）
          </div>

          <div className={styles.statusRow}>
            <span className={styles.statusBadge}>{initialData.header.statusLabel}</span>
          </div>
        </div>

        <TestProjectDetailActions projectId={initialData.projectId} />
      </div>

      <section className={styles.cardSummaryRow}>
        <div className={styles.summaryCard}>
          <div className={styles.summaryLabel}>請求額</div>
          <div className={styles.summaryValue}>{formatCurrency(initialData.summary.invoiceAmount)}</div>
          <div className={styles.summarySub}>請求月：{initialData.summary.invoiceMonthLabel}</div>
        </div>

        <div className={styles.summaryCard}>
          <div className={styles.summaryLabel}>予定粗利</div>
          <div className={styles.summaryValue}>{formatCurrency(initialData.summary.plannedGrossProfit)}</div>
          <div className={styles.summarySub}>
            予定粗利率 {initialData.summary.plannedGrossProfitRate.toFixed(2)}%
          </div>
        </div>

        <div className={styles.summaryCard}>
          <div className={styles.summaryLabel}>実績粗利</div>
          <div className={styles.summaryValue}>{formatCurrency(initialData.summary.actualGrossProfit)}</div>
          <div className={styles.summarySub}>
            実績粗利率 {initialData.summary.actualGrossProfitRate.toFixed(2)}%
          </div>
        </div>

        <div className={styles.summaryCard}>
          <div className={styles.summaryLabel}>支払期日</div>
          <div className={styles.summaryValue}>{initialData.summary.paymentDueDateLabel}</div>
          <div className={styles.summarySub}>{initialData.summary.overdueLabel}</div>
        </div>
      </section>

      <section className={styles.twoColumnGrid}>
        <div className={styles.panel}>
          <div className={styles.panelHeader}>基本情報</div>
          <div className={styles.infoTable}>
            <div className={styles.labelCell}>案件期間</div>
            <div className={styles.valueCell}>{initialData.basicInfo.periodLabel}</div>

            <div className={styles.labelCell}>クライアント</div>
            <div className={styles.valueCell}>{initialData.basicInfo.clientName}</div>

            <div className={styles.labelCell}>PM</div>
            <div className={styles.valueCell}>{initialData.basicInfo.pmLabel}</div>

            <div className={styles.labelCell}>ディレクター</div>
            <div className={styles.valueCell}>{initialData.basicInfo.directorLabel}</div>

            <div className={styles.labelCell}>請求書</div>
            <div className={styles.valueCell}>
              {isUrl(initialData.basicInfo.invoiceUrl) ? (
                <a
                  href={initialData.basicInfo.invoiceUrl ?? "#"}
                  target="_blank"
                  rel="noreferrer"
                  className={styles.docLink}
                >
                  【請求書】を開く
                </a>
              ) : (
                "-"
              )}
            </div>
          </div>
        </div>

        <div className={styles.panel}>
          <div className={styles.panelHeader}>利益率サマリー</div>

          <div className={styles.profitCard}>
            <div className={styles.profitLabel}>予定コスト</div>
            <div className={styles.profitValue}>{formatCurrency(initialData.profitSummary.plannedTotal)}</div>
            <div className={styles.profitSub}>
              工数費：{formatCurrency(initialData.profitSummary.plannedLabor)}　経費：
              {formatCurrency(initialData.profitSummary.plannedExpense)}　外注費：
              {formatCurrency(initialData.profitSummary.plannedExternal)}
            </div>
          </div>

          <div className={styles.profitCard}>
            <div className={styles.profitLabel}>実績コスト</div>
            <div className={styles.profitValue}>{formatCurrency(initialData.profitSummary.actualTotal)}</div>
            <div className={styles.profitSub}>
              工数費：{formatCurrency(initialData.profitSummary.actualLabor)}　経費：
              {formatCurrency(initialData.profitSummary.actualExpense)}　外注費：
              {formatCurrency(initialData.profitSummary.actualExternal)}
            </div>
          </div>
        </div>
      </section>

      <section className={styles.salesSection}>
        <div className={styles.salesHeader}>
          <h2 className={styles.salesTitle}>売上計上</h2>
          <button type="button" className={styles.salesEditButton} onClick={openEditModal}>
            売上計上を編集する
          </button>
        </div>

        <div className={styles.salesTableWrap}>
          <table className={styles.salesTable}>
            <thead>
              <tr>
                <th>職種</th>
                <th>担当者</th>
                {initialData.sales.monthKeys.map((monthKey) => (
                  <th key={monthKey}>{formatMonth(monthKey)}</th>
                ))}
                <th>合計</th>
              </tr>
            </thead>
            <tbody>
              {displaySalesRows.length === 0 ? (
                <tr>
                  <td colSpan={initialData.sales.monthKeys.length + 3} className={styles.emptyCell}>
                    売上計上データがありません。
                  </td>
                </tr>
              ) : (
                <>
                  {displaySalesRows.map((row, index) => {
                    const rowTotal = row.monthlyAmounts.reduce<number>(
                      (sum, amount) => sum + toSafeNumber(amount),
                      0
                    );

                    return (
                      <tr key={`${row.roleLabel}-${row.memberName}-${index}`}>
                        <td>{row.roleLabel}</td>
                        <td>{row.memberName}</td>
                        {row.monthlyAmounts.map((amount, monthIndex) => (
                          <td key={`${row.memberName}-${monthIndex}`}>
                            {Math.round(toSafeNumber(amount)).toLocaleString("ja-JP")}
                          </td>
                        ))}
                        <td>{Math.round(rowTotal).toLocaleString("ja-JP")}</td>
                      </tr>
                    );
                  })}

                  <tr className={styles.totalRow}>
                    <td colSpan={2}>合計</td>
                    {salesMonthlyTotals.map((amount, index) => (
                      <td key={`total-${index}`}>{Math.round(amount).toLocaleString("ja-JP")}</td>
                    ))}
                    <td>{Math.round(salesGrandTotal).toLocaleString("ja-JP")}</td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {isModalOpen && (
        <div className={styles.modalOverlay} onClick={closeEditModal}>
          <div className={styles.modalCard} onClick={(event) => event.stopPropagation()}>
            <h2 className={styles.modalTitle}>売上計上の編集</h2>
            <p className={styles.modalLead}>
              請求金額を各メンバーの稼働に応じて入力して振り分けてください。
            </p>

            <div className={styles.modalTableWrap}>
              <table className={styles.modalTable}>
                <thead>
                  <tr>
                    <th>職種</th>
                    <th>担当者</th>
                    {initialData.sales.monthKeys.map((monthKey) => (
                      <th key={monthKey}>{formatMonth(monthKey)}</th>
                    ))}
                    <th>合計</th>
                  </tr>
                </thead>
                <tbody>
                  {editRows.map((row, rowIndex) => {
                    const rowTotal = row.monthlyAmounts.reduce<number>(
                      (sum, amount) => sum + toSafeNumber(amount),
                      0
                    );

                    return (
                      <tr key={`${row.profileId}-${rowIndex}`}>
                        <td>{row.roleLabel}</td>
                        <td>{row.memberName}</td>
                        {row.monthlyAmounts.map((amount, monthIndex) => (
                          <td key={`${row.profileId}-${monthIndex}`}>
                            <input
                              value={String(Math.round(toSafeNumber(amount)))}
                              onChange={(event) => updateCell(rowIndex, monthIndex, event.target.value)}
                              className={styles.modalInput}
                              inputMode="numeric"
                            />
                          </td>
                        ))}
                        <td>{Math.round(rowTotal).toLocaleString("ja-JP")}</td>
                      </tr>
                    );
                  })}

                  <tr className={styles.totalRow}>
                    <td colSpan={2}>合計</td>
                    {editMonthlyTotals.map((amount, index) => (
                      <td key={`edit-total-${index}`}>{Math.round(amount).toLocaleString("ja-JP")}</td>
                    ))}
                    <td>{Math.round(editGrandTotal).toLocaleString("ja-JP")}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className={styles.modalSummaryRow}>
              <div className={styles.modalSummaryItem}>
                <span className={styles.modalSummaryLabel}>請求金額</span>
                <span className={styles.modalSummaryValue}>
                  {formatCurrency(initialData.sales.invoiceAmount)}
                </span>
              </div>

              <div className={styles.modalSummaryItem}>
                <span className={styles.modalSummaryLabel}>過不足金額</span>
                <span
                  className={`${styles.modalSummaryValue} ${
                    overShortAmount !== 0 ? styles.modalSummaryValueError : ""
                  }`}
                >
                  {formatSignedCurrency(overShortAmount)}
                </span>
              </div>
            </div>

            <div className={styles.modalButtonRow}>
              <button
                type="button"
                className={styles.modalCancelButton}
                onClick={closeEditModal}
                disabled={saving}
              >
                キャンセル
              </button>
              <button
                type="button"
                className={styles.modalSaveButton}
                onClick={saveSalesRecognition}
                disabled={!canSave}
              >
                {saving ? "保存中..." : "変更を確定する"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}