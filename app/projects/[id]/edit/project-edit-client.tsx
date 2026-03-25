"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/app/utils/supabase/client";
import styles from "./project-edit-client.module.css";

type Profile = {
  id: string;
  display_name: string | null;
  email: string | null;
  is_active: boolean | null;
};

type Client = {
  id: string;
  name: string;
  is_focus: boolean;
};

type ProjectMember = {
  user_id: string;
  role: string;
};

type ProjectRow = {
  id: string;
  client_id: string | null;
  client_name: string | null;
  project_name: string | null;
  start_date: string | null;
  end_date: string | null;
  pm_revenue_share: number | string | null;
  director_revenue_share: number | string | null;
  status: string | null;
  invoice_amount: number | string | null;
  invoice_month: string | null;
  payment_due_date: string | null;
  quotation: string | null;
  invoice: string | null;
};

function optionLabel(p: Profile) {
  const name = (p.display_name ?? "").trim();
  const email = (p.email ?? "").trim();
  if (name && email) return `${name}（${email}）`;
  return name || email || p.id;
}

function toNumberOrNull(s: string) {
  const t = s.trim();
  if (!t) return null;
  const n = Number(t);
  if (Number.isNaN(n)) return null;
  return n;
}

function pctToInput(v: number | string | null | undefined) {
  if (v == null) return "20";
  const n = typeof v === "string" ? Number(v) : v;
  if (!Number.isFinite(n)) return "20";
  return String(n * 100);
}

