"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/app/utils/supabase/client";
import styles from "./report-client.module.css";

type ProjectOption = {
  id: string;
  name: string;
  client_name: string;
};

type ReportEntry = {
  id: string;
  work_date: string;
  hours: number | string;
  project_id: string;
  project?: {
    id: string;
    name: string | null;
    client?: {
      name: string | null;
    } | null;
  } | null;
};

type Profile = {
  id: string;
};

function addDaysISO(dateISO: string, delta: number) {
  const [y, m, d] = dateISO.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + delta);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function toJpLabel(dateISO: string) {
  const [y, m, d] = dateISO.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const w = ["日", "月", "火", "水", "木", "金", "土"][dt.getDay()];
  return `${y}/${String(m).padStart(2, "0")}/${String(d).padStart(2, "0")}（${w}）`;
}

function decimalHoursToParts(value: number | string | null | undefined) {
  const num = Number(value ?? 0);
  const safe = Number.isFinite(num) ? Math.max(0, num) : 0;
  const totalMinutes = Math.round(safe * 60);
  return {
    hours: String(Math.floor(totalMinutes / 60)),
    minutes: String(totalMinutes % 60),
  };
}

function partsToDecimalHours(hoursText: string, minutesText: string) {
  const hours = Number(hoursText.trim() || "0");
  const minutes = Number(minutesText.trim() || "0");
  if (!Number.isInteger(hours) || hours < 0) return null;
  if (!Number.isInteger(minutes) || minutes < 0 || minutes >= 60) return null;
  return Number((hours + minutes / 60).toFixed(2));
}

function formatHours(value: number | string) {
  const { hours, minutes } = decimalHoursToParts(value);
  return `${hours}時間${minutes}分`;
}

function sumHours(entries: ReportEntry[]) {
  const total = entries.reduce((acc, entry) => acc + (Number(entry.hours) || 0), 0);
  return formatHours(total);
}

function normalizeProjectRows(rows: any[]): ProjectOption[] {
  return rows.map((row) => ({
    id: row.id,
    name: row.name ?? "",
    client_name: row.client?.name ?? "",
  }));
}

function uniqueProjects(projects: ProjectOption[]) {
  const map = new Map<string, ProjectOption>();
  for (const project of projects) map.set(project.id, project);
  return Array.from(map.values());
}

