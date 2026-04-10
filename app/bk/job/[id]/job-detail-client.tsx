"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/app/utils/supabase/client";
import styles from "./job-detail-client.module.css";

type JobRow = {
  id: string;
  name: string;
  monthly_unit_price: number;
  updated_by: string | null;
};

type ProfileRow = {
  id: string;
};

export default function JobDetailClient({ jobId }: { jobId: string }) {
  const supabase = createClient();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const [job, setJob] = useState<JobRow | null>(null);

  const [formName, setFormName] = useState("");
  const [formMonthlyUnitPrice, setFormMonthlyUnitPrice] = useState("");

  const load = async () => {
    setLoading(true);
    setMsg("");

    try {
      const { data, error } = await supabase
        .from("job")
        .select("id,name,monthly_unit_price,updated_by")
        .eq("id", jobId)
        .single();

      if (error) throw new Error(error.message);

      const row = data as JobRow;
      setJob(row);
      setFormName(row.name ?? "");
      setFormMonthlyUnitPrice(String(row.monthly_unit_price ?? ""));
    } catch (e: any) {
      setMsg(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

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

  const update = async () => {
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

      const { error } = await supabase
        .from("job")
        .update({
          name,
          monthly_unit_price: parsed,
          updated_by: profileId,
        })
        .eq("id", jobId);

      if (error) throw new Error(error.message);

      await load();
      setMsg("更新しました。");
    } catch (e: any) {
      setMsg(e?.message ?? String(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    const ok = window.confirm("この職種を削除しますか？");
    if (!ok) return;

    setMsg("");
    setSaving(true);

    try {
      const { error } = await supabase.from("job").delete().eq("id", jobId);

      if (error) throw new Error(error.message);

      router.replace("/job");
      router.refresh();
    } catch (e: any) {
      setMsg(e?.message ?? String(e));
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <main className={styles.page}>
        <h1 className={styles.pageTitle}>職種詳細</h1>
        <div className={styles.loadingText}>読み込み中...</div>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <div>
        <h1 className={styles.pageTitle}>職種詳細</h1>
      </div>

      <div className={styles.topBorder} />

      <div className={styles.topArea}>
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
                placeholder="400000"
                inputMode="numeric"
              />
            </div>
          </div>
        </div>

        <div className={styles.buttonArea}>
          <button type="button" onClick={remove} disabled={saving} className={styles.btnDelete}>
            削除する
          </button>
          <button type="button" onClick={update} disabled={saving} className={styles.btnUpdate}>
            {saving ? "保存中..." : "更新する"}
          </button>
        </div>
      </div>

      {msg && <p className={styles.message}>{msg}</p>}
    </main>
  );
}
