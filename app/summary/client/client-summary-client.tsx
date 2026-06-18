"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/app/utils/supabase/client";
import styles from "./client-summary-client.module.css";

type ClientRow = {
  id: string;
  name: string;
  is_focus: number | null;
};

type ProjectRow = {
  id: string;
  name: string;
  client_id: string | null;
  status: number | null;
  invoice_amount: number | null;
  invoice_month: string | null;
  start_date: string | null;
  end_date: string | null;
};

type ClientSalesTargetRow = {
  id: string;
  client_id: string | null;
  target_year_month: string;
  calculation_type: number;
  amount: number | string;
};

type SalesMode = "monthly" | "billing";
type ViewMode = "actual" | "target" | "rate";

type ClientSummaryRow = {
  key: string;
  clientId: string | null;
  clientName: string;
  isOther: boolean;
  actualMonths: number[];
  actualTotal: number;
  targetMonths: number[];
  targetTotal: number;
  rateMonths: (number | null)[];
  rateTotal: number | null;
};

type DetailProjectRow = {
  id: string;
  name: string;
  clientName: string;
  statusLabel: string;
  invoiceAmount: number;
  invoiceMonth: string;
  period: string;
  amount: number;
};

type DetailState = {
  clientKey: string;
  clientName: string;
  monthKey: string;
};

const OTHER_CLIENT_KEY = "__other__";

const SALES_MODE_LABELS: Record<SalesMode, string> = {
  monthly: "売上（月割計上）",
  billing: "売上（請求月一括計上）",
};

const VIEW_MODE_LABELS: Record<ViewMode, string> = {
  actual: "実績",
  target: "目標",
  rate: "達成率",
};

const CALCULATION_TYPE_BY_MODE: Record<SalesMode, number> = {
  monthly: 0,
  billing: 1,
};

const PROJECT_STATUS_LABELS: Record<number, string> = {
  0: "保留",
  1: "営業中（高）",
  2: "営業中（中）",
  3: "営業中（低）",
  4: "営業中（最終調整）",
  5: "確定",
  6: "進行中",
  7: "完了",
  8: "滞留",
  9: "プリセールス(無償)",
  10: "社内案件(無償)",
  11: "失注",
};

function getFiscalMonths(year: number) {
  const result: { key: string; label: string }[] = [];

  for (let month = 6; month <= 12; month += 1) {
    result.push({
      key: `${year}-${String(month).padStart(2, "0")}-01`,
      label: `${year}/${month}`,
    });
  }

  for (let month = 1; month <= 5; month += 1) {
    result.push({
      key: `${year + 1}-${String(month).padStart(2, "0")}-01`,
      label: `${year + 1}/${month}`,
    });
  }

  return result;
}

function getMonthKeysBetween(startDate: string | null, endDate: string | null) {
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
    result.push(`${year}-${month}-01`);
    current = new Date(current.getFullYear(), current.getMonth() + 1, 1);
  }

  return result;
}

function toNumber(value: number | string | null | undefined) {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num : 0;
}

function formatCurrency(value: number) {
  return `¥${Math.round(value).toLocaleString("ja-JP")}`;
}

function formatPercent(value: number | null) {
  if (value == null) return "-";
  return `${(value * 100).toFixed(1)}%`;
}

function formatMonth(value: string | null) {
  if (!value) return "-";
  return value.slice(0, 7).replace("-", "/");
}

function formatPeriod(startDate: string | null, endDate: string | null) {
  if (!startDate && !endDate) return "-";
  if (startDate && endDate) {
    return `${formatMonth(startDate)} 〜 ${formatMonth(endDate)}`;
  }
  return formatMonth(startDate ?? endDate);
}

function parseCurrencyInput(value: string) {
  const normalized = value.replace(/[¥,\s]/g, "");
  const num = Number(normalized || 0);
  return Number.isFinite(num) ? Math.round(num) : 0;
}

function getTargetInputKey(clientKey: string, monthKey: string, calculationType: number) {
  return `${clientKey}_${monthKey}_${calculationType}`;
}

function getTargetRowKey(clientId: string | null, monthKey: string, calculationType: number) {
  return `${clientId ?? OTHER_CLIENT_KEY}_${monthKey}_${calculationType}`;
}

