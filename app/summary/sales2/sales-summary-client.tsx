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

type SnapshotRow = {
  project_id: string;
  name: string;
  client_id: string | null;
  project_manager_id: string | null;
  status: number | null;
  invoice_amount: number | null;
  project_created_at: string | null;
  week_end_date: string;
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

type TabKey = "previous" | "current";
type SectionKey =
  | "newAdded"
  | "increased"
  | "lost"
  | "decreased"
  | "won"
  | "unchanged";

type ComparableProject = {
  projectId: string;
  name: string;
  clientId: string | null;
  projectManagerId: string | null;
  status: number;
  invoiceAmount: number;
  createdAt: string | null;
};

type ChangeItem = {
  projectId: string;
  name: string;
  clientName: string;
  pmName: string;
  probabilityLabel: string;
  createdAtLabel: string;
  amount: number;
  note?: string;
};

type ChangeSection = {
  key: SectionKey;
  title: string;
  count: number;
  totalAmount: number;
  tone: "green" | "red" | "blue" | "neutral";
  items: ChangeItem[];
};

type ChangeSet = {
  currentPipelineTotal: number;
  previousPipelineTotal: number;
  newAdded: ChangeItem[];
  increased: ChangeItem[];
  lost: ChangeItem[];
  decreased: ChangeItem[];
  won: ChangeItem[];
  unchanged: ChangeItem[];
};

const HOLD_STATUS = 0;
const LOST_STATUS = 11;
const SALES_STATUSES = [1, 2, 3, 4] as const;

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

const SALES_STATUS_SHORT_LABELS: Record<number, string> = {
  1: "高",
  2: "中",
  3: "低",
  4: "最終調整",
};

function toSafeNumber(value: number | string | null | undefined): number {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num : 0;
}

function isSalesStatus(status: number | null | undefined): boolean {
  return SALES_STATUSES.includes((status ?? -1) as 1 | 2 | 3 | 4);
}

function fullName(profile?: ProfileRow | null): string {
  if (!profile) return "-";
  const name = `${profile.last_name ?? ""}${profile.first_name ?? ""}`.trim();
  return name || profile.email || "-";
}

function formatCurrency(value: number): string {
  return `¥${Math.round(value).toLocaleString("ja-JP")}`;
}

function formatSignedCurrency(value: number): string {
  const abs = Math.abs(Math.round(value)).toLocaleString("ja-JP");
  if (value > 0) return `+¥${abs}`;
  if (value < 0) return `-¥${abs}`;
  return "¥0";
}

function formatDateLabel(value: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, "0")}/${String(
    date.getDate()
  ).padStart(2, "0")}`;
}

function formatWeekEndLabel(value: string | null | undefined): string {
  if (!value) return "-";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  const start = new Date(date);
  start.setDate(date.getDate() - 6);
  return `${start.getFullYear()}/${start.getMonth() + 1}/${start.getDate()}〜${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
}

function sumAmounts(items: ChangeItem[]): number {
  return items.reduce((sum, item) => sum + item.amount, 0);
}

function buildMeta(
  project: ComparableProject,
  clientMap: Map<string, string>,
  profileMap: Map<string, ProfileRow>
) {
  const clientName = project.clientId ? clientMap.get(project.clientId) ?? "-" : "-";
  const pmName = project.projectManagerId
    ? fullName(profileMap.get(project.projectManagerId) ?? null)
    : "-";
  const probabilityLabel =
    SALES_STATUS_SHORT_LABELS[project.status] ?? PROJECT_STATUS_LABELS[project.status] ?? "-";
  const createdAtLabel = formatDateLabel(project.createdAt);

  return {
    projectId: project.projectId,
    name: project.name,
    clientName,
    pmName,
    probabilityLabel,
    createdAtLabel,
  };
}

function normalizeCurrentProjects(rows: ProjectRow[]): ComparableProject[] {
  return rows.map((row) => ({
    projectId: row.id,
    name: row.name,
    clientId: row.client_id,
    projectManagerId: row.project_manager_id,
    status: row.status ?? 0,
    invoiceAmount: toSafeNumber(row.invoice_amount),
    createdAt: row.created_at,
  }));
}

