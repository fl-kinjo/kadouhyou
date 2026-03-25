"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/app/utils/supabase/client";
import styles from "./job-roles-client.module.css";

type JobRoleRow = {
  id: string;
  name: string;
  unit_price: number | string | null;
  member_count: number | null;
  created_at: string;
};

function yen(v: number | string | null | undefined) {
  if (v == null) return "-";
  const n = typeof v === "string" ? Number(v) : v;
  if (!Number.isFinite(n)) return String(v);
  return Number(n).toLocaleString("ja-JP");
}

export default function JobRolesClient() {
  const supabase = createClient();

  const [rows, setRows] = useState<JobRoleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"create" | "edit">("create");
  const [editId, setEditId] = useState<string | null>(null);

  const [formName, setFormName] = useState("");
  const [priceMode, setPriceMode] = useState<"set" | "unset">("set");
  const [formUnitPrice, setFormUnitPrice] = useState("");

  const load = async () => {
    setLoading(true);
    setMsg("");

    try {
      const { data, error } = await supabase
        .from("job_roles_with_counts")
        .select("id,name,unit_price,member_count,created_at")
        .order("created_at", { ascending: true });

      if (error) throw new Error(error.message);
      setRows((data ?? []) as JobRoleRow[]);
    } catch (e: any) {
      setMsg(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openCreate = () => {
    setMode("create");
    setEditId(null);
    setFormName("");
    setPriceMode("set");
    setFormUnitPrice("");
    setMsg("");
    setOpen(true);
  };

  const openEdit = (row: JobRoleRow) => {
    setMode("edit");
    setEditId(row.id);
    setFormName(row.name ?? "");
    setPriceMode(row.unit_price == null ? "unset" : "set");
    setFormUnitPrice(row.unit_price == null ? "" : String(row.unit_price));
    setMsg("");
    setOpen(true);
  };

  const close = () => {
    setOpen(false);
    setEditId(null);
    setMsg("");
  };

  const save = async () => {
    setMsg("");

    const name = formName.trim();
    if (!name) return setMsg("職種名を入力してください。");

    let unitPrice: number | null = null;

    if (priceMode === "set") {
      const parsed = Number(formUnitPrice.replace(/,/g, "").trim());
      if (!Number.isFinite(parsed) || parsed < 0) {
        return setMsg("人月単価は0以上の数値で入力してください。");
      }
      unitPrice = parsed;
    }

    setSaving(true);

    try {
      if (mode === "create") {
        const { error } = await supabase.from("job_roles").insert({
          name,
          unit_price: unitPrice,
        });

        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabase
          .from("job_roles")
          .update({
            name,
            unit_price: unitPrice,
          })
          .eq("id", editId);

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

  const remove = async (row: JobRoleRow) => {
    const ok = window.confirm(`「${row.name}」を削除しますか？`);
    if (!ok) return;

    setMsg("");

    try {
      const { error } = await supabase.from("job_roles").delete().eq("id", row.id);
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
              <th className={styles.th}>人月単価</th>
              <th className={styles.th}>人数</th>
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
                    <Link href={`/job-roles/${r.id}`} className={styles.nameLink}>
                      {r.name}
                    </Link>
                  </td>
                  <td className={styles.td}>{r.unit_price == null ? "-" : yen(r.unit_price)}</td>
                  <td className={styles.td}>{r.member_count ?? 0}名</td>
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

                <div className={styles.formRowTop}>
                  <div className={styles.label}>人月単価</div>

                  <div className={styles.radioArea}>
                    <label className={styles.radioRow}>
                      <input
                        type="radio"
                        name="unit-price-mode"
                        checked={priceMode === "set"}
                        onChange={() => setPriceMode("set")}
                      />
                      <span className={styles.radioText}>設定あり</span>
                    </label>

                    {priceMode === "set" && (
                      <div className={styles.priceInputRow}>
                        <span className={styles.yenMark}>¥</span>
                        <input
                          value={formUnitPrice}
                          onChange={(e) => setFormUnitPrice(e.target.value)}
                          className={styles.priceInput}
                          placeholder="4000000"
                          inputMode="numeric"
                        />
                      </div>
                    )}

                    <label className={styles.radioRow}>
                      <input
                        type="radio"
                        name="unit-price-mode"
                        checked={priceMode === "unset"}
                        onChange={() => setPriceMode("unset")}
                      />
                      <span className={styles.radioText}>設定なし</span>
                    </label>
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