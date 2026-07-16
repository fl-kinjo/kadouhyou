"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/app/utils/supabase/client";
import styles from "./project-client.module.css";

type Project = {
  id: string;
  project_no: number | null;
  name: string;
  client_id: string | null;
  status: number | null;
  invoice_amount: number | null;
  invoice_month: string | null;
  payment_due_date: string | null;
  invoice: string | null;
  planned_cost_approval_status: number | null;
  suppress_validation_alerts: boolean | null;
  created_at: string;
};

type Client = {
  id: string;
  name: string;
};

type MissingInvoiceProject = {
  id: string;
  name: string;
};

type SortOption = {
  value: string;
  label: string;
  column: keyof Pick<
    Project,
    "created_at" | "project_no" | "name" | "status" | "invoice_amount" | "invoice_month" | "payment_due_date"
  >;
  ascending: boolean;
};

const PAGE_SIZE = 20;
const MISSING_INVOICE_LIST_LIMIT = 50;

const STATUS_OPTIONS = [
  { value: 0, label: "保留" },
  { value: 1, label: "営業中（高）" },
  { value: 2, label: "営業中（中）" },
  { value: 3, label: "営業中（低）" },
  { value: 4, label: "営業中（最終調整）" },
  { value: 5, label: "確定" },
  { value: 6, label: "進行中" },
  { value: 7, label: "完了" },
  { value: 8, label: "滞留" },
  { value: 9, label: "プリセールス(無償)" },
  { value: 10, label: "社内案件(無償)" },
  { value: 11, label: "失注" },
] as const;

const ALL_STATUS_VALUES = STATUS_OPTIONS.map((status) => status.value);

const SORT_OPTIONS: SortOption[] = [
  { value: "created_at_desc", label: "登録日が新しい順", column: "created_at", ascending: false },
  { value: "created_at_asc", label: "登録日が古い順", column: "created_at", ascending: true },
  { value: "project_no_desc", label: "案件NOが大きい順", column: "project_no", ascending: false },
  { value: "project_no_asc", label: "案件NOが小さい順", column: "project_no", ascending: true },
  { value: "name_asc", label: "案件名 昇順", column: "name", ascending: true },
  { value: "name_desc", label: "案件名 降順", column: "name", ascending: false },
  { value: "status_asc", label: "ステータス 昇順", column: "status", ascending: true },
  { value: "status_desc", label: "ステータス 降順", column: "status", ascending: false },
  { value: "invoice_amount_desc", label: "請求額が高い順", column: "invoice_amount", ascending: false },
  { value: "invoice_amount_asc", label: "請求額が低い順", column: "invoice_amount", ascending: true },
  { value: "invoice_month_desc", label: "請求月が新しい順", column: "invoice_month", ascending: false },
  { value: "invoice_month_asc", label: "請求月が古い順", column: "invoice_month", ascending: true },
  { value: "payment_due_date_asc", label: "支払期日が近い順", column: "payment_due_date", ascending: true },
  { value: "payment_due_date_desc", label: "支払期日が遠い順", column: "payment_due_date", ascending: false },
];

function statusLabel(status: number | null | undefined) {
  return STATUS_OPTIONS.find((item) => item.value === status)?.label ?? "-";
}

function fmtYen(value: number | null | undefined) {
  if (value == null) return "-";
  return `¥${value.toLocaleString("ja-JP")}`;
}

function fmtMonth(value: string | null | undefined) {
  if (!value) return "-";
  const [year, month] = value.split("-");
  if (!year || !month) return value;
  return `${year}/${month}`;
}

function fmtDate(value: string | null | undefined) {
  if (!value) return "-";
  return value;
}

function fmtPlannedCostApproved(status: number | null | undefined) {
  return status === 2 ? "◯" : "-";
}

function buildProjectSearchFilter(keyword: string, clients: Client[]) {
  const normalizedKeyword = keyword.trim().toLowerCase();
  if (!normalizedKeyword) return "";

  const escapedKeyword = normalizedKeyword.replace(/[\\%_]/g, (match) => `\\${match}`);
  const conditions = [`name.ilike.%${escapedKeyword}%`];

  const matchedClientIds = clients
    .filter((client) => client.name.toLowerCase().includes(normalizedKeyword))
    .map((client) => client.id);

  if (matchedClientIds.length > 0) {
    conditions.push(`client_id.in.(${matchedClientIds.join(",")})`);
  }

  const matchedStatusValues = STATUS_OPTIONS
    .filter((status) => status.label.toLowerCase().includes(normalizedKeyword))
    .map((status) => status.value);

  if (matchedStatusValues.length > 0) {
    conditions.push(`status.in.(${matchedStatusValues.join(",")})`);
  }

  return conditions.join(",");
}