function normalizeSnapshots(rows: SnapshotRow[]): ComparableProject[] {
  return rows.map((row) => ({
    projectId: row.project_id,
    name: row.name,
    clientId: row.client_id,
    projectManagerId: row.project_manager_id,
    status: row.status ?? 0,
    invoiceAmount: toSafeNumber(row.invoice_amount),
    createdAt: row.project_created_at,
  }));
}

function buildChangeSet(
  previousList: ComparableProject[],
  currentList: ComparableProject[],
  clientMap: Map<string, string>,
  profileMap: Map<string, ProfileRow>
): ChangeSet {
  const previousMap = new Map(previousList.map((item) => [item.projectId, item]));
  const currentMap = new Map(currentList.map((item) => [item.projectId, item]));

  const currentPipelineTotal = currentList
    .filter((item) => isSalesStatus(item.status))
    .reduce((sum, item) => sum + item.invoiceAmount, 0);

  const previousPipelineTotal = previousList
    .filter((item) => isSalesStatus(item.status))
    .reduce((sum, item) => sum + item.invoiceAmount, 0);

  const newAdded: ChangeItem[] = [];
  const increased: ChangeItem[] = [];
  const lost: ChangeItem[] = [];
  const decreased: ChangeItem[] = [];
  const won: ChangeItem[] = [];
  const unchanged: ChangeItem[] = [];

  for (const current of currentList) {
    const prev = previousMap.get(current.projectId);
    const currentIsSales = isSalesStatus(current.status);
    const prevIsSales = prev ? isSalesStatus(prev.status) : false;

    if (currentIsSales) {
      if (!prevIsSales) {
        const meta = buildMeta(current, clientMap, profileMap);
        newAdded.push({
          ...meta,
          amount: current.invoiceAmount,
        });
        continue;
      }

      const diff = current.invoiceAmount - (prev?.invoiceAmount ?? 0);
      const meta = buildMeta(current, clientMap, profileMap);

      if (diff > 0) {
        increased.push({
          ...meta,
          amount: diff,
          note: `${formatCurrency(prev?.invoiceAmount ?? 0)} → ${formatCurrency(current.invoiceAmount)}`,
        });
      } else if (diff < 0) {
        decreased.push({
          ...meta,
          amount: Math.abs(diff),
          note: `${formatCurrency(prev?.invoiceAmount ?? 0)} → ${formatCurrency(current.invoiceAmount)}`,
        });
      } else {
        unchanged.push({
          ...meta,
          amount: current.invoiceAmount,
        });
      }
    }
  }

  for (const prev of previousList) {
    const current = currentMap.get(prev.projectId);
    const prevIsSales = isSalesStatus(prev.status);
    if (!prevIsSales) continue;

    if (!current) {
      const meta = buildMeta(prev, clientMap, profileMap);
      lost.push({
        ...meta,
        amount: prev.invoiceAmount,
        note: "案件が見つかりません",
      });
      continue;
    }

    const currentIsSales = isSalesStatus(current.status);
    if (currentIsSales) continue;

    const meta = buildMeta(prev, clientMap, profileMap);

    if (current.status === LOST_STATUS) {
      lost.push({
        ...meta,
        amount: prev.invoiceAmount,
        note: "失注",
      });
    } else if (current.status !== HOLD_STATUS) {
      won.push({
        ...meta,
        amount: prev.invoiceAmount,
        note: `現在ステータス：${PROJECT_STATUS_LABELS[current.status] ?? "-"}`,
      });
    }
  }

  return {
    currentPipelineTotal,
    previousPipelineTotal,
    newAdded,
    increased,
    lost,
    decreased,
    won,
    unchanged,
  };
}

