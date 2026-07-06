"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/app/utils/supabase/client";
import styles from "./client-targets-client.module.css";

type ClientRow = {
  id: string;
  name: string;
  is_focus: number | null;
};

type ClientSalesTargetRow = {
  id: string;
  client_id: string | null;
  target_year_month: string;
  calculation_type: number;
  amount: number | string;
};

type TargetSummaryRow = {
  key: string;
  clientId: string | null;
  clientName: string;
  annualTarget: number;
  targetMonths: number[];
  isConfirmed: boolean;
};

type ClientTargetsClientProps = {
  initialYear: number;
};

type TargetModalMode = "detail" | "edit" | "confirm" | "complete" | null;

const OTHER_CLIENT_KEY = "__other__";
const SALES_CALCULATION_TYPE_MONTHLY = 0;

function getFiscalMonths(year: number) {
  const result: { key: string; label: string }[] = [];

  for (let month = 6; month <= 12; month += 1) {
    result.push({
      key: `${year}-${String(month).padStart(2, "0")}-01`,
      label: `${month}月`,
    });
  }

  for (let month = 1; month <= 5; month += 1) {
    result.push({
      key: `${year + 1}-${String(month).padStart(2, "0")}-01`,
      label: `${month}月`,
    });
  }

  return result;
}

function toNumber(value: number | string | null | undefined) {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num : 0;
}

function formatCurrency(value: number) {
  if (Math.round(value) === 0) return "-";
  return `¥${Math.round(value).toLocaleString("ja-JP")}`;
}

function formatManYenFromYen(value: number) {
  const manYen = value / 10000;
  if (Math.round(manYen * 100) / 100 === 0) return "-";
  return `${formatNumberForDisplay(manYen)}万円`;
}

function formatNumberForDisplay(value: number) {
  if (!Number.isFinite(value)) return "0";
  return value.toLocaleString("ja-JP", {
    maximumFractionDigits: 2,
  });
}

function formatInputFromYen(value: number) {
  const manYen = value / 10000;
  if (manYen === 0) return "";
  return String(Math.round(manYen * 100) / 100);
}

function parseManYenInput(value: string) {
  const normalized = value.replace(/,/g, "").trim();
  if (!normalized) return 0;
  const num = Number(normalized);
  return Number.isFinite(num) ? num : 0;
}

function manYenToYen(value: string) {
  return Math.round(parseManYenInput(value) * 10000);
}

function getTargetRowKey(clientId: string | null, monthKey: string, calculationType: number) {
  return `${clientId ?? OTHER_CLIENT_KEY}_${monthKey}_${calculationType}`;
}

