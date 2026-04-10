"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/app/utils/supabase/client";
import styles from "./job-client.module.css";

type JobRow = {
  id: string;
  name: string;
  monthly_unit_price: number | null;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
};

type ProfileRow = {
  id: string;
  status: number | null;
};

type ProfileJobRow = {
  profile_id: string;
  job_id: string;
};

function yen(v: number | null | undefined) {
  if (v == null) return "-";
  return Number(v).toLocaleString("ja-JP");
}

export default function JobClient() {
  const supabase = createClient();

  const [rows, setRows] = useState<JobRow[]>([]);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [profileJobs, setProfileJobs] = useState<ProfileJobRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"create" | "edit">("create");
  const [editId, setEditId] = useState<string | null>(null);

  const [formName, setFormName] = useState("");
  const [formMonthlyUnitPrice, setFormMonthlyUnitPrice] = useState("");

  const load = async () => {
    setLoading(true);
    setMsg("");

    try {
      const [
        { data: jobData, error: jobError },
        { data: profileJobData, error: profileJobError },
        { data: profileData, error: profileError },
      ] = await Promise.all([
        supabase
          .from("job")
          .select("id,name,monthly_unit_price,created_at,updated_at,updated_by")
          .order("created_at", { ascending: true }),
        supabase.from("profile_job").select("profile_id,job_id"),
        supabase.from("profiles_2").select("id,status"),
      ]);

      if (jobError) throw new Error(jobError.message);
      if (profileJobError) throw new Error(profileJobError.message);
      if (profileError) throw new Error(profileError.message);
      setRows((jobData ?? []) as JobRow[]);
      setProfiles((profileData ?? []) as ProfileRow[]);
      setProfileJobs((profileJobData ?? []) as ProfileJobRow[]);
    } catch (e: any) {
      setMsg(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const memberCountMap = useMemo(() => {
    const activeProfileIds = new Set(
      profiles.filter((profile) => profile.status !== 2).map((profile) => profile.id)
    );
    const counts = new Map<string, number>();

    for (const relation of profileJobs) {
      if (!activeProfileIds.has(relation.profile_id)) continue;
      counts.set(relation.job_id, (counts.get(relation.job_id) ?? 0) + 1);
    }

    return counts;
  }, [profileJobs, profiles]);

  const openCreate = () => {
    setMode("create");
    setEditId(null);
    setFormName("");
    setFormMonthlyUnitPrice("");
    setMsg("");
    setOpen(true);
  };

  const openEdit = (row: JobRow) => {
    setMode("edit");
    setEditId(row.id);
    setFormName(row.name ?? "");
    setFormMonthlyUnitPrice(row.monthly_unit_price == null ? "" : String(row.monthly_unit_price));
    setMsg("");
    setOpen(true);
  };

  const close = () => {
    setOpen(false);
    setEditId(null);
    setMsg("");
  };

  const getCurrentProfileId = async () => {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError) throw new Error(userError.message);
    if (!user) throw new Error("ログインユーザーを取得できませんでした。");

    const { data: profile, error: profileError } = await supabase
      .from("profiles_2")
      .select("id")
      .eq("id", user.id)
      .single();

    if (profileError) {
      throw new Error("profiles_2 にログインユーザーのプロフィールが見つかりません。");
    }

    return (profile as ProfileRow).id;
  };

  const save = async () => {
    setMsg("");

    const name = formName.trim();
    if (!name) return setMsg("職種名を入力してください。");

    const parsed = Number(formMonthlyUnitPrice.replace(/,/g, "").trim());
    if (!Number.isInteger(parsed) || parsed < 0) {
      return setMsg("人月単価は0以上の整数で入力してください。");
    }

    setSaving(true);

    try {
      const profileId = await getCurrentProfileId();
      const payload = {
        name,
        monthly_unit_price: parsed,
        updated_by: profileId,
      };

      if (mode === "create") {
        const { error } = await supabase.from("job").insert(payload);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabase.from("job").update(payload).eq("id", editId);
        if (error) throw new Error(error.message);
      }

      close();
      await load();
    } catch (e: any) {
      setMsg(e?.message ?? String(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (row: JobRow) => {
    const ok = window.confirm(`「${row.name}」を削除しますか？`);
    if (!ok) return;

    setMsg("");

    try {
      const { error } = await supabase.from("job").delete().eq("id", row.id);
      if (error) throw new Error(error.message);

      await load();
    } catch (e: any) {
      setMsg(e?.message ?? String(e));
    }
  };

  return (
    <section>
      <div className={styles.actionsRow}>
        <button type="button" onClick={openCreate} className={styles.btnRed}>
          ＋ 新規登録
        </button>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.th}>職種名</th>
              <th className={styles.th}>人数</th>
              <th className={styles.th}>人月単価</th>
              <th className={styles.th}></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className={styles.td} colSpan={4}>
                  読み込み中...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td className={styles.td} colSpan={4}>
                  まだ職種がありません。
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id}>
                  <td className={styles.td}>
                    <Link href={`/job/${r.id}`} className={styles.nameLink}>
                      {r.name}
                    </Link>
                  </td>
                  <td className={styles.td}>{memberCountMap.get(r.id) ?? 0}</td>
                  <td className={styles.td}>{yen(r.monthly_unit_price)}</td>
                  <td className={styles.tdRight}>
                    <div className={styles.operationButtons}>
                      <button type="button" onClick={() => openEdit(r)} className={styles.btnMini}>
                        編集
                      </button>
                      <button type="button" onClick={() => remove(r)} className={styles.btnMini}>
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

      {msg && !open && <p className={styles.errorText}>{msg}</p>}

      {open && (
        <div className={styles.overlay} onClick={close}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalInner}>
              <h2 className={styles.modalTitle}>{mode === "create" ? "職種登録" : "職種編集"}</h2>

              <div className={styles.formArea}>
                <div className={styles.formRow}>
                  <div className={styles.label}>職種名</div>
                  <input value={formName} onChange={(e) => setFormName(e.target.value)} className={styles.input} />
                </div>

                <div className={styles.formRow}>
                  <div className={styles.label}>人月単価</div>
                  <div className={styles.priceInputRow}>
                    <span className={styles.yenMark}>¥</span>
                    <input
                      value={formMonthlyUnitPrice}
                      onChange={(e) => setFormMonthlyUnitPrice(e.target.value)}
                      className={styles.priceInput}
                      inputMode="numeric"
                    />
                  </div>
                </div>

                {msg && <p className={styles.modalErrorText}>{msg}</p>}

                <div className={styles.buttonRow}>
                  <button type="button" onClick={save} disabled={saving} className={styles.btnRedLarge}>
                    {saving ? "保存中..." : mode === "create" ? "登録する" : "更新する"}
                  </button>

                  <button type="button" onClick={close} className={styles.btnCancel}>
                    キャンセル
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
