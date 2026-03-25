"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/app/utils/supabase/client";
import styles from "./job-role-detail-client.module.css";

type JobRoleRow = {
  id: string;
  name: string;
  unit_price: number | string | null;
};

type MemberRow = {
  employee_id: string;
  last_name: string;
  first_name: string;
  team_paths: string | null;
};

function fullName(r: { last_name: string; first_name: string }) {
  return `${r.last_name ?? ""}${r.first_name ?? ""}`.trim();
}

export default function JobRoleDetailClient({ jobRoleId }: { jobRoleId: string }) {
  const supabase = createClient();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const [role, setRole] = useState<JobRoleRow | null>(null);
  const [members, setMembers] = useState<MemberRow[]>([]);

  const [formName, setFormName] = useState("");
  const [priceMode, setPriceMode] = useState<"set" | "unset">("set");
  const [formUnitPrice, setFormUnitPrice] = useState("");

  const load = async () => {
    setLoading(true);
    setMsg("");

    try {
      const { data: roleData, error: roleErr } = await supabase
        .from("job_roles")
        .select("id,name,unit_price")
        .eq("id", jobRoleId)
        .single();

      if (roleErr) throw new Error(roleErr.message);

      const roleRow = roleData as JobRoleRow;
      setRole(roleRow);
      setFormName(roleRow.name ?? "");
      setPriceMode(roleRow.unit_price == null ? "unset" : "set");
      setFormUnitPrice(roleRow.unit_price == null ? "" : String(roleRow.unit_price));

      const { data: links, error: linkErr } = await supabase
        .from("employee_job_roles")
        .select("employee_id")
        .eq("job_role_id", jobRoleId);

      if (linkErr) throw new Error(linkErr.message);

      const employeeIds = (links ?? []).map((x: any) => x.employee_id).filter(Boolean);

      if (employeeIds.length === 0) {
        setMembers([]);
      } else {
        const { data: memberRows, error: memErr } = await supabase
          .from("employee_list_view")
          .select("employee_id,last_name,first_name,team_paths")
          .in("employee_id", employeeIds)
          .order("created_at", { ascending: true });

        if (memErr) throw new Error(memErr.message);

        setMembers((memberRows ?? []) as MemberRow[]);
      }
    } catch (e: any) {
      setMsg(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [jobRoleId]);

  const update = async () => {
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
      const { error } = await supabase
        .from("job_roles")
        .update({
          name,
          unit_price: unitPrice,
        })
        .eq("id", jobRoleId);

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
      const { error } = await supabase
        .from("job_roles")
        .delete()
        .eq("id", jobRoleId);

      if (error) throw new Error(error.message);

      router.replace("/job-roles");
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
            <input
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              className={styles.input}
            />
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

      <div className={styles.memberSection}>
        <div className={styles.memberTitle}>メンバー一覧</div>

        <div className={styles.tableWrap}>
          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.th}>社員名</th>
                  <th className={styles.th}>所属</th>
                </tr>
              </thead>
              <tbody>
                {members.length === 0 ? (
                  <tr>
                    <td className={styles.td} colSpan={2}>
                      紐づくメンバーはいません。
                    </td>
                  </tr>
                ) : (
                  members.map((m) => (
                    <tr key={m.employee_id}>
                      <td className={styles.td}>{fullName(m)}</td>
                      <td className={styles.td}>{m.team_paths ?? ""}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>
  );
}