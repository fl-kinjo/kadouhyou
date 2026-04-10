"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/app/utils/supabase/client";
import styles from "../../new/project-new-client.module.css";

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

type ProjectInitial = {
  id: string;
  name: string;
  client_id: string;
  start_date: string | null;
  end_date: string | null;
  project_manager_id: string | null;
  pm_revenue_share: number | string | null;
  member_revenue_share: number | string | null;
  status: number | null;
  invoice_amount: number | string | null;
  invoice_month: string | null;
  payment_due_date: string | null;
  estimate: string | null;
  invoice: string | null;
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

function dateToMonthValue(value: string | null) {
  if (!value) return "";
  return value.slice(0, 7);
}

function toNumberOrNull(value: string) {
  const text = value.trim();
  if (!text) return null;
  const num = Number(text.replace(/,/g, ""));
  if (Number.isNaN(num)) return null;
  return num;
}

export default function ProjectEditClient({
  projectId,
  initialProject,
  initialMemberProfileIds,
  clients,
  profiles,
}: {
  projectId: string;
  initialProject: ProjectInitial;
  initialMemberProfileIds: string[];
  clients: Client[];
  profiles: Profile[];
}) {
  const supabase = createClient();
  const router = useRouter();

  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const [name, setName] = useState(initialProject.name ?? "");
  const [clientId, setClientId] = useState(initialProject.client_id ?? "");
  const [startDate, setStartDate] = useState(initialProject.start_date ?? "");
  const [endDate, setEndDate] = useState(initialProject.end_date ?? "");
  const [projectManagerId, setProjectManagerId] = useState(initialProject.project_manager_id ?? "");
  const [memberProfileIds, setMemberProfileIds] = useState(
    initialMemberProfileIds.length > 0 ? initialMemberProfileIds : [""]
  );
  const [pmRevenueShare, setPmRevenueShare] = useState(
    initialProject.pm_revenue_share == null ? "" : String(initialProject.pm_revenue_share)
  );
  const [memberRevenueShare, setMemberRevenueShare] = useState(
    initialProject.member_revenue_share == null ? "" : String(initialProject.member_revenue_share)
  );
  const [status, setStatus] = useState(String(initialProject.status ?? 0));
  const [invoiceAmount, setInvoiceAmount] = useState(
    initialProject.invoice_amount == null ? "" : String(initialProject.invoice_amount)
  );
  const [invoiceMonth, setInvoiceMonth] = useState(dateToMonthValue(initialProject.invoice_month));
  const [paymentDueDate, setPaymentDueDate] = useState(initialProject.payment_due_date ?? "");
  const [estimate, setEstimate] = useState(initialProject.estimate ?? "");
  const [invoice, setInvoice] = useState(initialProject.invoice ?? "");

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

      const { error: projectError } = await supabase
        .from("project")
        .update({
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
        .eq("id", projectId);

      if (projectError) throw new Error(projectError.message);

      const { error: deleteMemberError } = await supabase.from("project_member").delete().eq("project_id", projectId);
      if (deleteMemberError) throw new Error(deleteMemberError.message);

      const normalizedMemberIds = uniq(memberProfileIds.map((item) => item.trim()).filter(Boolean));
      if (normalizedMemberIds.length > 0) {
        const memberPayload = normalizedMemberIds.map((profileId) => ({
          project_id: projectId,
          profile_id: profileId,
          updated_by: updaterId,
        }));

        const { error: memberError } = await supabase.from("project_member").insert(memberPayload);
        if (memberError) throw new Error(memberError.message);
      }

      router.replace(`/project/${projectId}`);
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
        <h1 className={styles.pageTitle}>案件編集</h1>
        <button type="button" onClick={() => router.push(`/project/${projectId}`)} className={styles.btnGhost}>
          詳細へ戻る
        </button>
      </div>

      <div className={styles.card}>
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
            {saving ? "更新中..." : "更新"}
          </button>
        </div>

        {msg && <p className={styles.errorText}>{msg}</p>}
      </div>
    </main>
  );
}
