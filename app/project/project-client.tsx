"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/app/utils/supabase/client";
import styles from "./project-client.module.css";

type Project = {
  id: string;
  name: string;
  client_id: string | null;
  status: number | null;
  invoice_amount: number | null;
  invoice_month: string | null;
  payment_due_date: string | null;
  invoice: string | null;
  created_at: string;
};

type Client = {
  id: string;
  name: string;
};

const STATUS_OPTIONS = [
  { value: 0, label: "保留" },
  { value: 1, label: "営業中" },
  { value: 2, label: "確定前" },
  { value: 3, label: "確定" },
  { value: 4, label: "進行中" },
  { value: 5, label: "完了" },
  { value: 6, label: "滞留" },
  { value: 7, label: "プリセールス(無償)" },
  { value: 8, label: "社内案件(無償)" },
] as const;

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

export default function ProjectClient() {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [keyword, setKeyword] = useState("");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setErrorMsg("");

      const [{ data: projectData, error: projectError }, { data: clientData, error: clientError }] =
        await Promise.all([
          supabase
            .from("project")
            .select("id,name,client_id,status,invoice_amount,invoice_month,payment_due_date,invoice,created_at")
            .order("created_at", { ascending: false }),
          supabase.from("client").select("id,name"),
        ]);

      if (projectError) {
        setErrorMsg(projectError.message);
        setLoading(false);
        return;
      }

      if (clientError) {
        setErrorMsg(clientError.message);
        setLoading(false);
        return;
      }

      setProjects((projectData ?? []) as Project[]);
      setClients((clientData ?? []) as Client[]);
      setLoading(false);
    };

    load();
  }, [supabase]);

  const clientMap = useMemo(() => new Map(clients.map((client) => [client.id, client.name])), [clients]);

  const rows = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();

    return projects.filter((project) => {
      if (!normalizedKeyword) return true;

      const clientName = project.client_id ? clientMap.get(project.client_id) ?? "" : "";
      const searchable = [project.name, clientName, statusLabel(project.status)].join(" ").toLowerCase();
      return searchable.includes(normalizedKeyword);
    });
  }, [clientMap, keyword, projects]);

  const missingInvoiceCount = useMemo(
    () => projects.filter((project) => !(project.invoice ?? "").trim()).length,
    [projects]
  );

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
              {projects
                .filter((project) => !(project.invoice ?? "").trim())
                .map((project) => (
                  <li key={project.id}>
                    <Link href={`/project/${project.id}`} className={styles.warningLink}>
                      {project.name}
                    </Link>
                  </li>
                ))}
            </ul>
          </div>
        </details>
      )}

      {errorMsg && <p className={styles.errorText}>{errorMsg}</p>}

      <div className={styles.searchRow}>
        <input
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          className={styles.searchInput}
          placeholder="案件名 / クライアント / ステータスで検索"
        />
      </div>

      <div className={styles.tableFrame}>
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.thSmall}>#</th>
                <th className={styles.thWide}>案件名</th>
                <th className={styles.th}>クライアント</th>
                <th className={styles.th}>ステータス</th>
                <th className={styles.th}>請求額</th>
                <th className={styles.th}>請求月</th>
                <th className={styles.th}>支払期日</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td className={styles.td} colSpan={7}>
                    読み込み中...
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td className={styles.td} colSpan={7}>
                    案件がありません。
                  </td>
                </tr>
              ) : (
                rows.map((project, index) => (
                  <tr key={project.id}>
                    <td className={styles.tdSmall}>{index + 1}</td>
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
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
