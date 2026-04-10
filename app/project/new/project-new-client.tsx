"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/app/utils/supabase/client";
import styles from "./project-new-client.module.css";

type Client = {
  id: string;
  name: string;
  is_focus: number | null;
};

type Profile = {
  id: string;
  email: string | null;
  last_name: string | null;
  first_name: string | null;
  status: number | null;
};

const PROJECT_STATUS_OPTIONS = [
  { value: 0, label: "保留" },
  { value: 1, label: "営業中" },
  { value: 2, label: "確定前" },
  { value: 3, label: "確定" },
  { value: 4, label: "進行中" },
  { value: 5, label: "完了" },
  { value: 6, label: "滞留" },
  { value: 7, label: "プリセールス(無償)" },
  { value: 8, label: "社内案件(無償)" },
] as const;

function fullName(lastName?: string | null, firstName?: string | null) {
  const name = `${lastName ?? ""}${firstName ?? ""}`.trim();
  return name || "（未設定）";
}

function optionLabel(profile: Profile) {
  const name = fullName(profile.last_name, profile.first_name);
  const email = (profile.email ?? "").trim();
  return email ? `${name}（${email}）` : name;
}

function uniq<T>(items: T[]) {
  return Array.from(new Set(items));
}

function monthValueToDate(value: string) {
  return value ? `${value}-01` : null;
}

function toNumberOrNull(value: string) {
  const text = value.trim();
  if (!text) return null;
  const num = Number(text.replace(/,/g, ""));
  if (Number.isNaN(num)) return null;
  return num;
}

