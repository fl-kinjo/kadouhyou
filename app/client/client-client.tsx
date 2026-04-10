"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/app/utils/supabase/client";
import styles from "./client-client.module.css";

type ClientRow = {
  id: string;
  name: string;
  is_focus: number | null;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
};

type ProfileRow = {
  id: string;
};

export default function ClientClient() {
  const supabase = createClient();

  const [rows, setRows] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [q, setQ] = useState("");
  const [focusOnly, setFocusOnly] = useState(false);

  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"create" | "edit">("create");
  const [editId, setEditId] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [formIsFocus, setFormIsFocus] = useState(false);

  const load = async () => {
    setLoading(true);
    setMsg("");

    try {
      const { data, error } = await supabase
        .from("client")
        .select("id,name,is_focus,created_at,updated_at,updated_by")
        .order("created_at", { ascending: true });

      if (error) throw new Error(error.message);
      setRows((data ?? []) as ClientRow[]);
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
    return rows.filter((row) => {
      if (focusOnly && row.is_focus !== 1) return false;
      if (!keyword) return true;
      return row.name.toLowerCase().includes(keyword);
    });
  }, [focusOnly, q, rows]);

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
    setFormIsFocus(false);
    setMsg("");
    setOpen(true);
  };

  const openEdit = (row: ClientRow) => {
    setMode("edit");
    setEditId(row.id);
    setFormName(row.name ?? "");
    setFormIsFocus(row.is_focus === 1);
    setMsg("");
    setOpen(true);
  };

  const close = () => {
    setOpen(false);
    setEditId(null);
    setFormName("");
    setFormIsFocus(false);
    setMsg("");
  };

  const save = async () => {
    setMsg("");

    const name = formName.trim();
    if (!name) return setMsg("クライアント名を入力してください。");

    setSaving(true);

    try {
      const profileId = await getCurrentProfileId();
      const payload = {
        name,
        is_focus: formIsFocus ? 1 : 0,
        updated_by: profileId,
      };

      if (mode === "create") {
        const { error } = await supabase.from("client").insert(payload);
        if (error) throw new Error(error.message);
      } else {
        if (!editId) throw new Error("編集対象が見つかりません。");
        const { error } = await supabase.from("client").update(payload).eq("id", editId);
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

  const remove = async (row: ClientRow) => {
    const ok = window.confirm(`「${row.name}」を削除しますか？`);
    if (!ok) return;

    setMsg("");

    try {
      const { error } = await supabase.from("client").delete().eq("id", row.id);
      if (error) throw new Error(error.message);
      await load();
    } catch (e: any) {
      setMsg(e?.message ?? String(e));
    }
  };

  return (
    <main className={styles.page}>
      <h1 className={styles.pageTitle}>クライアント管理</h1>
      <div className={styles.topBorder} />

      <div className={styles.actionsRow}>
        <div className={styles.actionsLeft}>
          <div className={styles.searchBox}>
            <span className={styles.searchIcon}>🔍</span>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="クライアント名"
              className={styles.searchInput}
            />
          </div>

          <label className={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={focusOnly}
              onChange={(e) => setFocusOnly(e.target.checked)}
            />
            <span>重点</span>
          </label>
        </div>

        <button type="button" onClick={openCreate} className={styles.btnRed}>
          ＋ 新規登録
        </button>
      </div>

      {msg && <p className={styles.errorText}>{msg}</p>}

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.th}>クライアント名</th>
              <th className={styles.thCenter}>重点</th>
              <th className={styles.th}>登録日</th>
              <th className={styles.thRight}></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className={styles.td} colSpan={4}>
                  読み込み中...
                </td>
              </tr>
            ) : filteredRows.length === 0 ? (
              <tr>
                <td className={styles.td} colSpan={4}>
                  クライアントがありません。
                </td>
              </tr>
            ) : (
              filteredRows.map((row) => (
                <tr key={row.id}>
                  <td className={styles.td}>{row.name}</td>
                  <td className={styles.tdCenter}>{row.is_focus === 1 ? "○" : "-"}</td>
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

      {open && (
        <div className={styles.modalOverlay} onClick={close}>
          <div className={styles.modalCard} onClick={(event) => event.stopPropagation()}>
            <button type="button" onClick={close} className={styles.btnX} aria-label="close">
              ✕
            </button>

            <h2 className={styles.modalTitle}>{mode === "edit" ? "クライアント編集" : "クライアント登録画面"}</h2>

            <div className={styles.modalForm}>
              <div className={styles.formRow}>
                <div className={styles.formLabel}>クライアント名</div>
                <input
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className={styles.input}
                />
              </div>

              <div className={styles.formRow}>
                <div className={styles.formLabel}>重点</div>
                <label className={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={formIsFocus}
                    onChange={(e) => setFormIsFocus(e.target.checked)}
                  />
                </label>
              </div>

              <div className={styles.modalButtonRow}>
                <button type="button" onClick={save} className={styles.btnRedBig} disabled={saving}>
                  {saving ? "保存中..." : mode === "edit" ? "更新する" : "登録する"}
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
