"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/app/utils/supabase/client";
import styles from "./clients-client.module.css";

type ClientRow = {
  id: string;
  name: string;
  is_focus: boolean;
  created_at: string;
};

type YearlyRow = {
  client_id: string;
  client_name: string;
  is_focus: boolean;
  year: number | null;
  total_invoice_amount: number | string | null;
};

function yen(v: number | string | null | undefined) {
  if (v == null) return "";
  const n = typeof v === "string" ? Number(v) : v;
  if (!Number.isFinite(n)) return String(v);
  return n.toLocaleString("ja-JP");
}

export default function ClientsClient() {
  const supabase = createClient();

  const [q, setQ] = useState("");
  const [focusOnly, setFocusOnly] = useState(false);

  const [clients, setClients] = useState<ClientRow[]>([]);
  const [yearly, setYearly] = useState<YearlyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newFocus, setNewFocus] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    setMsg("");

    const { data: c, error: e1 } = await supabase
      .from("clients")
      .select("id,name,is_focus,created_at")
      .order("name", { ascending: true });

    if (e1) {
      setMsg(e1.message);
      setClients([]);
      setYearly([]);
      setLoading(false);
      return;
    }

    const { data: y, error: e2 } = await supabase
      .from("client_yearly_invoices")
      .select("client_id,client_name,is_focus,year,total_invoice_amount");

    if (e2) {
      setMsg(e2.message);
      setClients((c ?? []) as ClientRow[]);
      setYearly([]);
      setLoading(false);
      return;
    }

    setClients((c ?? []) as ClientRow[]);
    setYearly((y ?? []) as YearlyRow[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const filteredClients = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return clients.filter((c) => {
      if (focusOnly && !c.is_focus) return false;
      if (!kw) return true;
      return c.name.toLowerCase().includes(kw);
    });
  }, [clients, q, focusOnly]);

  const years = useMemo(() => {
    const set = new Set<number>();
    for (const r of yearly) {
      if (typeof r.year === "number") set.add(r.year);
    }
    return Array.from(set).sort((a, b) => a - b);
  }, [yearly]);

  const yearlyMap = useMemo(() => {
    const m = new Map<string, Map<number, number>>();
    for (const r of yearly) {
      if (!r.client_id || typeof r.year !== "number") continue;
      const amount =
        typeof r.total_invoice_amount === "string"
          ? Number(r.total_invoice_amount)
          : (r.total_invoice_amount ?? 0);
      if (!m.has(r.client_id)) m.set(r.client_id, new Map());
      m.get(r.client_id)!.set(r.year, amount);
    }
    return m;
  }, [yearly]);

  const openModal = () => {
    setNewName("");
    setNewFocus(false);
    setMsg("");
    setOpen(true);
  };

  const closeModal = () => setOpen(false);

  const createClientRow = async () => {
    setMsg("");
    const name = newName.trim();
    if (!name) return setMsg("クライアント名を入力してください。");

    setSaving(true);
    try {
      const { error } = await supabase.from("clients").insert({
        name,
        is_focus: newFocus,
      });

      if (error) throw new Error(error.message);

      closeModal();
      await load();
    } catch (e: any) {
      setMsg(e?.message ?? String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className={styles.page}>
      <h1 className={styles.pageTitle}>クライアント管理画面</h1>

      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <div className={styles.searchWrap}>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="クライアント名"
              className={styles.searchInput}
            />
            <button type="button" onClick={() => load()} className={styles.searchBtn} title="検索">
              🔍
            </button>
          </div>

          <label className={styles.chkLabel}>
            <span className={styles.chkText}>すべて</span>
            <input type="checkbox" checked={!focusOnly} onChange={() => setFocusOnly(false)} />
          </label>

          <label className={styles.chkLabel}>
            <span className={styles.chkText}>重点</span>
            <input type="checkbox" checked={focusOnly} onChange={(e) => setFocusOnly(e.target.checked)} />
          </label>
        </div>

        <button type="button" onClick={openModal} className={styles.btnRed}>
          ＋ クライアント登録
        </button>
      </div>

      <div className={styles.topBorder} />

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.thLeft}>クライアント名</th>
              <th className={styles.thCenter}>重点</th>
              <th className={styles.thCenter} colSpan={Math.max(years.length, 1)}>
                請求金額
              </th>
            </tr>
            <tr>
              <th className={styles.thSub}></th>
              <th className={styles.thSub}></th>
              {(years.length ? years : [new Date().getFullYear()]).map((y) => (
                <th key={y} className={styles.thYear}>
                  {y}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td className={styles.td} colSpan={2 + Math.max(years.length, 1)}>
                  読み込み中...
                </td>
              </tr>
            ) : filteredClients.length === 0 ? (
              <tr>
                <td className={styles.td} colSpan={2 + Math.max(years.length, 1)}>
                  該当するクライアントがありません。
                </td>
              </tr>
            ) : (
              filteredClients.map((c) => {
                const ym = yearlyMap.get(c.id) ?? new Map<number, number>();
                return (
                  <tr key={c.id}>
                    <td className={styles.tdName}>{c.name}</td>
                    <td className={styles.tdCenter}>{c.is_focus ? "○" : ""}</td>
                    {(years.length ? years : [new Date().getFullYear()]).map((y) => (
                      <td key={y} className={styles.tdMoney}>
                        {yen(ym.get(y) ?? 0)}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {msg && <p className={styles.errorText}>{msg}</p>}

      {open && (
        <div className={styles.modalOverlay} onClick={closeModal}>
          <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <button type="button" onClick={closeModal} className={styles.btnX} aria-label="close">
              ✕
            </button>

            <h2 className={styles.modalTitle}>登録</h2>

            <div className={styles.modalForm}>
              <div className={styles.formRow}>
                <div className={styles.formLabel}>クライアント名</div>
                <input value={newName} onChange={(e) => setNewName(e.target.value)} className={styles.input} />
              </div>

              <div className={styles.formRow}>
                <div className={styles.formLabel}>重点クライアント</div>
                <input type="checkbox" checked={newFocus} onChange={(e) => setNewFocus(e.target.checked)} />
              </div>

              <div className={styles.modalButtonRow}>
                <button type="button" onClick={createClientRow} disabled={saving} className={styles.btnRedBig}>
                  {saving ? "登録中..." : "登録する"}
                </button>
              </div>
            </div>

            {msg && <p className={styles.modalErrorText}>{msg}</p>}
          </div>
        </div>
      )}
    </main>
  );
}