export default function ProjectEditClient({ projectId }: { projectId: string }) {
  const supabase = createClient();
  const router = useRouter();

  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);

  const [clients, setClients] = useState<Client[]>([]);
  const [loadingClients, setLoadingClients] = useState(true);

  const [loadingProject, setLoadingProject] = useState(true);

  const [clientId, setClientId] = useState("");
  const [projectName, setProjectName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const [pmRevenueShare, setPmRevenueShare] = useState("20");
  const [directorRevenueShare, setDirectorRevenueShare] = useState("20");

  const [status, setStatus] = useState("進行中");
  const [invoiceAmount, setInvoiceAmount] = useState("");
  const [invoiceMonth, setInvoiceMonth] = useState("");
  const [paymentDueDate, setPaymentDueDate] = useState("");
  const [quotation, setQuotation] = useState("");
  const [invoice, setInvoice] = useState("");

  const [pmUserId, setPmUserId] = useState("");
  const [directorUserIds, setDirectorUserIds] = useState<string[]>([]);

  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      setLoadingUsers(true);
      setMsg("");

      const { data, error } = await supabase
        .from("profiles")
        .select("id, display_name, email, is_active")
        .eq("is_active", true)
        .order("display_name", { ascending: true });

      if (error) {
        setMsg(error.message);
        setProfiles([]);
        setLoadingUsers(false);
        return;
      }

      setProfiles((data ?? []) as Profile[]);
      setLoadingUsers(false);
    })();
  }, [supabase]);

  useEffect(() => {
    (async () => {
      setLoadingClients(true);

      const { data, error } = await supabase
        .from("clients")
        .select("id,name,is_focus")
        .order("is_focus", { ascending: false })
        .order("name", { ascending: true });

      if (error) {
        setMsg((prev) => prev || error.message);
        setClients([]);
        setLoadingClients(false);
        return;
      }

      setClients((data ?? []) as Client[]);
      setLoadingClients(false);
    })();
  }, [supabase]);

  useEffect(() => {
    (async () => {
      setLoadingProject(true);
      setMsg("");

      const [{ data: project, error: pErr }, { data: members, error: mErr }] = await Promise.all([
        supabase
          .from("projects")
          .select(
            "id,client_id,client_name,project_name,start_date,end_date,pm_revenue_share,director_revenue_share,status,invoice_amount,invoice_month,payment_due_date,quotation,invoice"
          )
          .eq("id", projectId)
          .single(),
        supabase.from("project_members").select("user_id,role").eq("project_id", projectId),
      ]);

      if (pErr) {
        setMsg(pErr.message);
        setLoadingProject(false);
        return;
      }

      if (mErr) {
        setMsg(mErr.message);
        setLoadingProject(false);
        return;
      }

      const p = project as ProjectRow;
      const memberRows = (members ?? []) as ProjectMember[];

      setClientId(p.client_id ?? "");
      setProjectName(p.project_name ?? "");
      setStartDate(p.start_date ?? "");
      setEndDate(p.end_date ?? "");
      setPmRevenueShare(pctToInput(p.pm_revenue_share));
      setDirectorRevenueShare(pctToInput(p.director_revenue_share));
      setStatus(p.status ?? "進行中");
      setInvoiceAmount(p.invoice_amount == null ? "" : String(p.invoice_amount));
      setInvoiceMonth(p.invoice_month ?? "");
      setPaymentDueDate(p.payment_due_date ?? "");
      setQuotation(p.quotation ?? "");
      setInvoice(p.invoice ?? "");

      const pm = memberRows.find((x) => x.role === "PM");
      const dirs = memberRows.filter((x) => x.role === "DIRECTOR").map((x) => x.user_id);

      setPmUserId(pm?.user_id ?? "");
      setDirectorUserIds(dirs);

      setLoadingProject(false);
    })();
  }, [projectId, supabase]);

  const profileById = useMemo(() => {
    const m = new Map<string, Profile>();
    for (const p of profiles) m.set(p.id, p);
    return m;
  }, [profiles]);

  const clientById = useMemo(() => {
    const m = new Map<string, Client>();
    for (const c of clients) m.set(c.id, c);
    return m;
  }, [clients]);

  const usedDirectorIds = useMemo(() => new Set(directorUserIds.filter(Boolean)), [directorUserIds]);

  const addDirectorRow = () => {
    setDirectorUserIds((prev) => [...prev, ""]);
  };

  const removeDirectorRow = (idx: number) => {
    setDirectorUserIds((prev) => prev.filter((_, i) => i !== idx));
  };

  const setDirectorAt = (idx: number, value: string) => {
    setDirectorUserIds((prev) => prev.map((v, i) => (i === idx ? value : v)));
  };

  const goDetail = () => router.push(`/projects/${projectId}`);

  const validate = () => {
    if (!clientId) return "クライアントを選択してください。";
    if (!projectName.trim()) return "案件名を入力してください。";

    if (startDate && endDate && startDate > endDate) {
      return "開始日が終了日より後になっています。";
    }

    if (directorUserIds.some((x) => x === "")) {
      return "ディレクターの未選択行があります。削除するか選択してください。";
    }

    const set = new Set(directorUserIds);
    if (set.size !== directorUserIds.length) {
      return "同じディレクターが重複しています。";
    }

    const pmSharePct = toNumberOrNull(pmRevenueShare);
    const dirSharePct = toNumberOrNull(directorRevenueShare);

    if (pmRevenueShare.trim() !== "") {
      if (pmSharePct == null || pmSharePct < 0 || pmSharePct > 100) {
        return "PM売上比率は 0〜100 の数値で入力してください。";
      }
    }

    if (directorRevenueShare.trim() !== "") {
      if (dirSharePct == null || dirSharePct < 0 || dirSharePct > 100) {
        return "ディレクター売上比率は 0〜100 の数値で入力してください。";
      }
    }

    const totalPct = (pmSharePct ?? 0) + (dirSharePct ?? 0);
    if (totalPct > 100) {
      return "PM売上比率とディレクター売上比率の合計は100%以下にしてください。";
    }

    if (invoiceAmount.trim()) {
      const n = toNumberOrNull(invoiceAmount.replace(/,/g, ""));
      if (n == null || n < 0) return "請求額は 0以上の数値で入力してください。";
    }

    return null;
  };

  const submit = async () => {
    setMsg("");
    const err = validate();
    if (err) return setMsg(err);

    setSaving(true);
    try {
      const pmLabel = pmUserId
        ? optionLabel(profileById.get(pmUserId) ?? ({ id: pmUserId } as any))
        : null;

      const directorLabels = directorUserIds.length
        ? directorUserIds.map((id) => optionLabel(profileById.get(id) ?? ({ id } as any))).join(", ")
        : null;

      const pmSharePct = toNumberOrNull(pmRevenueShare);
      const dirSharePct = toNumberOrNull(directorRevenueShare);

      const pmShare = pmSharePct == null ? null : pmSharePct / 100;
      const dirShare = dirSharePct == null ? null : dirSharePct / 100;

      const amountNum = invoiceAmount.trim() ? Number(invoiceAmount.replace(/,/g, "")) : null;

      const selectedClient = clientById.get(clientId);
      if (!selectedClient) throw new Error("選択したクライアントが見つかりません。");

      const { error: updErr } = await supabase
        .from("projects")
        .update({
          client_id: clientId,
          client_name: selectedClient.name,
          project_name: projectName.trim(),
          start_date: startDate || null,
          end_date: endDate || null,
          project_manager: pmLabel,
          pm_revenue_share: pmShare,
          director: directorLabels,
          director_revenue_share: dirShare,
          status: status || null,
          invoice_amount: amountNum,
          invoice_month: invoiceMonth || null,
          payment_due_date: paymentDueDate || null,
          quotation: quotation.trim() || null,
          invoice: invoice.trim() || null,
        })
        .eq("id", projectId);

      if (updErr) throw new Error(updErr.message);

      const { error: delErr } = await supabase.from("project_members").delete().eq("project_id", projectId);
      if (delErr) throw new Error(delErr.message);

      const memberRows: { project_id: string; user_id: string; role: string }[] = [];

      if (pmUserId) {
        memberRows.push({ project_id: projectId, user_id: pmUserId, role: "PM" });
      }

      for (const uid of directorUserIds) {
        memberRows.push({ project_id: projectId, user_id: uid, role: "DIRECTOR" });
      }

      if (memberRows.length > 0) {
        const { error: memErr } = await supabase.from("project_members").insert(memberRows);
        if (memErr) throw new Error(memErr.message);
      }

      router.replace(`/projects/${projectId}`);
      router.refresh();
    } catch (e: any) {
      setMsg(e?.message ?? String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className={styles.page}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>案件編集</h1>
        <button type="button" onClick={goDetail} className={styles.btnGhost}>
          詳細へ戻る
        </button>
      </div>

      <div className={styles.card}>
        {loadingProject ? (
          <p>読み込み中...</p>
        ) : (
          <>
            <GridRow label="クライアント名">
              <select value={clientId} onChange={(e) => setClientId(e.target.value)} className={styles.select} disabled={loadingClients}>
                <option value="">{loadingClients ? "読込中..." : "選択してください"}</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              {clients.length === 0 && !loadingClients && (
                <div className={styles.subErrorText}>
                  クライアントが未登録です。先に「クライアント登録」を行ってください。
                </div>
              )}
            </GridRow>

            <GridRow label="案件名">
              <input value={projectName} onChange={(e) => setProjectName(e.target.value)} className={styles.input} />
            </GridRow>

            <GridRow label="期間">
              <div className={styles.inlineRow}>
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={styles.inputSmall} />
                <span>〜</span>
                <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={styles.inputSmall} />
              </div>
            </GridRow>

            <hr className={styles.hr} />

            <GridRow label="PM（1人）">
              <select value={pmUserId} onChange={(e) => setPmUserId(e.target.value)} className={styles.select} disabled={loadingUsers}>
                <option value="">{loadingUsers ? "読込中..." : "選択してください"}</option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {optionLabel(p)}
                  </option>
                ))}
              </select>
            </GridRow>

            <GridRow label="ディレクター（複数可）">
              <div className={styles.directorWrap}>
                {directorUserIds.length === 0 && <div className={styles.emptyText}>未設定</div>}

                {directorUserIds.map((uid, idx) => (
                  <div key={`${idx}-${uid}`} className={styles.directorRow}>
                    <select
                      value={uid}
                      onChange={(e) => setDirectorAt(idx, e.target.value)}
                      className={styles.select}
                      disabled={loadingUsers}
                    >
                      <option value="">{loadingUsers ? "読込中..." : "選択してください"}</option>
                      {profiles.map((p) => {
                        const alreadyUsed = usedDirectorIds.has(p.id) && p.id !== uid;
                        return (
                          <option key={p.id} value={p.id} disabled={alreadyUsed}>
                            {optionLabel(p)}
                          </option>
                        );
                      })}
                    </select>

                    <button type="button" onClick={() => removeDirectorRow(idx)} className={styles.btnMini}>
                      削除
                    </button>
                  </div>
                ))}

                <button type="button" onClick={addDirectorRow} className={styles.btnLink} disabled={loadingUsers}>
                  ＋ディレクターを追加
                </button>
              </div>
            </GridRow>

            <GridRow label="PM売上比率">
              <div className={styles.percentRow}>
                <input
                  value={pmRevenueShare}
                  onChange={(e) => setPmRevenueShare(e.target.value)}
                  className={styles.inputSmall}
                  placeholder="例: 20"
                />
                <span>%</span>
              </div>
            </GridRow>

            <GridRow label="ディレクター売上比率">
              <div className={styles.percentRow}>
                <input
                  value={directorRevenueShare}
                  onChange={(e) => setDirectorRevenueShare(e.target.value)}
                  className={styles.inputSmall}
                  placeholder="例: 20"
                />
                <span>%</span>
              </div>
            </GridRow>

            <hr className={styles.hr} />

            <GridRow label="状態">
              <select value={status} onChange={(e) => setStatus(e.target.value)} className={styles.select}>
                <option value="進行中">進行中</option>
                <option value="保留">保留</option>
                <option value="営業中">営業中</option>
                <option value="確定前">確定前</option>
                <option value="確定">確定</option>
                <option value="完了">完了</option>
                <option value="滞留">滞留</option>
                <option value="プリセールス（無償）">プリセールス（無償）</option>
                <option value="社内案件（無償）">社内案件（無償）</option>
              </select>
            </GridRow>

            <GridRow label="請求額">
              <input
                value={invoiceAmount}
                onChange={(e) => setInvoiceAmount(e.target.value)}
                className={styles.input}
                placeholder="例: 1200000"
              />
            </GridRow>

            <GridRow label="請求月">
              <input type="month" value={invoiceMonth} onChange={(e) => setInvoiceMonth(e.target.value)} className={styles.inputSmall} />
            </GridRow>

            <GridRow label="支払期日">
              <input
                type="date"
                value={paymentDueDate}
                onChange={(e) => setPaymentDueDate(e.target.value)}
                className={styles.inputSmall}
              />
            </GridRow>

            <GridRow label="見積書（Driveリンク）">
              <input
                value={quotation}
                onChange={(e) => setQuotation(e.target.value)}
                className={styles.input}
                placeholder="https://drive.google.com/..."
              />
            </GridRow>

            <GridRow label="請求書（Driveリンク）">
              <input
                value={invoice}
                onChange={(e) => setInvoice(e.target.value)}
                className={styles.input}
                placeholder="https://drive.google.com/..."
              />
            </GridRow>

            <div className={styles.buttonRow}>
              <button type="button" onClick={submit} disabled={saving} className={styles.btnPrimary}>
                {saving ? "更新中..." : "更新する"}
              </button>
            </div>

            {msg && <p className={styles.errorText}>{msg}</p>}
          </>
        )}
      </div>
    </main>
  );
}

function GridRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className={styles.gridRow}>
      <div className={styles.gridLabel}>{label}</div>
      <div>{children}</div>
    </div>
  );
}