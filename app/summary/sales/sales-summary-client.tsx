"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/app/utils/supabase/client";
import styles from "./sales-summary.module.css";

type ProjectRow = {
  id: string;
  name: string;
  client_id: string | null;
  project_manager_id: string | null;
  status: number | null;
  invoice_amount: number | null;
  created_at: string | null;
};

type ClientRow = {
  id: string;
  name: string;
};

type ProfileRow = {
  id: string;
  last_name: string | null;
  first_name: string | null;
  email: string | null;
};

type RangeType = "week" | "month" | "year";
type AnalysisTab = "client" | "pm";
type StatusFilter = "all" | 1 | 2 | 3 | 4;

type PeriodBucket = {
  key: string;
  label: string;
  start: Date;
  end: Date;
};

const SALES_STATUS_LABELS: Record<number, string> = {
  1: "高",
  2: "中",
  3: "低",
  4: "最終調整",
};

const SALES_STATUS_FULL_LABELS: Record<number, string> = {
  1: "営業中（高）",
  2: "営業中（中）",
  3: "営業中（低）",
  4: "営業中（最終調整）",
};

const SALES_STATUS_VALUES = [1, 2, 3, 4] as const;
const PERIOD_OPTIONS = [4, 6, 8, 12] as const;

function toSafeNumber(value: number | string | null | undefined): number {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num : 0;
}

function fullName(profile?: ProfileRow | null): string {
  if (!profile) return "-";
  const name = `${profile.last_name ?? ""}${profile.first_name ?? ""}`.trim();
  return name || profile.email || "-";
}

function formatCurrency(value: number): string {
  return `¥${Math.round(value).toLocaleString("ja-JP")}`;
}

function formatPercent(value: number): string {
  const sign = value > 0 ? "+" : value < 0 ? "" : "±";
  return `${sign}${value.toFixed(2)}%`;
}

function formatDateText(value: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
}

function startOfWeek(date: Date): Date {
  const result = new Date(date);
  const day = result.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  result.setDate(result.getDate() + diff);
  result.setHours(0, 0, 0, 0);
  return result;
}

function endOfWeek(date: Date): Date {
  const result = startOfWeek(date);
  result.setDate(result.getDate() + 6);
  result.setHours(23, 59, 59, 999);
  return result;
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
}

function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

function startOfYear(date: Date): Date {
  return new Date(date.getFullYear(), 0, 1, 0, 0, 0, 0);
}

function endOfYear(date: Date): Date {
  return new Date(date.getFullYear(), 11, 31, 23, 59, 59, 999);
}

function addWeeks(date: Date, amount: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + amount * 7);
  return result;
}