export default function ReportClient({ initialDate }: { initialDate: string }) {
  const supabase = createClient();
  const router = useRouter();

  const [date, setDate] = useState(initialDate);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [profileId, setProfileId] = useState<string | null>(null);

  const [entries, setEntries] = useState<ReportEntry[]>([]);
  const [myProjects, setMyProjects] = useState<ProjectOption[]>([]);
  const [searchedProjects, setSearchedProjects] = useState<ProjectOption[]>([]);
  const [projectSearch, setProjectSearch] = useState("");
  const [searchingProject, setSearchingProject] = useState(false);

  const [openModal, setOpenModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formProjectId, setFormProjectId] = useState("");
  const [formHours, setFormHours] = useState("1");
  const [formMinutes, setFormMinutes] = useState("0");

  const editEntry = useMemo(() => entries.find((entry) => entry.id === editingId) ?? null, [entries, editingId]);

  useEffect(() => {
    setDate(initialDate);
  }, [initialDate]);

  useEffect(() => {
    const qs = new URLSearchParams({ date });
    router.replace(`/report?${qs.toString()}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  const loadEntries = async (currentProfileId: string, currentDate: string) => {
    const { data, error } = await supabase
      .from("report")
      .select(`
        id,
        work_date,
        hours,
        project_id,
        project:project_id (
          id,
          name,
          client:client_id ( name )
        )
      `)
      .eq("profile_id", currentProfileId)
      .eq("work_date", currentDate)
      .order("created_at", { ascending: true });

    if (error) throw new Error(error.message);
    setEntries(((data ?? []) as any) as ReportEntry[]);
  };

  const loadMyProjects = async (currentProfileId: string) => {
    const { data: relations, error: relationError } = await supabase
      .from("project_member")
      .select("project_id")
      .eq("profile_id", currentProfileId);

    if (relationError) throw new Error(relationError.message);

    const projectIds = Array.from(new Set((relations ?? []).map((item: any) => item.project_id).filter(Boolean)));
    if (projectIds.length === 0) {
      setMyProjects([]);
      return;
    }

    const { data: projects, error: projectError } = await supabase
      .from("project")
      .select(`id,name,client:client_id(name)`)
      .in("id", projectIds)
      .order("created_at", { ascending: true });

    if (projectError) throw new Error(projectError.message);
    setMyProjects(normalizeProjectRows((projects ?? []) as any[]));
  };

  const load = async () => {
    setLoading(true);
    setMsg("");

    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw new Error(authError.message);

      const authUserId = authData.user?.id;
      if (!authUserId) throw new Error("ログインユーザーを取得できません。再ログインしてください。");

      const { data: profile, error: profileError } = await supabase
        .from("profiles_2")
        .select("id")
        .eq("id", authUserId)
        .maybeSingle();

      if (profileError) throw new Error(profileError.message);
      if (!profile?.id) throw new Error("プロフィールが見つかりません。");

      const currentProfileId = (profile as Profile).id;
      setProfileId(currentProfileId);

      await Promise.all([loadEntries(currentProfileId, date), loadMyProjects(currentProfileId)]);
    } catch (error) {
      setMsg(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  useEffect(() => {
    const run = async () => {
      const text = projectSearch.trim();
      if (!text) {
        setSearchedProjects([]);
        return;
      }

      setSearchingProject(true);
      try {
        const { data, error } = await supabase
          .from("project")
          .select(`id,name,client:client_id(name)`)
          .ilike("name", `%${text}%`)
          .order("created_at", { ascending: false })
          .limit(20);

        if (error) throw new Error(error.message);
        setSearchedProjects(normalizeProjectRows((data ?? []) as any[]));
      } catch (error) {
        setMsg(error instanceof Error ? error.message : String(error));
      } finally {
        setSearchingProject(false);
      }
    };

    run();
  }, [projectSearch, supabase]);

  const selectableProjects = useMemo(() => {
    const base = projectSearch.trim() ? [...myProjects, ...searchedProjects] : myProjects;
    return uniqueProjects(base);
  }, [myProjects, projectSearch, searchedProjects]);

  const openAddModal = () => {
    setEditingId(null);
    setProjectSearch("");
    setFormProjectId(myProjects[0]?.id ?? "");
    setFormHours("1");
    setFormMinutes("0");
    setOpenModal(true);
  };

  const openEditModal = (id: string) => {
    const entry = entries.find((item) => item.id === id);
    if (!entry) return;

    const parts = decimalHoursToParts(entry.hours);
    setEditingId(id);
    setProjectSearch("");
    setFormProjectId(entry.project_id);
    setFormHours(parts.hours);
    setFormMinutes(parts.minutes);
    setOpenModal(true);
  };

  const closeModal = () => {
    setOpenModal(false);
    setEditingId(null);
  };

  const validate = () => {
    if (!formProjectId) return "案件を選択してください。";

    const decimalHours = partsToDecimalHours(formHours, formMinutes);
    if (decimalHours == null) return "時間・分を正しく入力してください。";
    if (decimalHours <= 0 || decimalHours > 24) return "時間は 0時間1分〜24時間 の範囲で入力してください。";

    return null;
  };

  const saveEntry = async () => {
    setMsg("");
    const validationError = validate();
    if (validationError) {
      setMsg(validationError);
      return;
    }

    if (!profileId) {
      setMsg("プロフィールが取得できません。再読み込みしてください。");
      return;
    }

    const decimalHours = partsToDecimalHours(formHours, formMinutes);
    if (decimalHours == null) {
      setMsg("時間・分を正しく入力してください。");
      return;
    }

    setSaving(true);
    try {
      const updaterId = profileId;

      if (editingId) {
        const { error } = await supabase
          .from("report")
          .update({
            project_id: formProjectId,
            hours: decimalHours,
            updated_by: updaterId,
          })
          .eq("id", editingId);

        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabase.from("report").insert({
          profile_id: profileId,
          project_id: formProjectId,
          work_date: date,
          hours: decimalHours,
          updated_by: updaterId,
        });

        if (error) throw new Error(error.message);
      }

      closeModal();
      await loadEntries(profileId, date);
    } catch (error) {
      setMsg(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  const deleteEntry = async (id: string) => {
    if (!confirm("この行を削除しますか？")) return;

    setMsg("");
    try {
      const { error } = await supabase.from("report").delete().eq("id", id);
      if (error) throw new Error(error.message);
      setEntries((current) => current.filter((item) => item.id !== id));
    } catch (error) {
      setMsg(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <main className={styles.page}>
      <h1 className={styles.pageTitle}>業務報告画面</h1>
      <div className={styles.topBorder} />

      <div className={styles.headerRow}>
        <div className={styles.dateArea}>
          <button type="button" onClick={() => setDate(addDaysISO(date, -1))} className={styles.btnArrow}>
            ◀
          </button>

          <div className={styles.dateLabel}>{toJpLabel(date)}</div>

          <button type="button" onClick={() => setDate(addDaysISO(date, 1))} className={styles.btnArrow}>
            ▶
          </button>

          <input type="date" value={date} onChange={(event) => setDate(event.target.value)} className={styles.dateInput} />
        </div>

        <div className={styles.headerButtons}>
          <button type="button" onClick={openAddModal} className={styles.btnRed} disabled={saving}>
            ＋ 業務を追加
          </button>
        </div>
      </div>

      <div className={styles.sectionTitle}>業務報告</div>

      <div className={styles.contentRow}>
        <div className={styles.tableArea}>
          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.th}>NO</th>
                  <th className={styles.th}>クライアント</th>
                  <th className={styles.th}>案件名</th>
                  <th className={styles.th}>時間</th>
                  <th className={styles.thActions}> </th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td className={styles.td} colSpan={5}>
                      読み込み中...
                    </td>
                  </tr>
                ) : entries.length === 0 ? (
                  <tr>
                    <td className={styles.td} colSpan={5}>
                      まだ登録がありません。
                    </td>
                  </tr>
                ) : (
                  entries.map((entry, index) => (
                    <tr key={entry.id}>
                      <td className={styles.tdNo}>{index + 1}</td>
                      <td className={styles.td}>{entry.project?.client?.name ?? ""}</td>
                      <td className={styles.td}>{entry.project?.name ?? ""}</td>
                      <td className={styles.tdTime}>{formatHours(entry.hours)}</td>
                      <td className={styles.tdActions}>
                        <div className={styles.actionButtons}>
                          <button type="button" onClick={() => openEditModal(entry.id)} className={styles.btnSmall}>
                            編集
                          </button>
                          <button type="button" onClick={() => deleteEntry(entry.id)} className={styles.btnSmall}>
                            削除
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className={styles.footerRow}>
            <div className={styles.totalHours}>合計勤務時間：{sumHours(entries)}</div>
          </div>

          {!loading && myProjects.length === 0 && (
            <p className={styles.helpText}>自分に紐づく案件がありません。案件検索を使うと他の案件も選択できます。</p>
          )}

          {msg && <p className={styles.errorText}>{msg}</p>}
        </div>
      </div>

      {openModal && (
        <div className={styles.modalOverlay} onClick={closeModal}>
          <div className={styles.modalCard} onClick={(event) => event.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>{editEntry ? "業務の編集" : "業務の追加"}</h2>
              <button type="button" onClick={closeModal} className={styles.btnX}>
                ✕
              </button>
            </div>

            <div className={styles.modalForm}>
              <div className={styles.formRow}>
                <div className={styles.formLabel}>案件検索</div>
                <div>
                  <input
                    value={projectSearch}
                    onChange={(event) => setProjectSearch(event.target.value)}
                    className={styles.input}
                    placeholder="案件名で検索"
                  />
                  <p className={styles.formHelpText}>
                    初期表示は自分に紐づく案件です。検索すると他の案件も選択肢に追加されます。
                    {searchingProject ? " 検索中..." : ""}
                  </p>
                </div>
              </div>

              <div className={styles.formRow}>
                <div className={styles.formLabel}>案件</div>
                <select value={formProjectId} onChange={(event) => setFormProjectId(event.target.value)} className={styles.select}>
                  <option value="">選択してください</option>
                  {selectableProjects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.client_name} / {project.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className={styles.formRow}>
                <div className={styles.formLabel}>作業時間</div>
                <div className={styles.timeInputRow}>
                  <input
                    value={formHours}
                    onChange={(event) => setFormHours(event.target.value.replace(/[^0-9]/g, ""))}
                    className={styles.inputSmall}
                    inputMode="numeric"
                    placeholder="1"
                  />
                  <span>時間</span>
                  <input
                    value={formMinutes}
                    onChange={(event) => setFormMinutes(event.target.value.replace(/[^0-9]/g, ""))}
                    className={styles.inputSmall}
                    inputMode="numeric"
                    placeholder="30"
                  />
                  <span>分</span>
                </div>
              </div>

              <div className={styles.modalButtonRow}>
                <button type="button" onClick={saveEntry} disabled={saving} className={styles.btnRed}>
                  {saving ? "保存中..." : editEntry ? "更新する" : "登録する"}
                </button>
              </div>

              {msg && <p className={styles.modalErrorText}>{msg}</p>}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