export default function SalesSummaryClient() {
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [warningMsg, setWarningMsg] = useState("");

  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [snapshots, setSnapshots] = useState<SnapshotRow[]>([]);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);

  const [activeTab, setActiveTab] = useState<TabKey>("previous");
  const [openSections, setOpenSections] = useState<Record<SectionKey, boolean>>({
    newAdded: true,
    increased: true,
    lost: true,
    decreased: true,
    won: true,
    unchanged: false,
  });

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setErrorMsg("");
      setWarningMsg("");

      try {
        const [projectsRes, snapshotsRes, clientsRes, profilesRes] = await Promise.all([
          supabase
            .from("project")
            .select("id,name,client_id,project_manager_id,status,invoice_amount,created_at")
            .order("created_at", { ascending: false }),
          supabase
            .from("project_sales_weekly_snapshot")
            .select(
              "project_id,name,client_id,project_manager_id,status,invoice_amount,project_created_at,week_end_date"
            )
            .order("week_end_date", { ascending: false }),
          supabase.from("client").select("id,name").order("name", { ascending: true }),
          supabase
            .from("profiles_2")
            .select("id,last_name,first_name,email")
            .order("created_at", { ascending: true }),
        ]);

        if (projectsRes.error) throw new Error(projectsRes.error.message);
        if (snapshotsRes.error) throw new Error(snapshotsRes.error.message);
        if (clientsRes.error) throw new Error(clientsRes.error.message);
        if (profilesRes.error) throw new Error(profilesRes.error.message);

        setProjects((projectsRes.data ?? []) as ProjectRow[]);
        setSnapshots((snapshotsRes.data ?? []) as SnapshotRow[]);
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

  const snapshotDates = useMemo(() => {
    return Array.from(new Set(snapshots.map((row) => row.week_end_date))).sort((a, b) =>
      b.localeCompare(a, "ja")
    );
  }, [snapshots]);

  const latestSnapshotDate = snapshotDates[0] ?? null;
  const previousSnapshotDate = snapshotDates[1] ?? null;

  const latestSnapshotRows = useMemo(
    () => snapshots.filter((row) => row.week_end_date === latestSnapshotDate),
    [snapshots, latestSnapshotDate]
  );

  const previousSnapshotRows = useMemo(
    () => snapshots.filter((row) => row.week_end_date === previousSnapshotDate),
    [snapshots, previousSnapshotDate]
  );

  const currentComparableProjects = useMemo(() => normalizeCurrentProjects(projects), [projects]);
  const latestComparableProjects = useMemo(
    () => normalizeSnapshots(latestSnapshotRows),
    [latestSnapshotRows]
  );
  const previousComparableProjects = useMemo(
    () => normalizeSnapshots(previousSnapshotRows),
    [previousSnapshotRows]
  );

  const previousReport = useMemo(() => {
    if (!latestSnapshotDate || !previousSnapshotDate) return null;
    return buildChangeSet(previousComparableProjects, latestComparableProjects, clientMap, profileMap);
  }, [
    clientMap,
    latestComparableProjects,
    latestSnapshotDate,
    previousComparableProjects,
    previousSnapshotDate,
    profileMap,
  ]);

  const currentReport = useMemo(() => {
    if (!latestSnapshotDate) return null;
    return buildChangeSet(latestComparableProjects, currentComparableProjects, clientMap, profileMap);
  }, [clientMap, currentComparableProjects, latestComparableProjects, latestSnapshotDate, profileMap]);

  const activeReport = activeTab === "previous" ? previousReport : currentReport;

  const rangeLabel =
    activeTab === "previous"
      ? latestSnapshotDate && previousSnapshotDate
        ? `${formatWeekEndLabel(previousSnapshotDate)} → ${formatWeekEndLabel(latestSnapshotDate)}`
        : "-"
      : latestSnapshotDate
        ? `${formatWeekEndLabel(latestSnapshotDate)} → 現在`
        : "-";

  const sections = useMemo<ChangeSection[]>(() => {
    if (!activeReport) return [];

    return [
      {
        key: "newAdded",
        title: "新規追加",
        count: activeReport.newAdded.length,
        totalAmount: sumAmounts(activeReport.newAdded),
        tone: "green",
        items: activeReport.newAdded,
      },
      {
        key: "increased",
        title: "増額",
        count: activeReport.increased.length,
        totalAmount: sumAmounts(activeReport.increased),
        tone: "green",
        items: activeReport.increased,
      },
      {
        key: "lost",
        title: "失注",
        count: activeReport.lost.length,
        totalAmount: sumAmounts(activeReport.lost),
        tone: "red",
        items: activeReport.lost,
      },
      {
        key: "decreased",
        title: "減額",
        count: activeReport.decreased.length,
        totalAmount: sumAmounts(activeReport.decreased),
        tone: "red",
        items: activeReport.decreased,
      },
      {
        key: "won",
        title: "受注確定",
        count: activeReport.won.length,
        totalAmount: sumAmounts(activeReport.won),
        tone: "blue",
        items: activeReport.won,
      },
      {
        key: "unchanged",
        title: "変更なし",
        count: activeReport.unchanged.length,
        totalAmount: sumAmounts(activeReport.unchanged),
        tone: "neutral",
        items: activeReport.unchanged,
      },
    ];
  }, [activeReport]);

  const pipelineDiff = activeReport
    ? activeReport.currentPipelineTotal - activeReport.previousPipelineTotal
    : 0;

  const increaseTotal = activeReport
    ? sumAmounts(activeReport.newAdded) + sumAmounts(activeReport.increased)
    : 0;

  const decreaseTotal = activeReport
    ? sumAmounts(activeReport.lost) + sumAmounts(activeReport.decreased)
    : 0;

  const wonTotal = activeReport ? sumAmounts(activeReport.won) : 0;

  useEffect(() => {
    if (loading) return;

    if (snapshotDates.length === 0) {
      setWarningMsg("スナップショットがありません。先に snapshot を保存してください。");
      return;
    }

    if (snapshotDates.length === 1) {
      setWarningMsg("スナップショットが1回分しかないため、前週レポートはまだ表示できません。");
      return;
    }

    setWarningMsg("");
  }, [loading, snapshotDates]);

  const toggleSection = (key: SectionKey) => {
    setOpenSections((current) => ({
      ...current,
      [key]: !current[key],
    }));
  };

  return (
    <main className={styles.page}>
      <div className={styles.topRow}>
        <h1 className={styles.pageTitle}>営業サマリー</h1>
      </div>

      <div className={styles.topBorder} />

      {errorMsg && <p className={styles.errorText}>{errorMsg}</p>}
      {warningMsg && <p className={styles.warningText}>{warningMsg}</p>}

      <div className={styles.tabBar}>
        <button
          type="button"
          className={`${styles.tabButton} ${activeTab === "previous" ? styles.tabButtonActive : ""}`}
          onClick={() => setActiveTab("previous")}
        >
          前週レポート
        </button>
        <button
          type="button"
          className={`${styles.tabButton} ${activeTab === "current" ? styles.tabButtonActive : ""}`}
          onClick={() => setActiveTab("current")}
        >
          今週の速報
        </button>
      </div>

      <div className={styles.tabBorder} />

      <section className={styles.section}>
        <div className={styles.headerLine}>
          <div>
            <h2 className={styles.sectionTitle}>パイプライン推移</h2>
            <div className={styles.rangeSubText}>{rangeLabel}</div>
          </div>
        </div>

        <div className={styles.summaryGrid}>
          <div className={styles.bigSummaryCard}>
            <div className={styles.cardLabel}>パイプライン総額</div>
            <div className={styles.cardValue}>
              {loading || !activeReport ? "-" : formatCurrency(activeReport.currentPipelineTotal)}
            </div>
            <div className={styles.cardSubRow}>
              <span className={pipelineDiff >= 0 ? styles.amountGreen : styles.amountRed}>
                {loading || !activeReport ? "-" : formatSignedCurrency(pipelineDiff)}
              </span>
              <span className={styles.smallMuted}>
                前週：{loading || !activeReport ? "-" : formatCurrency(activeReport.previousPipelineTotal)}
              </span>
            </div>
          </div>

          <div className={styles.smallSummaryCard}>
            <div className={styles.smallCardBlock}>
              <div className={styles.cardLabel}>増加（新規+増額）</div>
              <div className={`${styles.cardValueSmall} ${styles.amountGreen}`}>
                {loading || !activeReport ? "-" : formatSignedCurrency(increaseTotal)}
              </div>
              <div className={styles.smallMuted}>
                新規{activeReport?.newAdded.length ?? 0}件・増額{activeReport?.increased.length ?? 0}件
              </div>
            </div>

            <div className={styles.smallCardBlock}>
              <div className={styles.cardLabel}>減少（失注+減額）</div>
              <div className={`${styles.cardValueSmall} ${styles.amountRed}`}>
                {loading || !activeReport ? "-" : `-${formatCurrency(decreaseTotal).replace("¥", "¥")}`}
              </div>
              <div className={styles.smallMuted}>
                失注{activeReport?.lost.length ?? 0}件・減額{activeReport?.decreased.length ?? 0}件
              </div>
            </div>

            <div className={styles.smallCardBlock}>
              <div className={styles.cardLabel}>受注確定</div>
              <div className={`${styles.cardValueSmall} ${styles.amountBlue}`}>
                {loading || !activeReport ? "-" : formatCurrency(wonTotal)}
              </div>
              <div className={styles.smallMuted}>
                {activeReport?.won.length ?? 0}件・パイプライン外
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.accordionSection}>
        {sections.map((section) => (
          <div key={section.key} className={styles.accordionBlock}>
            <button
              type="button"
              className={styles.accordionHeader}
              onClick={() => toggleSection(section.key)}
            >
              <div className={styles.accordionHeaderLeft}>
                <span className={styles.accordionTitle}>{section.title}</span>
                <span className={styles.accordionCount}>{section.count}件</span>
              </div>

              <div className={styles.accordionHeaderRight}>
                <span
                  className={
                    section.tone === "green"
                      ? styles.amountGreen
                      : section.tone === "red"
                        ? styles.amountRed
                        : section.tone === "blue"
                          ? styles.amountBlue
                          : styles.amountNeutral
                  }
                >
                  {section.tone === "red"
                    ? `-${formatCurrency(section.totalAmount).replace("¥", "¥")}`
                    : section.tone === "neutral"
                      ? formatCurrency(section.totalAmount)
                      : formatSignedCurrency(section.totalAmount)}
                </span>
                <span className={styles.chevron}>{openSections[section.key] ? "▾" : "▸"}</span>
              </div>
            </button>

            {openSections[section.key] && (
              <div className={styles.accordionBody}>
                {section.items.length === 0 ? (
                  <div className={styles.emptyRow}>対象案件がありません。</div>
                ) : (
                  section.items.map((item) => (
                    <div key={`${section.key}-${item.projectId}`} className={styles.itemRow}>
                      <div className={styles.itemTopRow}>
                        <Link
                          href={`/project/${item.projectId}`}
                          className={styles.itemTitleLink}
                        >
                          {item.name}
                        </Link>
                        <div
                          className={
                            section.tone === "green"
                              ? styles.amountGreen
                              : section.tone === "red"
                                ? styles.amountRed
                                : section.tone === "blue"
                                  ? styles.amountBlue
                                  : styles.amountNeutral
                          }
                        >
                          {section.tone === "red"
                            ? `-${formatCurrency(item.amount).replace("¥", "¥")}`
                            : section.tone === "neutral"
                              ? formatCurrency(item.amount)
                              : formatSignedCurrency(item.amount)}
                        </div>
                      </div>

                      <div className={styles.itemMeta}>
                        クライアント：{item.clientName}　PM：{item.pmName}　確度：{item.probabilityLabel}　
                        起票日：{item.createdAtLabel}
                      </div>

                      {item.note && <div className={styles.itemNote}>{item.note}</div>}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        ))}
      </section>
    </main>
  );
}