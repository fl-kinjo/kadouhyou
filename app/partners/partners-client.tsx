"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/app/utils/supabase/client";
import styles from "./partners-client.module.css";

type Partner = {
  id: string;
  name: string;
  is_key: boolean;
  created_at: string;
};

type PartnerYearlyPay = {
  partner_id: string;
  partner_name: string;
  is_key: boolean;
  year: string;
  pay_amount: number | string;
};

function yen(v: number | string | null | undefined) {
  if (v == null) return "";
  const n = typeof v === "string" ? Number(v) : v;
  if (!Number.isFinite(n)) return String(v);
  return n.toLocaleString("ja-JP");
}

export default function PartnersClient({
  initialQ,
}: {
  initialQ: string;
  initialFocusOnly: boolean;
}) {
  const supabase = createClient();
  const router = useRouter();

  const [q, setQ] = useState(initialQ);

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  const [partners, setPartners] = useState<Partner[]>([]);
  const [yearly, setYearly] = useState<PartnerYearlyPay[]>([]);

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<"create" | "edit">("create");
  const [editId, setEditId] = useState<string | null>(null);
  const [formName, setFormName] = useState("");

  useEffect(() => {
    const sp = new URLSearchParams();
    if (q.trim()) sp.set("q", q.trim());
    const qs = sp.toString();
    router.replace(qs ? `/partners?${qs}` : `/partners`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const load = async () => {
    setLoading(true);
    setMsg("");

    try {
      const { data: ps, error: e1 } = await supabase
        .from("partners")
        .select("id,name,is_key,created_at")
        .order("name", { ascending: true });

      if (e1) throw new Error(e1.message);
      setPartners((ps ?? []) as Partner[]);

      const { data: ys, error: e2 } = await supabase
        .from("partner_yearly_payments")
        .select("partner_id,partner_name,is_key,year,pay_amount");

      if (e2) throw new Error(e2.message);
      setYearly((ys ?? []) as PartnerYearlyPay[]);
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

  const filteredPartners = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return partners.filter((p) => {
      if (!kw) return true;
      return (p.name ?? "").toLowerCase().includes(kw);
    });
  }, [partners, q]);

  const years = useMemo(() => {
    const set = new Set<string>();
    for (const r of yearly) set.add(r.year);
    return Array.from(set).sort();
  }, [yearly]);

  const payMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of yearly) {
      const k = `${r.partner_id}__${r.year}`;
      const n = typeof r.pay_amount === "string" ? Number(r.pay_amount) : r.pay_amount;
      m.set(k, Number.isFinite(n) ? n : 0);
    }
    return m;
  }, [yearly]);

  const openCreateModal = () => {
    setMode("create");
    setEditId(null);
    setFormName("");
    setOpen(true);
    setMsg("");
  };

  const openEditModal = (partner: Partner) => {
    setMode("edit");
    setEditId(partner.id);
    setFormName(partner.name ?? "");
    setOpen(true);
    setMsg("");
  };

  const closeModal = () => {
    setOpen(false);
    setEditId(null);
    setFormName("");
  };

  const savePartner = async () => {
    setMsg("");
    const name = formName.trim();
    if (!name) return setMsg("パートナー名を入力してください。");

    setSaving(true);
    try {
      if (mode === "create") {
        const { error } = await supabase.from("partners").insert({
          name,
        });
        if (error) throw new Error(error.message);
      } else {
        if (!editId) throw new Error("編集対象が見つかりません。");
        const { error } = await supabase
          .from("partners")
          .update({
            name,
          })
          .eq("id", editId);
        if (error) throw new Error(error.message);
      }

      closeModal();
      await load();
    } catch (e: any) {
      setMsg(e?.message ?? String(e));
    } finally {
      setSaving(false);
    }
  };

  const removePartner = async (partner: Partner) => {
    const ok = window.confirm(`「${partner.name}」を削除しますか？`);
    if (!ok) return;

    setMsg("");
    try {
      const { error } = await supabase
        .from("partners")
        .delete()
        .eq("id", partner.id);

      if (error) throw new Error(error.message);

      await load();
    } catch (e: any) {
      setMsg(e?.message ?? String(e));
    }
  };

  return (
    <main className={styles.page}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>パートナー管理画面</h1>
        <div className={styles.pageHeaderLinks}>
          <button type="button" onClick={openCreateModal} className={styles.btnRed}>
            ＋ パートナー登録
          </button>
        </div>
      </div>

      <div className={styles.topBorder} />

      <div className={styles.filterRow}>
        <div className={styles.searchBox}>
          <span className={styles.searchIcon}>🔍</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="パートナー名"
            className={styles.searchInput}
          />
        </div>
      </div>

      <div className={styles.sectionBorder} />

      <div className={styles.tableOuter}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.thHead}>パートナー名</th>
              <th className={styles.thHeadCenter} colSpan={Math.max(years.length, 1)}>
                支払金額
              </th>
              <th className={styles.thHeadRight}>操作</th>
            </tr>
            <tr>
              <th className={styles.thSub} />
              {years.length === 0 ? (
                <th className={styles.thYear}>（データなし）</th>
              ) : (
                years.map((y) => (
                  <th key={y} className={styles.thYear}>
                    {y}
                  </th>
                ))
              )}
              <th className={styles.thSub} />
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td className={styles.td} colSpan={2 + Math.max(years.length, 1)}>
                  読み込み中...
                </td>
              </tr>
            ) : filteredPartners.length === 0 ? (
              <tr>
                <td className={styles.td} colSpan={2 + Math.max(years.length, 1)}>
                  該当するパートナーがありません。
                </td>
              </tr>
            ) : (
              filteredPartners.map((p) => (
                <tr key={p.id}>
                  <td className={styles.td}>{p.name}</td>

                  {years.length === 0 ? (
                    <td className={styles.tdRight} />
                  ) : (
                    years.map((y) => {
                      const k = `${p.id}__${y}`;
                      const v = payMap.get(k) ?? 0;
                      return (
                        <td key={k} className={styles.tdRight}>
                          {yen(v)}
                        </td>
                      );
                    })
                  )}

                  <td className={styles.tdAction}>
                    <div className={styles.operationButtons}>
                      <button
                        type="button"
                        onClick={() => openEditModal(p)}
                        className={styles.btnSmall}
                      >
                        編集
                      </button>
                      <button
                        type="button"
                        onClick={() => removePartner(p)}
                        className={styles.btnSmall}
                      >
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

      {msg && <p className={styles.errorText}>{msg}</p>}

      {open && (
        <div className={styles.modalOverlay} onClick={closeModal}>
          <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>{mode === "create" ? "登録" : "編集"}</h2>
              <button type="button" onClick={closeModal} className={styles.btnX} aria-label="close">
                ✕
              </button>
            </div>

            <div className={styles.modalForm}>
              <div className={styles.formRow}>
                <div className={styles.formLabel}>パートナー名</div>
                <input value={formName} onChange={(e) => setFormName(e.target.value)} className={styles.input} />
              </div>

              <div className={styles.modalButtonRow}>
                <button type="button" onClick={savePartner} disabled={saving} className={styles.btnRedBig}>
                  {saving ? (mode === "create" ? "登録中..." : "更新中...") : mode === "create" ? "登録する" : "更新する"}
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