export default function ProjectClient() {
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [clientsLoading, setClientsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [keyword, setKeyword] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [missingInvoiceCount, setMissingInvoiceCount] = useState(0);
  const [missingInvoiceProjects, setMissingInvoiceProjects] = useState<MissingInvoiceProject[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<number[]>(ALL_STATUS_VALUES);
  const [sortValue, setSortValue] = useState(SORT_OPTIONS[0].value);

  useEffect(() => {
    const loadClients = async () => {
      setClientsLoading(true);
      setErrorMsg("");

      const { data: clientData, error: clientError } = await supabase.from("client").select("id,name");

      if (clientError) {
        setErrorMsg(clientError.message);
        setClientsLoading(false);
        return;
      }

      setClients((clientData ?? []) as Client[]);
      setClientsLoading(false);
    };

    const loadMissingInvoiceInfo = async () => {
      const [countResult, listResult] = await Promise.all([
        supabase
          .from("project")
          .select("id", { count: "exact", head: true })
          .eq("suppress_validation_alerts", false)
          .or("invoice.is.null,invoice.eq."),
        supabase
          .from("project")
          .select("id,name")
          .eq("suppress_validation_alerts", false)
          .or("invoice.is.null,invoice.eq.")
          .order("created_at", { ascending: false })
          .limit(MISSING_INVOICE_LIST_LIMIT),
      ]);

      if (countResult.error) {
        setErrorMsg(countResult.error.message);
        return;
      }

      if (listResult.error) {
        setErrorMsg(listResult.error.message);
        return;
      }

      setMissingInvoiceCount(countResult.count ?? 0);
      setMissingInvoiceProjects((listResult.data ?? []) as MissingInvoiceProject[]);
    };

    loadClients();
    loadMissingInvoiceInfo();
  }, [supabase]);

  useEffect(() => {
    if (clientsLoading) return;

    const loadProjects = async () => {
      setLoading(true);
      setErrorMsg("");

      if (selectedStatuses.length === 0) {
        setProjects([]);
        setTotalCount(0);
        setLoading(false);
        return;
      }

      const from = (currentPage - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const searchFilter = buildProjectSearchFilter(keyword, clients);
      const sortOption = SORT_OPTIONS.find((option) => option.value === sortValue) ?? SORT_OPTIONS[0];

      let query = supabase
        .from("project")
        .select(
          "id,project_no,name,client_id,status,invoice_amount,invoice_month,payment_due_date,invoice,planned_cost_approval_status,suppress_validation_alerts,created_at",
          { count: "exact" }
        )
        .in("status", selectedStatuses);

      if (searchFilter) {
        query = query.or(searchFilter);
      }

      const { data: projectData, error: projectError, count } = await query
        .order(sortOption.column, { ascending: sortOption.ascending, nullsFirst: false })
        .order("created_at", { ascending: false })
        .range(from, to);

      if (projectError) {
        setErrorMsg(projectError.message);
        setLoading(false);
        return;
      }

      setProjects((projectData ?? []) as Project[]);
      setTotalCount(count ?? 0);
      setLoading(false);
    };

    loadProjects();
  }, [clients, clientsLoading, currentPage, keyword, selectedStatuses, sortValue, supabase]);

  const clientMap = useMemo(() => new Map(clients.map((client) => [client.id, client.name])), [clients]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const pageStartIndex = (currentPage - 1) * PAGE_SIZE;
  const displayStart = totalCount === 0 ? 0 : pageStartIndex + 1;
  const displayEnd = Math.min(pageStartIndex + PAGE_SIZE, totalCount);
  const allStatusesSelected = selectedStatuses.length === STATUS_OPTIONS.length;

  useEffect(() => {
    setCurrentPage(1);
  }, [keyword, selectedStatuses, sortValue]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const toggleStatus = (status: number) => {
    setSelectedStatuses((current) =>
      current.includes(status)
        ? current.filter((value) => value !== status)
        : [...current, status].sort((a, b) => a - b)
    );
  };

  return (
    <main className={styles.page}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>案件一覧</h1>
        <div className={styles.pageHeaderLinks}>
          <Link href="/project/new" className={styles.btnRed}>
            ＋ 案件登録
          </Link>
        </div>
      </div>

      <div className={styles.topBorder} />

      {missingInvoiceCount > 0 && (
        <details className={styles.warningBox}>
          <summary className={styles.warningSummary}>請求書未登録の案件が {missingInvoiceCount}件あります</summary>
          <div className={styles.warningBody}>
            <ul className={styles.warningList}>
              {missingInvoiceProjects.map((project) => (
                <li key={project.id}>
                  <Link href={`/project/${project.id}`} className={styles.warningLink}>
                    {project.name}
                  </Link>
                </li>
              ))}
            </ul>
            {missingInvoiceCount > missingInvoiceProjects.length && (
              <p className={styles.warningMore}>他 {missingInvoiceCount - missingInvoiceProjects.length}件あります。</p>
            )}
          </div>
        </details>
      )}

      {errorMsg && <p className={styles.errorText}>{errorMsg}</p>}

      <div className={styles.controlPanel}>
        <div className={styles.searchRow}>
          <input
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            className={styles.searchInput}
            placeholder="案件名 / クライアント / ステータスで検索"
          />
          <label className={styles.sortLabel}>
            並べ替え
            <select value={sortValue} onChange={(event) => setSortValue(event.target.value)} className={styles.sortSelect}>
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className={styles.statusFilterBox}>
          <div className={styles.statusFilterHeader}>
            <span className={styles.statusFilterTitle}>ステータス</span>
            <button
              type="button"
              className={styles.filterMiniButton}
              onClick={() => setSelectedStatuses(allStatusesSelected ? [] : ALL_STATUS_VALUES)}
            >
              {allStatusesSelected ? "全解除" : "全選択"}
            </button>
          </div>
          <div className={styles.statusCheckboxGrid}>
            {STATUS_OPTIONS.map((status) => (
              <label key={status.value} className={styles.statusCheckboxLabel}>
                <input
                  type="checkbox"
                  checked={selectedStatuses.includes(status.value)}
                  onChange={() => toggleStatus(status.value)}
                />
                {status.label}
              </label>
            ))}
          </div>
        </div>
      </div>

      <div className={styles.tableFrame}>
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.thSmall}>#</th>
                <th className={styles.thSmall}>案件NO</th>
                <th className={styles.thWide}>案件名</th>
                <th className={styles.th}>クライアント</th>
                <th className={styles.th}>ステータス</th>
                <th className={styles.th}>請求額</th>
                <th className={styles.th}>請求月</th>
                <th className={styles.th}>支払期日</th>
                <th className={styles.th}>予定工数承認済み</th>
              </tr>
            </thead>
            <tbody>
              {loading || clientsLoading ? (
                <tr>
                  <td className={styles.td} colSpan={9}>
                    読み込み中...
                  </td>
                </tr>
              ) : projects.length === 0 ? (
                <tr>
                  <td className={styles.td} colSpan={9}>
                    案件がありません。
                  </td>
                </tr>
              ) : (
                projects.map((project, index) => (
                  <tr key={project.id}>
                    <td className={styles.tdSmall}>{pageStartIndex + index + 1}</td>
                    <td className={styles.tdSmall}>{project.project_no ?? "-"}</td>
                    <td className={styles.tdWide}>
                      <Link href={`/project/${project.id}`} className={styles.projectLink}>
                        {project.name}
                      </Link>
                    </td>
                    <td className={styles.td}>{project.client_id ? clientMap.get(project.client_id) ?? "-" : "-"}</td>
                    <td className={styles.td}>{statusLabel(project.status)}</td>
                    <td className={styles.td}>{fmtYen(project.invoice_amount)}</td>
                    <td className={styles.td}>{fmtMonth(project.invoice_month)}</td>
                    <td className={styles.td}>{fmtDate(project.payment_due_date)}</td>
                    <td className={styles.tdCenter}>{fmtPlannedCostApproved(project.planned_cost_approval_status)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      <div className={styles.paginationBar}>
        <div className={styles.paginationInfo}>
          {displayStart}〜{displayEnd}件 / 全{totalCount}件
        </div>
        <div className={styles.paginationControls}>
          <button
            type="button"
            className={styles.paginationButton}
            onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
            disabled={currentPage <= 1}
          >
            前へ
          </button>
          <span className={styles.paginationPage}>
            {currentPage} / {totalPages}
          </span>
          <button
            type="button"
            className={styles.paginationButton}
            onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
            disabled={currentPage >= totalPages}
          >
            次へ
          </button>
        </div>
      </div>

    </main>
  );
}