export default function ClientTargetsClient({ initialYear }: ClientTargetsClientProps) {
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [displayYear, setDisplayYear] = useState(initialYear);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [targets, setTargets] = useState<ClientSalesTargetRow[]>([]);
  const [modalMode, setModalMode] = useState<TargetModalMode>(null);
  const [selectedRow, setSelectedRow] = useState<TargetSummaryRow | null>(null);
  const [annualInput, setAnnualInput] = useState("");
  const [monthInputs, setMonthInputs] = useState<string[]>([]);

  const fiscalMonths = useMemo(() => getFiscalMonths(displayYear), [displayYear]);

  const load = useCallback(async () => {
    setLoading(true);
    setMessage("");

    try {
      const fromMonth = fiscalMonths[0]?.key;
      const toMonth = fiscalMonths[fiscalMonths.length - 1]?.key;

      const [clientsRes, targetsRes] = await Promise.all([
        supabase
          .from("client")
          .select("id,name,is_focus")
          .order("is_focus", { ascending: false })
          .order("name", { ascending: true }),
        supabase
          .from("client_sales_target")
          .select("id,client_id,target_year_month,calculation_type,amount")
          .gte("target_year_month", fromMonth)
          .lte("target_year_month", toMonth)
          .eq("calculation_type", SALES_CALCULATION_TYPE_MONTHLY),
      ]);

      if (clientsRes.error) throw new Error(clientsRes.error.message);
      if (targetsRes.error) throw new Error(targetsRes.error.message);

      setClients((clientsRes.data ?? []) as ClientRow[]);
      setTargets((targetsRes.data ?? []) as ClientSalesTargetRow[]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }, [fiscalMonths, supabase]);

  useEffect(() => {
    load();
  }, [load]);

  const existingTargetMap = useMemo(() => {
    const map = new Map<string, ClientSalesTargetRow>();
    for (const target of targets) {
      map.set(getTargetRowKey(target.client_id, target.target_year_month, target.calculation_type), target);
    }
    return map;
  }, [targets]);

  const rows = useMemo<TargetSummaryRow[]>(() => {
    const focusClients = clients.filter((client) => client.is_focus === 1);
    const baseRows = [
      ...focusClients.map((client) => ({
        key: client.id,
        clientId: client.id,
        clientName: client.name,
      })),
      {
        key: OTHER_CLIENT_KEY,
        clientId: null,
        clientName: "その他",
      },
    ];

    return baseRows.map((row) => {
      const targetMonths = fiscalMonths.map((month) => {
        const key = getTargetRowKey(row.clientId, month.key, SALES_CALCULATION_TYPE_MONTHLY);
        return toNumber(existingTargetMap.get(key)?.amount);
      });
      const annualTarget = targetMonths.reduce((sum, value) => sum + value, 0);

      return {
        ...row,
        annualTarget,
        targetMonths,
        isConfirmed: annualTarget > 0,
      };
    });
  }, [clients, fiscalMonths, existingTargetMap]);

  const annualTotal = useMemo(
    () => rows.reduce((sum, row) => sum + row.annualTarget, 0),
    [rows]
  );

  const missingCount = useMemo(
    () => rows.filter((row) => !row.isConfirmed).length,
    [rows]
  );

  const updateYear = (nextYear: number) => {
    setDisplayYear(nextYear);
    closeModal();
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("year", String(nextYear));
      window.history.pushState(null, "", url.toString());
    }
  };

  const closeModal = () => {
    setModalMode(null);
    setSelectedRow(null);
    setAnnualInput("");
    setMonthInputs([]);
    setMessage("");
  };

  const openDetail = (row: TargetSummaryRow) => {
    setSelectedRow(row);
    setAnnualInput(formatInputFromYen(row.annualTarget));
    setMonthInputs(row.targetMonths.map(formatInputFromYen));
    setModalMode("detail");
  };

  const openEdit = (row: TargetSummaryRow) => {
    setSelectedRow(row);
    setAnnualInput(formatInputFromYen(row.annualTarget));
    setMonthInputs(row.targetMonths.map(formatInputFromYen));
    setModalMode("edit");
  };

  const monthlyTotalManYen = useMemo(
    () => monthInputs.reduce((sum, value) => sum + parseManYenInput(value), 0),
    [monthInputs]
  );

  const annualInputManYen = useMemo(() => parseManYenInput(annualInput), [annualInput]);
  const differenceManYen = monthlyTotalManYen - annualInputManYen;

  const applyMonthlySplit = () => {
    const annual = parseManYenInput(annualInput);
    if (annual <= 0) {
      setMonthInputs(Array.from({ length: fiscalMonths.length }, () => ""));
      return;
    }

    const base = Math.floor((annual / fiscalMonths.length) * 100) / 100;
    const values = fiscalMonths.map((_, index) => {
      if (index === fiscalMonths.length - 1) {
        const last = Math.round((annual - base * (fiscalMonths.length - 1)) * 100) / 100;
        return String(last);
      }
      return String(base);
    });

    setMonthInputs(values);
  };

  const saveTargets = async () => {
    if (!selectedRow) return;
    setSaving(true);
    setMessage("");

    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw new Error(authError.message);

      const userId = authData.user?.id;
      if (!userId) throw new Error("ログインユーザーを取得できません。");

      for (const [index, month] of fiscalMonths.entries()) {
        const amount = manYenToYen(monthInputs[index] ?? "0");
        const existing = existingTargetMap.get(
          getTargetRowKey(selectedRow.clientId, month.key, SALES_CALCULATION_TYPE_MONTHLY)
        );

        if (existing) {
          const { error } = await supabase
            .from("client_sales_target")
            .update({
              amount,
              updated_by: userId,
            })
            .eq("id", existing.id);

          if (error) throw new Error(error.message);
        } else if (amount !== 0) {
          const { error } = await supabase.from("client_sales_target").insert({
            client_id: selectedRow.clientId,
            target_year_month: month.key,
            calculation_type: SALES_CALCULATION_TYPE_MONTHLY,
            amount,
            updated_by: userId,
          });

          if (error) throw new Error(error.message);
        }
      }

      await load();
      setModalMode("complete");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  const selectedAnnualYen = useMemo(
    () => monthInputs.reduce((sum, value) => sum + manYenToYen(value), 0),
    [monthInputs]
  );

  const renderMonthlyGrid = (readonly = false) => (
    <div className={styles.modalMonthGrid}>
      {fiscalMonths.map((month, index) => (
        <label key={month.key} className={styles.monthField}>
          <span>{month.label}</span>
          {readonly ? (
            <strong>{formatManYenFromYen(manYenToYen(monthInputs[index] ?? "0"))}</strong>
          ) : (
            <input
              value={monthInputs[index] ?? ""}
              onChange={(event) => {
                const next = [...monthInputs];
                next[index] = event.target.value;
                setMonthInputs(next);
              }}
              inputMode="decimal"
            />
          )}
        </label>
      ))}
    </div>
  );

  return (
    <main className={styles.page}>
      <div className={styles.headerRow}>
        <h1 className={styles.pageTitle}>売上目標金額設定</h1>
      </div>

      {message && <p className={styles.message}>{message}</p>}

      <div className={styles.yearRow}>
        <button type="button" className={styles.yearButton} onClick={() => updateYear(displayYear - 1)}>
          ‹
        </button>
        <div className={styles.yearText}>{displayYear}年</div>
        <button type="button" className={styles.yearButton} onClick={() => updateYear(displayYear + 1)}>
          ›
        </button>
      </div>

      <div className={styles.summaryCards}>
        <section className={styles.summaryCard}>
          <div className={styles.summaryLabel}>年間合計目標金額</div>
          <div className={styles.summaryValue}>{Math.round(annualTotal).toLocaleString("ja-JP")}</div>
          <div className={styles.summaryUnit}>円</div>
        </section>

        <section className={styles.summaryCard}>
          <div className={styles.summaryLabel}>目標未入力</div>
          <div className={styles.summaryValueAccent}>{missingCount}</div>
          <div className={styles.summaryUnit}>件</div>
        </section>
      </div>

      <div className={styles.tableFrame}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>クライアント</th>
              <th>年間目標金額</th>
              <th>ステータス</th>
              <th aria-label="操作" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={4} className={styles.emptyCell}>読み込み中...</td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={4} className={styles.emptyCell}>表示対象がありません。</td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.key}>
                  <td>{row.clientName}</td>
                  <td>{formatCurrency(row.annualTarget)}</td>
                  <td>
                    <span className={row.isConfirmed ? styles.statusConfirmed : styles.statusMissing}>
                      {row.isConfirmed ? "確定済み" : "未入力"}
                    </span>
                  </td>
                  <td className={styles.actionCell}>
                    {row.isConfirmed ? (
                      <button type="button" className={styles.actionButton} onClick={() => openDetail(row)}>
                        詳細
                      </button>
                    ) : (
                      <button type="button" className={styles.actionButton} onClick={() => openEdit(row)}>
                        編集
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className={styles.note}>※重点クライアント以外はその他に集約</p>

      {modalMode && selectedRow && (
        <div className={styles.modalOverlay} onClick={closeModal}>
          <div className={styles.modalCard} onClick={(event) => event.stopPropagation()}>
            {modalMode !== "complete" && (
              <button type="button" className={styles.modalCloseButton} onClick={closeModal} aria-label="閉じる">
                ×
              </button>
            )}

            {modalMode === "detail" && (
              <div className={styles.modalInner}>
                <h2 className={styles.modalTitle}>目標金額詳細</h2>
                <div className={styles.modalInfoGrid}>
                  <div>
                    <span>クライアント名</span>
                    <strong>{selectedRow.clientName}</strong>
                  </div>
                  <div>
                    <span>年間目標金額</span>
                    <strong>{formatManYenFromYen(selectedRow.annualTarget)}</strong>
                  </div>
                </div>
                <h3 className={styles.modalSectionTitle}>月次目標金額</h3>
                {renderMonthlyGrid(true)}
              </div>
            )}

            {modalMode === "edit" && (
              <div className={styles.modalInner}>
                <h2 className={styles.modalTitle}>目標金額を入力してください</h2>
                <div className={styles.formBlock}>
                  <label className={styles.singleField}>
                    <span>クライアント名</span>
                    <strong>{selectedRow.clientName}</strong>
                  </label>
                  <label className={styles.singleField}>
                    <span>年間目標金額</span>
                    <div className={styles.amountInputRow}>
                      <input value={annualInput} onChange={(event) => setAnnualInput(event.target.value)} inputMode="decimal" />
                      <span>万円</span>
                    </div>
                  </label>
                </div>

                <div className={styles.monthHeaderRow}>
                  <h3 className={styles.modalSectionTitle}>月次目標金額</h3>
                  <button type="button" className={styles.autoButton} onClick={applyMonthlySplit}>
                    月割自動入力
                  </button>
                </div>
                {renderMonthlyGrid(false)}

                <div className={styles.modalSummaryBox}>
                  <div>
                    <span>月次合計</span>
                    <strong>{formatNumberForDisplay(monthlyTotalManYen)}万円</strong>
                  </div>
                  <div>
                    <span>年間目標金額に対する過不足金額</span>
                    <strong className={differenceManYen < 0 ? styles.negativeValue : ""}>
                      {formatNumberForDisplay(differenceManYen)}万円
                    </strong>
                  </div>
                </div>

                <div className={styles.modalButtonRow}>
                  <button type="button" className={styles.outlineButton} onClick={closeModal} disabled={saving}>
                    キャンセル
                  </button>
                  <button type="button" className={styles.redButton} onClick={() => setModalMode("confirm")} disabled={saving}>
                    確認する
                  </button>
                </div>
              </div>
            )}

            {modalMode === "confirm" && (
              <div className={styles.modalInner}>
                <h2 className={styles.modalTitle}>入力内容の確認</h2>
                <div className={styles.modalInfoGrid}>
                  <div>
                    <span>クライアント名</span>
                    <strong>{selectedRow.clientName}</strong>
                  </div>
                  <div>
                    <span>年間目標金額</span>
                    <strong>{formatManYenFromYen(selectedAnnualYen)}</strong>
                  </div>
                </div>
                <h3 className={styles.modalSectionTitle}>月次目標金額</h3>
                {renderMonthlyGrid(true)}
                <p className={styles.confirmNotice}>※目標金額確定後の変更は行えません。</p>
                <div className={styles.modalButtonRow}>
                  <button type="button" className={styles.outlineButton} onClick={() => setModalMode("edit")} disabled={saving}>
                    キャンセル
                  </button>
                  <button type="button" className={styles.redButton} onClick={saveTargets} disabled={saving}>
                    {saving ? "保存中..." : "確定する"}
                  </button>
                </div>
              </div>
            )}

            {modalMode === "complete" && (
              <div className={`${styles.modalInner} ${styles.completeInner}`}>
                <h2 className={styles.completeTitle}>目標金額の設定が完了しました</h2>
                <button type="button" className={styles.closeCompleteButton} onClick={closeModal}>
                  閉じる
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
