"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/app/utils/supabase/client";
import styles from "./report-client.module.css";

type ProjectOption = {
  id: string;
  client_name: string | null;
  project_name: string | null;
};

type WorkEntry = {
  id: string;
  work_date: string;
  hours: number;
  project_id: string;
  projects?: {
    id: string;
    client_name: string | null;
    project_name: string | null;
    project_no?: number | null;
  } | null;
};

function fmtHours(n: number) {
  return Number(n).toString();
}

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

function sumHours(entries: WorkEntry[]) {
  const s = entries.reduce((acc, e) => acc + (Number(e.hours) || 0), 0);
  return `${s}h`;
}

export default function ReportClient({ initialDate }: { initialDate: string }) {
  const supabase = createClient();
  const router = useRouter();

  const [date, setDate] = useState(initialDate);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [entries, setEntries] = useState<WorkEntry[]>([]);
  const [isVacation, setIsVacation] = useState(false);

  const [openAdd, setOpenAdd] = useState(false);
  const [openEditId, setOpenEditId] = useState<string | null>(null);

  const [formProjectId, setFormProjectId] = useState("");
  const [formHours, setFormHours] = useState("1");
  const [saving, setSaving] = useState(false);

  const editEntry = useMemo(() => entries.find((e) => e.id === openEditId) ?? null, [entries, openEditId]);

  useEffect(() => {
    setDate(initialDate);
  }, [initialDate]);

  useEffect(() => {
    const qs = new URLSearchParams({ date });
    router.replace(`/reports?${qs.toString()}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  useEffect(() => {
    (async () => {
      setMsg("");
      const { data: u } = await supabase.auth.getUser();
      const user = u.user;
      if (!user) return;

      const { data, error } = await supabase
        .from("project_members")
        .select(
          `
          project_id,
          projects:project_id (
            id,
            client_name,
            project_name,
            project_no
          )
        `
        )
        .eq("user_id", user.id);

      if (error) {
        setMsg(error.message);
        return;
      }

      const list: ProjectOption[] =
        (data ?? [])
          .map((r: any) => r.projects)
          .filter(Boolean)
          .map((p: any) => ({
            id: p.id,
            client_name: p.client_name ?? "",
            project_name: p.project_name ?? "",
          })) ?? [];

      const uniq = new Map<string, ProjectOption>();
      for (const p of list) uniq.set(p.id, p);
      setProjects(Array.from(uniq.values()));
    })();
  }, [supabase]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setMsg("");

      const { data: u } = await supabase.auth.getUser();
      const user = u.user;
      if (!user) {
        setLoading(false);
        return;
      }

      const [{ data: ents, error: e1 }, { data: vac, error: e2 }] = await Promise.all([
        supabase
          .from("work_entries")
          .select(
            `
            id, work_date, hours, project_id,
            projects:project_id ( id, client_name, project_name, project_no )
          `
          )
          .eq("user_id", user.id)
          .eq("work_date", date)
          .order("created_at", { ascending: true }),
        supabase.from("vacations").select("id").eq("user_id", user.id).eq("work_date", date).maybeSingle(),
      ]);

      if (e1) setMsg(e1.message);
      if (e2) setMsg((prev) => prev || e2.message);

      setEntries(((ents ?? []) as any) as WorkEntry[]);
      setIsVacation(!!vac?.id);

      setLoading(false);
    })();
  }, [date, supabase]);

  const openAddModal = () => {
    setFormProjectId(projects[0]?.id ?? "");
    setFormHours("1");
    setOpenEditId(null);
    setOpenAdd(true);
  };

  const openEditModal = (id: string) => {
    const e = entries.find((x) => x.id === id);
    if (!e) return;
    setFormProjectId(e.project_id);
    setFormHours(String(e.hours));
    setOpenAdd(true);
    setOpenEditId(id);
  };

  const closeModal = () => {
    setOpenAdd(false);
    setOpenEditId(null);
  };

  const saveEntry = async () => {
    setMsg("");
    const hours = Number(formHours);
    if (!formProjectId) return setMsg("案件を選択してください。");
    if (!Number.isFinite(hours) || hours <= 0 || hours > 24) return setMsg("時間は 0〜24 の範囲で入力してください。");

    setSaving(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const user = u.user;
      if (!user) throw new Error("未ログインです。");

      if (openEditId) {
        const { error } = await supabase
          .from("work_entries")
          .update({ project_id: formProjectId, hours })
          .eq("id", openEditId);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabase.from("work_entries").insert({
          user_id: user.id,
          work_date: date,
          project_id: formProjectId,
          hours,
        });
        if (error) throw new Error(error.message);
      }

      closeModal();

      const { data: ents, error: e1 } = await supabase
        .from("work_entries")
        .select(`id, work_date, hours, project_id, projects:project_id ( id, client_name, project_name, project_no )`)
        .eq("user_id", user.id)
        .eq("work_date", date)
        .order("created_at", { ascending: true });

      if (e1) throw new Error(e1.message);
      setEntries(((ents ?? []) as any) as WorkEntry[]);
    } catch (e: any) {
      setMsg(e?.message ?? String(e));
    } finally {
      setSaving(false);
    }
  };

  const deleteEntry = async (id: string) => {
    if (!confirm("この行を削除しますか？")) return;
    setMsg("");
    try {
      const { error } = await supabase.from("work_entries").delete().eq("id", id);
      if (error) throw new Error(error.message);
      setEntries((prev) => prev.filter((x) => x.id !== id));
    } catch (e: any) {
      setMsg(e?.message ?? String(e));
    }
  };

  const toggleVacation = async () => {
    setMsg("");
    setSaving(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const user = u.user;
      if (!user) throw new Error("未ログインです。");

      if (isVacation) {
        const { error } = await supabase.from("vacations").delete().eq("user_id", user.id).eq("work_date", date);
        if (error) throw new Error(error.message);
        setIsVacation(false);
      } else {
        const { error } = await supabase.from("vacations").insert({ user_id: user.id, work_date: date });
        if (error) throw new Error(error.message);
        setIsVacation(true);
      }
    } catch (e: any) {
      setMsg(e?.message ?? String(e));
    } finally {
      setSaving(false);
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

          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={styles.dateInput} />
        </div>

        <div className={styles.headerButtons}>
          <button type="button" onClick={toggleVacation} disabled={saving} className={styles.btnRedOutline}>
            {isVacation ? "休暇解除" : "休暇報告"}
          </button>
          <button type="button" onClick={() => alert("提出は次のステップで実装します")} className={styles.btnRed}>
            報告を提出する
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
                  entries.map((e, idx) => (
                    <tr key={e.id}>
                      <td className={styles.tdNo}>{idx + 1}</td>
                      <td className={styles.td}>{e.projects?.client_name ?? ""}</td>
                      <td className={styles.td}>{e.projects?.project_name ?? ""}</td>
                      <td className={styles.tdTime}>{fmtHours(e.hours)}</td>
                      <td className={styles.tdActions}>
                        <div className={styles.actionButtons}>
                          <button type="button" onClick={() => openEditModal(e.id)} className={styles.btnSmall}>
                            編集
                          </button>
                          <button type="button" onClick={() => deleteEntry(e.id)} className={styles.btnSmall}>
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
            <button type="button" onClick={openAddModal} className={styles.btnAdd} disabled={projects.length === 0}>
              ＋ 業務を追加
            </button>
            <div className={styles.totalHours}>合計勤務時間：{sumHours(entries)}</div>
          </div>

          {projects.length === 0 && (
            <p className={styles.errorText}>
              アサインされた案件がありません（project_members に紐づけが必要です）。
            </p>
          )}

          {msg && <p className={styles.errorText}>{msg}</p>}
        </div>
      </div>

      {openAdd && (
        <div className={styles.modalOverlay} onClick={closeModal}>
          <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>{openEditId ? "業務の編集" : "業務の追加"}</h2>
              <button type="button" onClick={closeModal} className={styles.btnX}>
                ✕
              </button>
            </div>

            <div className={styles.modalForm}>
              <div className={styles.formRow}>
                <div className={styles.formLabel}>案件</div>
                <select value={formProjectId} onChange={(e) => setFormProjectId(e.target.value)} className={styles.select}>
                  <option value="">選択してください</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.client_name ?? ""} / {p.project_name ?? ""}
                    </option>
                  ))}
                </select>
              </div>

              <div className={styles.formRow}>
                <div className={styles.formLabel}>時間</div>
                <input
                  value={formHours}
                  onChange={(e) => setFormHours(e.target.value)}
                  className={styles.input}
                  placeholder="例: 2.5"
                />
              </div>

              <div className={styles.modalButtonRow}>
                <button type="button" onClick={saveEntry} disabled={saving} className={styles.btnRed}>
                  {saving ? "保存中..." : "登録する"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}