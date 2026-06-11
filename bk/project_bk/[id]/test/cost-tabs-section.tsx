"use client";

import { useState } from "react";
import PlannedCostSection from "../planned-cost-section";
import ActualCostSection from "../actual-cost-section";
import styles from "./cost-tabs-section.module.css";

type ProfileRow = {
  id: string;
  last_name: string | null;
  first_name: string | null;
  status: number | null;
};

type PartnerRow = {
  id: string;
  name: string;
};

type JobRow = {
  id: string;
  name: string;
};

type PlannedCostRow = {
  id: string;
  project_id: string;
  category: number;
  expense_name: string | null;
  partner_id: string | null;
  job_id: string | null;
  profile_id: string | null;
  operating_person_months: number | string | null;
  target_year_month: string;
  amount: number | null;
};

type ActualCostRow = {
  id: string;
  project_id: string;
  category: number;
  expense_name: string | null;
  partner_id: string | null;
  target_year_month: string;
  amount: number | string | null;
};

type ReportRow = {
  id: string;
  profile_id: string;
  project_id: string;
  work_date: string;
  hours: number | string | null;
};

type CostTab = "planned" | "actual";

export default function CostTabsSection({
  projectId,
  startDate,
  endDate,
  plannedCosts,
  actualCosts,
  reports,
  profiles,
  partners,
  jobs,
}: {
  projectId: string;
  startDate: string | null;
  endDate: string | null;
  plannedCosts: PlannedCostRow[];
  actualCosts: ActualCostRow[];
  reports: ReportRow[];
  profiles: ProfileRow[];
  partners: PartnerRow[];
  jobs: JobRow[];
}) {
  const [activeTab, setActiveTab] = useState<CostTab>("planned");
  const [openCreateSignal, setOpenCreateSignal] = useState(0);

  const openCreate = () => {
    setOpenCreateSignal((current) => current + 1);
  };

  return (
    <section className={styles.section}>
      <div className={styles.headerRow}>
        <h2 className={styles.title}>コスト（工数/経費）</h2>
        <button type="button" className={styles.addButton} onClick={openCreate}>
          コストの行を追加する
        </button>
      </div>

      <div className={styles.tabBar}>
        <button
          type="button"
          className={`${styles.tabButton} ${activeTab === "planned" ? styles.tabButtonActive : ""}`}
          onClick={() => setActiveTab("planned")}
        >
          予定コスト
        </button>
        <button
          type="button"
          className={`${styles.tabButton} ${activeTab === "actual" ? styles.tabButtonActive : ""}`}
          onClick={() => setActiveTab("actual")}
        >
          実績コスト
        </button>
      </div>

      <div className={styles.content}>
        {activeTab === "planned" ? (
          <PlannedCostSection
            projectId={projectId}
            startDate={startDate}
            endDate={endDate}
            initialCosts={plannedCosts}
            profiles={profiles}
            partners={partners}
            jobs={jobs}
            showHeader={false}
            openCreateSignal={openCreateSignal}
          />
        ) : (
          <ActualCostSection
            projectId={projectId}
            startDate={startDate}
            endDate={endDate}
            initialCosts={actualCosts}
            reports={reports}
            partners={partners}
            profiles={profiles}
            showHeader={false}
            openCreateSignal={openCreateSignal}
          />
        )}
      </div>
    </section>
  );
}