function addMonths(date: Date, amount: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function addYears(date: Date, amount: number): Date {
  return new Date(date.getFullYear() + amount, 0, 1);
}

function buildPeriodBuckets(baseDate: Date, rangeType: RangeType, periodCount: number): PeriodBucket[] {
  const buckets: PeriodBucket[] = [];

  for (let index = 0; index < periodCount; index += 1) {
    if (rangeType === "week") {
      const targetDate = addWeeks(baseDate, -index);
      const start = startOfWeek(targetDate);
      const end = endOfWeek(targetDate);
      const label = `${start.getMonth() + 1}/${start.getDate()}-${end.getMonth() + 1}/${end.getDate()}`;

      buckets.push({
        key: `week-${start.toISOString()}`,
        label,
        start,
        end,
      });
      continue;
    }

    if (rangeType === "month") {
      const targetDate = addMonths(baseDate, -index);
      const start = startOfMonth(targetDate);
      const end = endOfMonth(targetDate);
      const label = `${start.getFullYear()}/${String(start.getMonth() + 1).padStart(2, "0")}`;

      buckets.push({
        key: `month-${start.toISOString()}`,
        label,
        start,
        end,
      });
      continue;
    }

    const targetDate = addYears(baseDate, -index);
    const start = startOfYear(targetDate);
    const end = endOfYear(targetDate);
    const label = `${start.getFullYear()}年`;

    buckets.push({
      key: `year-${start.toISOString()}`,
      label,
      start,
      end,
    });
  }

  return buckets;
}

function isInRange(dateText: string | null, start: Date, end: Date): boolean {
  if (!dateText) return false;
  const date = new Date(dateText);
  if (Number.isNaN(date.getTime())) return false;
  return date >= start && date <= end;
}

function calcPreviousRatio(currentAmount: number, previousAmount: number): number {
  if (previousAmount === 0 && currentAmount === 0) return 0;
  if (previousAmount === 0) return 100;
  return ((currentAmount - previousAmount) / previousAmount) * 100;
}

export default function SalesSummaryClient() {
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);

  const [rangeType, setRangeType] = useState<RangeType>("week");
  const [periodCount, setPeriodCount] = useState<number>(4);
  const [analysisTab, setAnalysisTab] = useState<AnalysisTab>("client");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setErrorMsg("");

      try {
        const [projectsRes, clientsRes, profilesRes] = await Promise.all([
          supabase
            .from("project")
            .select("id,name,client_id,project_manager_id,status,invoice_amount,created_at")
            .in("status", [1, 2, 3, 4])
            .order("created_at", { ascending: false }),
          supabase.from("client").select("id,name").order("name", { ascending: true }),
          supabase
            .from("profiles_2")
            .select("id,last_name,first_name,email")
            .order("created_at", { ascending: true }),
        ]);

        if (projectsRes.error) throw new Error(projectsRes.error.message);
        if (clientsRes.error) throw new Error(clientsRes.error.message);
        if (profilesRes.error) throw new Error(profilesRes.error.message);

        setProjects((projectsRes.data ?? []) as ProjectRow[]);
        setClients((clientsRes.data ?? []) as ClientRow[]);
        setProfiles((profilesRes.data ?? []) as ProfileRow[]);
      } catch (error) {
        setErrorMsg(error instanceof Error ? error.message : String(error));
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [supabase]);

  const clientMap = useMemo(
    () => new Map(clients.map((client) => [client.id, client.name])),
    [clients]
  );

  const profileMap = useMemo(
    () => new Map(profiles.map((profile) => [profile.id, profile])),
    [profiles]
  );

  const activeSalesProjects = useMemo(
    () => projects.filter((project) => SALES_STATUS_VALUES.includes((project.status ?? 0) as 1 | 2 | 3 | 4)),
    [projects]
  );

  const salesTotalAmount = useMemo(
    () => activeSalesProjects.reduce((sum, project) => sum + toSafeNumber(project.invoice_amount), 0),
    [activeSalesProjects]
  );

  const thisWeekRange = useMemo(() => {
    const now = new Date();
    return {
      start: startOfWeek(now),
      end: endOfWeek(now),
    };
  }, []);

  const thisWeekNewProjects = useMemo(
    () =>
      activeSalesProjects.filter((project) =>
        isInRange(project.created_at, thisWeekRange.start, thisWeekRange.end)
      ),
    [activeSalesProjects, thisWeekRange]
  );

  const thisWeekNewAmount = useMemo(
    () => thisWeekNewProjects.reduce((sum, project) => sum + toSafeNumber(project.invoice_amount), 0),
    [thisWeekNewProjects]
  );

  const periodBuckets = useMemo(
    () => buildPeriodBuckets(new Date(), rangeType, periodCount),
    [rangeType, periodCount]
  );

  const reportRows = useMemo(() => {
    return periodBuckets.map((bucket, index) => {
      const currentProjects = activeSalesProjects.filter((project) =>
        isInRange(project.created_at, bucket.start, bucket.end)
      );
      const previousBucket = periodBuckets[index + 1];
      const previousProjects = previousBucket
        ? activeSalesProjects.filter((project) =>
            isInRange(project.created_at, previousBucket.start, previousBucket.end)
          )
        : [];

      const currentAmount = currentProjects.reduce(
        (sum, project) => sum + toSafeNumber(project.invoice_amount),
        0
      );
      const previousAmount = previousProjects.reduce(
        (sum, project) => sum + toSafeNumber(project.invoice_amount),
        0
      );

      return {
        key: bucket.key,
        label: bucket.label,
        amount: currentAmount,
        count: currentProjects.length,
        previousRatio: calcPreviousRatio(currentAmount, previousAmount),
      };
    });
  }, [activeSalesProjects, periodBuckets]);

  const analysisRange = useMemo(() => {
    if (periodBuckets.length === 0) return null;
    return {
      start: periodBuckets[periodBuckets.length - 1].start,
      end: periodBuckets[0].end,
    };
  }, [periodBuckets]);

  const analysisProjects = useMemo(() => {
    if (!analysisRange) return [];
    return activeSalesProjects.filter((project) =>
      isInRange(project.created_at, analysisRange.start, analysisRange.end)
    );
  }, [activeSalesProjects, analysisRange]);

  const analysisTotalAmount = useMemo(
    () => analysisProjects.reduce((sum, project) => sum + toSafeNumber(project.invoice_amount), 0),
    [analysisProjects]
  );

  const clientAnalysisRows = useMemo(() => {
    const map = new Map<string, { name: string; amount: number; count: number }>();

    for (const project of analysisProjects) {
      const key = project.client_id ?? "unknown";
      const name = project.client_id ? clientMap.get(project.client_id) ?? "-" : "-";
      const current = map.get(key) ?? { name, amount: 0, count: 0 };
      current.amount += toSafeNumber(project.invoice_amount);
      current.count += 1;
      map.set(key, current);
    }

    return Array.from(map.values())
      .map((row) => ({
        ...row,
        ratio: analysisTotalAmount > 0 ? (row.amount / analysisTotalAmount) * 100 : 0,
      }))
      .sort((a, b) => b.amount - a.amount);
  }, [analysisProjects, analysisTotalAmount, clientMap]);

  const pmAnalysisRows = useMemo(() => {
    const map = new Map<string, { name: string; amount: number; count: number }>();

    for (const project of analysisProjects) {
      const key = project.project_manager_id ?? "unknown";
      const name = project.project_manager_id
        ? fullName(profileMap.get(project.project_manager_id) ?? null)
        : "-";
      const current = map.get(key) ?? { name, amount: 0, count: 0 };
      current.amount += toSafeNumber(project.invoice_amount);
      current.count += 1;
      map.set(key, current);
    }

    return Array.from(map.values())
      .map((row) => ({
        ...row,
        ratio: analysisTotalAmount > 0 ? (row.amount / analysisTotalAmount) * 100 : 0,
      }))
      .sort((a, b) => b.amount - a.amount);
  }, [analysisProjects, analysisTotalAmount, profileMap]);

  const filteredProjectList = useMemo(() => {
    return activeSalesProjects
      .filter((project) => (statusFilter === "all" ? true : project.status === statusFilter))
      .sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? ""), "ja"))
      .map((project) => ({
        ...project,
        clientName: project.client_id ? clientMap.get(project.client_id) ?? "-" : "-",
        pmName: project.project_manager_id
          ? fullName(profileMap.get(project.project_manager_id) ?? null)
          : "-",
      }));
  }, [activeSalesProjects, statusFilter, clientMap, profileMap]);

  return (
    <main className={styles.page}>
      <div className={styles.topRow}>
        <h1 className={styles.pageTitle}>営業サマリー</h1>
      </div>

      <div className={styles.topBorder} />

      {errorMsg && <p className={styles.errorText}>{errorMsg}</p>}

      <div className={styles.controlRow}>
        <div className={styles.modeButtonGroup}>
          <button
            type="button"
            className={`${styles.modeButton} ${rangeType === "week" ? styles.modeButtonActive : ""}`}
            onClick={() => setRangeType("week")}
          >
            週
          </button>
          <button
            type="button"
            className={`${styles.modeButton} ${rangeType === "month" ? styles.modeButtonActive : ""}`}
            onClick={() => setRangeType("month")}
          >
            月
          </button>
          <button
            type="button"
            className={`${styles.modeButton} ${rangeType === "year" ? styles.modeButtonActive : ""}`}
            onClick={() => setRangeType("year")}
          >
            年
          </button>
        </div>

        <div className={styles.periodSelectWrap}>
          <select
            value={String(periodCount)}
            onChange={(event) => setPeriodCount(Number(event.target.value))}
            className={styles.select}
          >
            {PERIOD_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}期間
              </option>
            ))}
          </select>
        </div>
      </div>

      <section className={styles.summaryCardRow}>
        <div className={styles.summaryCard}>
          <div className={styles.summaryLabel}>営業案件総額</div>
          <div className={styles.summaryValue}>
            {loading ? "-" : formatCurrency(salesTotalAmount)}
          </div>
          <div className={styles.summarySub}>案件数：{loading ? "-" : `${activeSalesProjects.length}件`}</div>
        </div>

        <div className={styles.summaryCard}>
          <div className={styles.summaryLabel}>今週の新規獲得案件</div>
          <div className={styles.summaryValue}>
            {loading ? "-" : formatCurrency(thisWeekNewAmount)}
          </div>
          <div className={styles.summarySub}>案件数：{loading ? "-" : `${thisWeekNewProjects.length}件`}</div>
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>
          {rangeType === "week"
            ? "週次営業案件レポート"
            : rangeType === "month"
              ? "月次営業案件レポート"
              : "年次営業案件レポート"}
        </h2>

        <div className={styles.tableFrame}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{rangeType === "week" ? "週" : rangeType === "month" ? "月" : "年"}</th>
                <th>見込み額</th>
                <th>前週比</th>
                <th>件数</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={4}>読み込み中...</td>
                </tr>
              ) : reportRows.length === 0 ? (
                <tr>
                  <td colSpan={4}>対象データがありません。</td>
                </tr>
              ) : (
                reportRows.map((row) => (
                  <tr key={row.key}>
                    <td>{row.label}</td>
                    <td>{formatCurrency(row.amount)}</td>
                    <td>{formatPercent(row.previousRatio)}</td>
                    <td>{row.count}件</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>営業分析</h2>

        <div className={styles.analysisTabBar}>
          <button
            type="button"
            className={`${styles.analysisTabButton} ${
              analysisTab === "client" ? styles.analysisTabButtonActive : ""
            }`}
            onClick={() => setAnalysisTab("client")}
          >
            クライアント別
          </button>
          <button
            type="button"
            className={`${styles.analysisTabButton} ${
              analysisTab === "pm" ? styles.analysisTabButtonActive : ""
            }`}
            onClick={() => setAnalysisTab("pm")}
          >
            PM別
          </button>
        </div>

        <div className={styles.analysisTabBorder} />

        <div className={styles.tableFrame}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{analysisTab === "client" ? "クライアント名" : "PM名"}</th>
                <th>金額</th>
                <th>比率</th>
                <th>件数</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={4}>読み込み中...</td>
                </tr>
              ) : (analysisTab === "client" ? clientAnalysisRows : pmAnalysisRows).length === 0 ? (
                <tr>
                  <td colSpan={4}>対象データがありません。</td>
                </tr>
              ) : (
                (analysisTab === "client" ? clientAnalysisRows : pmAnalysisRows).map((row, index) => (
                  <tr key={`${row.name}-${index}`}>
                    <td>{row.name}</td>
                    <td>{formatCurrency(row.amount)}</td>
                    <td>{row.ratio.toFixed(2)}%</td>
                    <td>{row.count}件</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.listHeaderRow}>
          <h2 className={styles.sectionTitle}>営業案件一覧</h2>

          <div className={styles.statusFilterGroup}>
            <button
              type="button"
              className={`${styles.statusFilterButton} ${
                statusFilter === "all" ? styles.statusFilterButtonActive : ""
              }`}
              onClick={() => setStatusFilter("all")}
            >
              すべて
            </button>
            <button
              type="button"
              className={`${styles.statusFilterButton} ${
                statusFilter === 3 ? styles.statusFilterButtonActive : ""
              }`}
              onClick={() => setStatusFilter(3)}
            >
              低
            </button>
            <button
              type="button"
              className={`${styles.statusFilterButton} ${
                statusFilter === 2 ? styles.statusFilterButtonActive : ""
              }`}
              onClick={() => setStatusFilter(2)}
            >
              中
            </button>
            <button
              type="button"
              className={`${styles.statusFilterButton} ${
                statusFilter === 1 ? styles.statusFilterButtonActive : ""
              }`}
              onClick={() => setStatusFilter(1)}
            >
              高
            </button>
            <button
              type="button"
              className={`${styles.statusFilterButton} ${
                statusFilter === 4 ? styles.statusFilterButtonActive : ""
              }`}
              onClick={() => setStatusFilter(4)}
            >
              最終調整
            </button>
          </div>
        </div>

        <div className={styles.tableFrame}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>案件名</th>
                <th>クライアント</th>
                <th>PM</th>
                <th>見込み額</th>
                <th>ステータス</th>
                <th>登録日</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7}>読み込み中...</td>
                </tr>
              ) : filteredProjectList.length === 0 ? (
                <tr>
                  <td colSpan={7}>対象案件がありません。</td>
                </tr>
              ) : (
                filteredProjectList.map((project) => (
                  <tr key={project.id}>
                    <td>{project.name}</td>
                    <td>{project.clientName}</td>
                    <td>{project.pmName}</td>
                    <td>{formatCurrency(toSafeNumber(project.invoice_amount))}</td>
                    <td>{SALES_STATUS_LABELS[project.status ?? 0] ?? "-"}</td>
                    <td>{formatDateText(project.created_at)}</td>
                    <td>
                      <Link href={`/project/${project.id}`} className={styles.detailButton}>
                        詳細
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}