export default function ProjectNewClient() {
  const supabase = createClient();
  const router = useRouter();

  const [clients, setClients] = useState<Client[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const [name, setName] = useState("");
  const [clientId, setClientId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [projectManagerId, setProjectManagerId] = useState("");
  const [memberProfileIds, setMemberProfileIds] = useState<string[]>([""]);
  const [pmRevenueShare, setPmRevenueShare] = useState("");
  const [memberRevenueShare, setMemberRevenueShare] = useState("");
  const [status, setStatus] = useState("0");
  const [invoiceAmount, setInvoiceAmount] = useState("");
  const [invoiceMonth, setInvoiceMonth] = useState("");
  const [paymentDueDate, setPaymentDueDate] = useState("");
  const [estimate, setEstimate] = useState("");
  const [invoice, setInvoice] = useState("");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setMsg("");

      try {
        const [
          { data: clientData, error: clientError },
          { data: profileData, error: profileError },
        ] = await Promise.all([
          supabase
            .from("client")
            .select("id,name,is_focus")
            .order("is_focus", { ascending: false })
            .order("name", { ascending: true }),
          supabase
            .from("profiles_2")
            .select("id,email,last_name,first_name,status")
            .neq("status", 2)
            .order("created_at", { ascending: true }),
        ]);

        if (clientError) throw new Error(clientError.message);
        if (profileError) throw new Error(profileError.message);

        const nextClients = (clientData ?? []) as Client[];
        const nextProfiles = ((profileData ?? []) as Profile[]).filter(
          (profile) => `${profile.last_name ?? ""}${profile.first_name ?? ""}`.trim() !== ""
        );

        setClients(nextClients);
        setProfiles(nextProfiles);
        if (!clientId && nextClients.length > 0) {
          setClientId(nextClients[0].id);
        }
      } catch (error) {
        setMsg(error instanceof Error ? error.message : String(error));
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [supabase, clientId]);

  const usedMemberIds = useMemo(() => new Set(memberProfileIds.filter(Boolean)), [memberProfileIds]);

  const addMemberRow = () => setMemberProfileIds((current) => [...current, ""]);
  const removeMemberRow = (index: number) => {
    setMemberProfileIds((current) => (current.length <= 1 ? current : current.filter((_, idx) => idx !== index)));
  };
  const setMemberAt = (index: number, value: string) => {
    setMemberProfileIds((current) => current.map((item, idx) => (idx === index ? value : item)));
  };

  const validate = () => {
    if (!clientId) return "クライアントを選択してください。";
    if (!name.trim()) return "案件名を入力してください。";
    if (startDate && endDate && startDate > endDate) return "開始日が終了日より後になっています。";

    const normalizedMemberIds = memberProfileIds.map((item) => item.trim()).filter(Boolean);
    if (normalizedMemberIds.length !== uniq(normalizedMemberIds).length) return "案件メンバーが重複しています。";

    const pmRevenueShareNum = toNumberOrNull(pmRevenueShare);
    if (pmRevenueShare.trim() && (pmRevenueShareNum == null || pmRevenueShareNum < 0 || pmRevenueShareNum > 100)) {
      return "PM売上比率は 0〜100 の数値で入力してください。";
    }

    const memberRevenueShareNum = toNumberOrNull(memberRevenueShare);
    if (
      memberRevenueShare.trim() &&
      (memberRevenueShareNum == null || memberRevenueShareNum < 0 || memberRevenueShareNum > 100)
    ) {
      return "メンバー売上比率は 0〜100 の数値で入力してください。";
    }

    if ((pmRevenueShareNum ?? 0) + (memberRevenueShareNum ?? 0) > 100) {
      return "PM売上比率とメンバー売上比率の合計は100以下にしてください。";
    }

    const invoiceAmountNum = toNumberOrNull(invoiceAmount);
    if (invoiceAmount.trim() && (invoiceAmountNum == null || invoiceAmountNum < 0)) {
      return "請求額は0以上の数値で入力してください。";
    }

    return null;
  };

  const getCurrentUpdaterId = async () => {
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
    if (!profile?.id) throw new Error("更新者プロフィールが見つかりません。");

    return profile.id;
  };

  const submit = async () => {
    setMsg("");
    const validationError = validate();
    if (validationError) {
      setMsg(validationError);
      return;
    }

    setSaving(true);
    try {
      const updaterId = await getCurrentUpdaterId();
      const invoiceAmountNum = toNumberOrNull(invoiceAmount);

      const { data: project, error: projectError } = await supabase
        .from("project")
        .insert({
          name: name.trim(),
          client_id: clientId,
          start_date: startDate || null,
          end_date: endDate || null,
          project_manager_id: projectManagerId || null,
          pm_revenue_share: toNumberOrNull(pmRevenueShare),
          member_revenue_share: toNumberOrNull(memberRevenueShare),
          status: Number(status),
          invoice_amount: invoiceAmountNum,
          invoice_month: monthValueToDate(invoiceMonth),
          payment_due_date: paymentDueDate || null,
          estimate: estimate.trim() || null,
          invoice: invoice.trim() || null,
          updated_by: updaterId,
        })
        .select("id")
        .single();

      if (projectError) throw new Error(projectError.message);
      if (!project?.id) throw new Error("案件IDが取得できませんでした。");

      const normalizedMemberIds = uniq(memberProfileIds.map((item) => item.trim()).filter(Boolean));
      if (normalizedMemberIds.length > 0) {
        const memberPayload = normalizedMemberIds.map((profileId) => ({
          project_id: project.id,
          profile_id: profileId,
          updated_by: updaterId,
        }));

        const { error: memberError } = await supabase.from("project_member").insert(memberPayload);
        if (memberError) throw new Error(memberError.message);
      }

      router.replace("/project");
      router.refresh();
    } catch (error) {
      setMsg(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className={styles.page}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>案件登録</h1>
        <button type="button" onClick={() => router.push("/project")} className={styles.btnGhost}>
          一覧へ戻る
        </button>
      </div>

      <div className={styles.card}>
        {loading ? (
          <p className={styles.emptyText}>読み込み中...</p>
        ) : (
          <>
            <div className={styles.gridRow}>
              <div className={styles.gridLabel}>案件名</div>
              <input value={name} onChange={(e) => setName(e.target.value)} className={styles.input} />
            </div>

            <div className={styles.gridRow}>
              <div className={styles.gridLabel}>クライアント</div>
              <select value={clientId} onChange={(e) => setClientId(e.target.value)} className={styles.select}>
                <option value="">選択してください</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}{client.is_focus === 1 ? " ★" : ""}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.gridRow}>
              <div className={styles.gridLabel}>開始日</div>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={styles.inputSmall} />
            </div>

            <div className={styles.gridRow}>
              <div className={styles.gridLabel}>終了日</div>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={styles.inputSmall} />
            </div>

            <div className={styles.gridRow}>
              <div className={styles.gridLabel}>案件責任者</div>
              <select value={projectManagerId} onChange={(e) => setProjectManagerId(e.target.value)} className={styles.select}>
                <option value="">選択してください</option>
                {profiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {optionLabel(profile)}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.gridRow}>
              <div className={styles.gridLabel}>案件メンバー</div>
              <div className={styles.directorWrap}>
                {memberProfileIds.map((profileId, index) => (
                  <div key={`member-${index}`} className={styles.directorRow}>
                    <select
                      value={profileId}
                      onChange={(e) => setMemberAt(index, e.target.value)}
                      className={styles.select}
                    >
                      <option value="">選択してください</option>
                      {profiles.map((profile) => {
                        const alreadyUsed = usedMemberIds.has(profile.id) && profile.id !== profileId;
                        return (
                          <option key={profile.id} value={profile.id} disabled={alreadyUsed}>
                            {optionLabel(profile)}
                          </option>
                        );
                      })}
                    </select>
                    {index > 0 && (
                      <button type="button" onClick={() => removeMemberRow(index)} className={styles.btnMini}>
                        削除
                      </button>
                    )}
                  </div>
                ))}
                <button type="button" onClick={addMemberRow} className={styles.btnLink}>
                  ＋ メンバーを追加
                </button>
              </div>
            </div>

            <hr className={styles.hr} />

            <div className={styles.gridRow}>
              <div className={styles.gridLabel}>PM売上比率</div>
              <div className={styles.percentRow}>
                <input
                  value={pmRevenueShare}
                  onChange={(e) => setPmRevenueShare(e.target.value)}
                  className={styles.inputSmall}
                  inputMode="decimal"
                />
                <span>%</span>
              </div>
            </div>

            <div className={styles.gridRow}>
              <div className={styles.gridLabel}>メンバー売上比率</div>
              <div className={styles.percentRow}>
                <input
                  value={memberRevenueShare}
                  onChange={(e) => setMemberRevenueShare(e.target.value)}
                  className={styles.inputSmall}
                  inputMode="decimal"
                />
                <span>%</span>
              </div>
            </div>

            <div className={styles.gridRow}>
              <div className={styles.gridLabel}>ステータス</div>
              <select value={status} onChange={(e) => setStatus(e.target.value)} className={styles.select}>
                {PROJECT_STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={String(option.value)}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.gridRow}>
              <div className={styles.gridLabel}>請求額</div>
              <input
                value={invoiceAmount}
                onChange={(e) => setInvoiceAmount(e.target.value)}
                className={styles.inputSmall}
                inputMode="numeric"
                placeholder="円単位"
              />
            </div>

            <div className={styles.gridRow}>
              <div className={styles.gridLabel}>請求月</div>
              <input
                type="month"
                value={invoiceMonth}
                onChange={(e) => setInvoiceMonth(e.target.value)}
                className={styles.inputSmall}
              />
            </div>

            <div className={styles.gridRow}>
              <div className={styles.gridLabel}>入金予定日</div>
              <input
                type="date"
                value={paymentDueDate}
                onChange={(e) => setPaymentDueDate(e.target.value)}
                className={styles.inputSmall}
              />
            </div>

            <div className={styles.gridRow}>
              <div className={styles.gridLabel}>見積リンク</div>
              <input value={estimate} onChange={(e) => setEstimate(e.target.value)} className={styles.input} />
            </div>

            <div className={styles.gridRow}>
              <div className={styles.gridLabel}>請求書リンク</div>
              <input value={invoice} onChange={(e) => setInvoice(e.target.value)} className={styles.input} />
            </div>

            <div className={styles.buttonRow}>
              <button type="button" onClick={submit} className={styles.btnPrimary} disabled={saving}>
                {saving ? "登録中..." : "登録"}
              </button>
            </div>

            {msg && <p className={styles.errorText}>{msg}</p>}
          </>
        )}
      </div>
    </main>
  );
}