function buildProjectContributions(project: ProjectRow, salesMode: SalesMode, fiscalMonthSet: Set<string>) {
  const invoiceAmount = toNumber(project.invoice_amount);

  if (invoiceAmount === 0) return [] as { monthKey: string; amount: number }[];

  if (salesMode === "billing") {
    if (!project.invoice_month || !fiscalMonthSet.has(project.invoice_month)) {
      return [];
    }

    return [{ monthKey: project.invoice_month, amount: invoiceAmount }];
  }

  const projectMonthKeys = getMonthKeysBetween(project.start_date, project.end_date);
  const fallbackMonthKeys = project.invoice_month ? [project.invoice_month] : [];
  const allMonthKeys = projectMonthKeys.length > 0 ? projectMonthKeys : fallbackMonthKeys;

  if (allMonthKeys.length === 0) return [];

  const monthlyAmount = invoiceAmount / allMonthKeys.length;

  return allMonthKeys
    .filter((monthKey) => fiscalMonthSet.has(monthKey))
    .map((monthKey) => ({ monthKey, amount: monthlyAmount }));
}

export default function ClientSummaryClient() {
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [savingTargets, setSavingTargets] = useState(false);
  const [message, setMessage] = useState("");
  const [displayYear, setDisplayYear] = useState(new Date().getFullYear());
  const [salesMode, setSalesMode] = useState<SalesMode>("monthly");
  const [viewMode, setViewMode] = useState<ViewMode>("actual");
  const [editingTargets, setEditingTargets] = useState(false);

  const [clients, setClients] = useState<ClientRow[]>([]);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [targets, setTargets] = useState<ClientSalesTargetRow[]>([]);
  const [targetInputs, setTargetInputs] = useState<Record<string, string>>({});
  const [detailState, setDetailState] = useState<DetailState | null>(null);

  const fiscalMonths = useMemo(() => getFiscalMonths(displayYear), [displayYear]);
  const calculationType = CALCULATION_TYPE_BY_MODE[salesMode];

  const load = useCallback(async () => {
    setLoading(true);
    setMessage("");

    try {
      const fromMonth = fiscalMonths[0]?.key;
      const toMonth = fiscalMonths[fiscalMonths.length - 1]?.key;

      const [clientsRes, projectsRes, targetsRes] = await Promise.all([
        supabase.from("client").select("id,name,is_focus").order("is_focus", { ascending: false }).order("name", { ascending: true }),
        supabase
          .from("project")
          .select("id,name,client_id,status,invoice_amount,invoice_month,start_date,end_date")
          .order("updated_at", { ascending: false }),
        supabase
          .from("client_sales_target")
          .select("id,client_id,target_year_month,calculation_type,amount")
          .gte("target_year_month", fromMonth)
          .lte("target_year_month", toMonth),
      ]);

      if (clientsRes.error) throw new Error(clientsRes.error.message);
      if (projectsRes.error) throw new Error(projectsRes.error.message);
      if (targetsRes.error) throw new Error(targetsRes.error.message);

      const nextClients = (clientsRes.data ?? []) as ClientRow[];
      const nextTargets = (targetsRes.data ?? []) as ClientSalesTargetRow[];

      setClients(nextClients);
      setProjects((projectsRes.data ?? []) as ProjectRow[]);
      setTargets(nextTargets);

      const nextInputs: Record<string, string> = {};
      for (const target of nextTargets) {
        const clientKey = target.client_id ?? OTHER_CLIENT_KEY;
        const inputKey = getTargetInputKey(clientKey, target.target_year_month, target.calculation_type);
        nextInputs[inputKey] = String(Math.round(toNumber(target.amount)));
      }
      setTargetInputs(nextInputs);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }, [fiscalMonths, supabase]);

  useEffect(() => {
    load();
  }, [load]);

  const focusClients = useMemo(
    () => clients.filter((client) => client.is_focus === 1),
    [clients]
  );

  const clientMap = useMemo(() => new Map(clients.map((client) => [client.id, client])), [clients]);
  const focusClientIdSet = useMemo(() => new Set(focusClients.map((client) => client.id)), [focusClients]);
  const fiscalMonthSet = useMemo(() => new Set(fiscalMonths.map((month) => month.key)), [fiscalMonths]);

  const summaryRows = useMemo<ClientSummaryRow[]>(() => {
    const rowsBase = [
      ...focusClients.map((client) => ({
        key: client.id,
        clientId: client.id,
        clientName: client.name,
        isOther: false,
      })),
      {
        key: OTHER_CLIENT_KEY,
        clientId: null,
        clientName: "その他",
        isOther: true,
      },
    ];

    const actualMap = new Map<string, number[]>();
    for (const row of rowsBase) {
      actualMap.set(row.key, fiscalMonths.map(() => 0));
    }

    const monthIndexMap = new Map<string, number>(fiscalMonths.map((month, index) => [month.key, index]));

    for (const project of projects) {
      const clientKey = project.client_id && focusClientIdSet.has(project.client_id) ? project.client_id : OTHER_CLIENT_KEY;
      const values = actualMap.get(clientKey);
      if (!values) continue;

      for (const contribution of buildProjectContributions(project, salesMode, fiscalMonthSet)) {
        const monthIndex = monthIndexMap.get(contribution.monthKey);
        if (monthIndex == null) continue;
        values[monthIndex] = (values[monthIndex] ?? 0) + contribution.amount;
      }
    }

    const targetMap = new Map<string, number>();
    for (const target of targets) {
      if (target.calculation_type !== calculationType) continue;
      const key = getTargetRowKey(target.client_id, target.target_year_month, target.calculation_type);
      targetMap.set(key, toNumber(target.amount));
    }

    return rowsBase.map((row) => {
      const actualMonths = actualMap.get(row.key) ?? fiscalMonths.map(() => 0);
      const targetMonths = fiscalMonths.map((month) => {
        const inputKey = getTargetInputKey(row.key, month.key, calculationType);
        if (targetInputs[inputKey] != null) {
          return parseCurrencyInput(targetInputs[inputKey]);
        }
        const storedKey = getTargetRowKey(row.clientId, month.key, calculationType);
        return targetMap.get(storedKey) ?? 0;
      });
      const actualTotal = actualMonths.reduce((sum, value) => sum + value, 0);
      const targetTotal = targetMonths.reduce((sum, value) => sum + value, 0);
      const rateMonths = actualMonths.map((actual, index) => {
        const target = targetMonths[index] ?? 0;
        return target > 0 ? actual / target : null;
      });
      const rateTotal = targetTotal > 0 ? actualTotal / targetTotal : null;

      return {
        ...row,
        actualMonths,
        actualTotal,
        targetMonths,
        targetTotal,
        rateMonths,
        rateTotal,
      };
    });
  }, [calculationType, fiscalMonthSet, fiscalMonths, focusClientIdSet, focusClients, projects, salesMode, targetInputs, targets]);

  const existingTargetMap = useMemo(() => {
    const map = new Map<string, ClientSalesTargetRow>();
    for (const target of targets) {
      map.set(getTargetRowKey(target.client_id, target.target_year_month, target.calculation_type), target);
    }
    return map;
  }, [targets]);

  const detailProjects = useMemo<DetailProjectRow[]>(() => {
    if (!detailState) return [];

    const targetMonthKeys = detailState.monthKey === "annual"
      ? new Set(fiscalMonths.map((month) => month.key))
      : new Set([detailState.monthKey]);

    const result: DetailProjectRow[] = [];

    for (const project of projects) {
      const clientKey = project.client_id && focusClientIdSet.has(project.client_id) ? project.client_id : OTHER_CLIENT_KEY;
      if (clientKey !== detailState.clientKey) continue;

      const amount = buildProjectContributions(project, salesMode, fiscalMonthSet)
        .filter((contribution) => targetMonthKeys.has(contribution.monthKey))
        .reduce((sum, contribution) => sum + contribution.amount, 0);

      if (amount === 0) continue;

      const clientName = project.client_id ? clientMap.get(project.client_id)?.name ?? "-" : "-";

      result.push({
        id: project.id,
        name: project.name,
        clientName,
        statusLabel: project.status != null ? PROJECT_STATUS_LABELS[project.status] ?? String(project.status) : "-",
        invoiceAmount: toNumber(project.invoice_amount),
        invoiceMonth: formatMonth(project.invoice_month),
        period: formatPeriod(project.start_date, project.end_date),
        amount,
      });
    }

    result.sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name, "ja"));
    return result;
  }, [clientMap, detailState, fiscalMonthSet, fiscalMonths, focusClientIdSet, projects, salesMode]);

  const updateUrlYear = (nextYear: number) => {
    setDisplayYear(nextYear);
    setEditingTargets(false);
    setDetailState(null);
  };

  const startEditTargets = () => {
    setViewMode("target");
    setEditingTargets(true);
  };

  const cancelEditTargets = () => {
    const nextInputs: Record<string, string> = {};
    for (const target of targets) {
      const clientKey = target.client_id ?? OTHER_CLIENT_KEY;
      const inputKey = getTargetInputKey(clientKey, target.target_year_month, target.calculation_type);
      nextInputs[inputKey] = String(Math.round(toNumber(target.amount)));
    }
    setTargetInputs(nextInputs);
    setEditingTargets(false);
  };

  const saveTargets = async () => {
    setSavingTargets(true);
    setMessage("");

    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw new Error(authError.message);

      const userId = authData.user?.id;
      if (!userId) throw new Error("ログインユーザーを取得できません。");

      const rowsToSave = summaryRows.flatMap((row) =>
        fiscalMonths.map((month) => {
          const inputKey = getTargetInputKey(row.key, month.key, calculationType);
          return {
            client_id: row.clientId,
            target_year_month: month.key,
            calculation_type: calculationType,
            amount: parseCurrencyInput(targetInputs[inputKey] ?? "0"),
          };
        })
      );

      for (const row of rowsToSave) {
        const existing = existingTargetMap.get(
          getTargetRowKey(row.client_id, row.target_year_month, row.calculation_type)
        );

        if (existing) {
          const { error } = await supabase
            .from("client_sales_target")
            .update({
              amount: row.amount,
              updated_by: userId,
            })
            .eq("id", existing.id);

          if (error) throw new Error(error.message);
        } else if (row.amount !== 0) {
          const { error } = await supabase.from("client_sales_target").insert({
            client_id: row.client_id,
            target_year_month: row.target_year_month,
            calculation_type: row.calculation_type,
            amount: row.amount,
            updated_by: userId,
          });

          if (error) throw new Error(error.message);
        }
      }

      setEditingTargets(false);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setSavingTargets(false);
    }
  };

  const openDetail = (row: ClientSummaryRow, monthKey: string) => {
    setDetailState({
      clientKey: row.key,
      clientName: row.clientName,
      monthKey,
    });
  };

  const detailMonthLabel = useMemo(() => {
    if (!detailState) return "";
    if (detailState.monthKey === "annual") return "年間";
    return fiscalMonths.find((month) => month.key === detailState.monthKey)?.label ?? detailState.monthKey;
  }, [detailState, fiscalMonths]);

  const renderValueCell = (row: ClientSummaryRow, monthIndex: number | "annual") => {
    const monthKey = monthIndex === "annual" ? "annual" : fiscalMonths[monthIndex].key;

    if (viewMode === "target") {
      if (monthIndex === "annual") {
        return <span>{formatCurrency(row.targetTotal)}</span>;
      }

      const inputKey = getTargetInputKey(row.key, monthKey, calculationType);

      if (editingTargets) {
        return (
          <input
            className={styles.targetInput}
            value={targetInputs[inputKey] ?? ""}
            onChange={(event) =>
              setTargetInputs((current) => ({
                ...current,
                [inputKey]: event.target.value,
              }))
            }
            inputMode="numeric"
            placeholder="0"
          />
        );
      }

      return <span>{formatCurrency(row.targetMonths[monthIndex])}</span>;
    }

    if (viewMode === "rate") {
      const rate = monthIndex === "annual" ? row.rateTotal : row.rateMonths[monthIndex];
      return (
        <button type="button" className={styles.valueButton} onClick={() => openDetail(row, monthKey)}>
          {formatPercent(rate)}
        </button>
      );
    }

    const actual = monthIndex === "annual" ? row.actualTotal : row.actualMonths[monthIndex];
    return (
      <button type="button" className={styles.valueButton} onClick={() => openDetail(row, monthKey)}>
        {formatCurrency(actual)}
      </button>
    );
  };

  return (
    <main className={styles.page}>
      <div className={styles.headerRow}>
        <div>
          <h1 className={styles.pageTitle}>クライアント別年間実績</h1>
        </div>
      </div>

      {message && <p className={styles.message}>{message}</p>}

      <div className={styles.yearRow}>
        <button type="button" className={styles.yearButton} onClick={() => updateUrlYear(displayYear - 1)}>
          ‹
        </button>
        <div className={styles.yearText}>{displayYear}年</div>
        <button type="button" className={styles.yearButton} onClick={() => updateUrlYear(displayYear + 1)}>
          ›
        </button>
      </div>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>クライアント別サマリー</h2>
          <div className={styles.targetActions}>
            {editingTargets ? (
              <>
                <button type="button" className={styles.secondaryButton} onClick={cancelEditTargets} disabled={savingTargets}>
                  キャンセル
                </button>
                <button type="button" className={styles.primaryButton} onClick={saveTargets} disabled={savingTargets}>
                  {savingTargets ? "保存中..." : "目標金額を保存する"}
                </button>
              </>
            ) : (
              <button type="button" className={styles.primaryButton} onClick={startEditTargets}>
                目標金額を編集する
              </button>
            )}
          </div>
        </div>

        <div className={styles.mainTabs}>
          {Object.entries(SALES_MODE_LABELS).map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={`${styles.mainTab} ${salesMode === key ? styles.mainTabActive : ""}`}
              onClick={() => {
                setSalesMode(key as SalesMode);
                setEditingTargets(false);
                setDetailState(null);
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <div className={styles.subTabs}>
          {Object.entries(VIEW_MODE_LABELS).map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={`${styles.subTab} ${viewMode === key ? styles.subTabActive : ""}`}
              onClick={() => {
                setViewMode(key as ViewMode);
                setEditingTargets(false);
                setDetailState(null);
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <div className={styles.tableFrame}>
          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.clientHeader}>クライアント</th>
                  {fiscalMonths.map((month) => (
                    <th key={month.key}>{month.label}</th>
                  ))}
                  <th>年間</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={14} className={styles.emptyCell}>読み込み中...</td>
                  </tr>
                ) : summaryRows.length === 0 ? (
                  <tr>
                    <td colSpan={14} className={styles.emptyCell}>表示対象がありません。</td>
                  </tr>
                ) : (
                  summaryRows.map((row) => (
                    <tr key={row.key}>
                      <td className={styles.clientCell}>{row.clientName}</td>
                      {fiscalMonths.map((month, index) => (
                        <td key={`${row.key}-${month.key}`} className={styles.numberCell}>
                          {renderValueCell(row, index)}
                        </td>
                      ))}
                      <td className={styles.totalCell}>{renderValueCell(row, "annual")}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <p className={styles.note}>※重点クライアント以外はその他に集約</p>
      </section>

      {detailState && (
        <div className={styles.modalOverlay} onClick={() => setDetailState(null)}>
          <div className={styles.modalCard} onClick={(event) => event.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div>
                <h2 className={styles.modalTitle}>関連案件一覧</h2>
                <p className={styles.modalLead}>
                  {detailState.clientName} / {detailMonthLabel} / {SALES_MODE_LABELS[salesMode]}
                </p>
              </div>
              <button type="button" className={styles.modalCloseButton} onClick={() => setDetailState(null)}>
                ×
              </button>
            </div>

            <div className={styles.detailTableFrame}>
              <table className={styles.detailTable}>
                <thead>
                  <tr>
                    <th>案件名</th>
                    <th>クライアント</th>
                    <th>状態</th>
                    <th>請求額</th>
                    <th>請求月</th>
                    <th>期間</th>
                    <th>計上額</th>
                  </tr>
                </thead>
                <tbody>
                  {detailProjects.length === 0 ? (
                    <tr>
                      <td colSpan={7} className={styles.emptyCell}>関連案件がありません。</td>
                    </tr>
                  ) : (
                    detailProjects.map((project) => (
                      <tr key={project.id}>
                        <td>
                          <Link href={`/project/${project.id}`} className={styles.projectLink}>
                            {project.name}
                          </Link>
                        </td>
                        <td>{project.clientName}</td>
                        <td>{project.statusLabel}</td>
                        <td>{formatCurrency(project.invoiceAmount)}</td>
                        <td>{project.invoiceMonth}</td>
                        <td>{project.period}</td>
                        <td>{formatCurrency(project.amount)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
