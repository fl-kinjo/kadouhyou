"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/app/utils/supabase/client";
import styles from "./partner-client.module.css";

type PartnerRow = {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
};

type ProfileRow = {
  id: string;
};

export default function PartnerClient() {
  const supabase = createClient();

  const [rows, setRows] = useState<PartnerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [q, setQ] = useState("");

  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"create" | "edit">("create");
  const [editId, setEditId] = useState<string | null>(null);
  const [formName, setFormName] = useState("");

  const load = async () => {
    setLoading(true);
    setMsg("");

    try {
      const { data, error } = await supabase
        .from("partner")
        .select("id,name,created_at,updated_at,updated_by")
        .order("created_at", { ascending: true });

      if (error) throw new Error(error.message);
      setRows((data ?? []) as PartnerRow[]);
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

  const filteredRows = useMemo(() => {
    const keyword = q.trim().toLowerCase();
    if (!keyword) return rows;
    return rows.filter((row) => row.name.toLowerCase().includes(keyword));
  }, [q, rows]);

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

  const openCreate = () => {
    setMode("create");
    setEditId(null);
    setFormName("");
    setMsg("");
    setOpen(true);
  };

  const openEdit = (row: PartnerRow) => {
    setMode("edit");
    setEditId(row.id);
    setFormName(row.name ?? "");
    setMsg("");
    setOpen(true);
  };

  const close = () => {
    setOpen(false);
    setEditId(null);
    setFormName("");
    setMsg("");
  };

  const save = async () => {
    setMsg("");

    const name = formName.trim();
    if (!name) return setMsg("パートナー名を入力してください。");

    setSaving(true);

    try {
      const profileId = await getCurrentProfileId();
      const payload = {
        name,
        updated_by: profileId,
      };

      if (mode === "create") {
        const { error } = await supabase.from("partner").insert(payload);
        if (error) throw new Error(error.message);
      } else {
        if (!editId) throw new Error("編集対象が見つかりません。");
        const { error } = await supabase.from("partner").update(payload).eq("id", editId);
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

  const remove = async (row: PartnerRow) => {
    const ok = window.confirm(`「${row.name}」を削除しますか？`);
    if (!ok) return;

    setMsg("");

    try {
      const { error } = await supabase.from("partner").delete().eq("id", row.id);
      if (error) throw new Error(error.message);
      await load();
    } catch (e: any) {
      setMsg(e?.message ?? String(e));
    }
  };

  return (
    <main className={styles.page}>
      <h1 className={styles.pageTitle}>パートナー管理</h1>
      <div className={styles.topBorder} />

      <div className={styles.actionsRow}>
        <div className={styles.searchBox}>
          <span className={styles.searchIcon}>🔍</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="パートナー名"
            className={styles.searchInput}
          />
        </div>

        <button type="button" onClick={openCreate} className={styles.btnRed}>
          ＋ 新規登録
        </button>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.th}>パートナー名</th>
              <th className={styles.th}>登録日</th>
              <th className={styles.th}></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className={styles.td} colSpan={3}>
                  読み込み中...
                </td>
              </tr>
            ) : filteredRows.length === 0 ? (
              <tr>
                <td className={styles.td} colSpan={3}>
                  パートナーがありません。
                </td>
              </tr>
            ) : (
              filteredRows.map((row) => (
                <tr key={row.id}>
                  <td className={styles.td}>{row.name}</td>
                  <td className={styles.td}>{new Date(row.created_at).toLocaleDateString("ja-JP")}</td>
                  <td className={styles.tdRight}>
                    <div className={styles.operationButtons}>
                      <button type="button" onClick={() => openEdit(row)} className={styles.btnMini}>
                        編集
                      </button>
                      <button type="button" onClick={() => remove(row)} className={styles.btnMini}>
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
              <h2 className={styles.modalTitle}>{mode === "create" ? "パートナー登録" : "パートナー編集"}</h2>

              <div className={styles.formArea}>
                <div className={styles.formRow}>
                  <div className={styles.label}>パートナー名</div>
                  <input value={formName} onChange={(e) => setFormName(e.target.value)} className={styles.input} />
                </div>

                <div className={styles.buttonRow}>
                  <button type="button" onClick={close} className={styles.btnCancel}>
                    キャンセル
                  </button>
                  <button type="button" onClick={save} className={styles.btnRedLarge} disabled={saving}>
                    {saving ? (mode === "create" ? "登録中..." : "更新中...") : mode === "create" ? "登録する" : "更新する"}
                  </button>
                </div>

                {msg && <p className={styles.modalErrorText}>{msg}</p>}
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
