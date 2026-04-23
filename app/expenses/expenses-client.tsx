"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/app/utils/supabase/client";
import styles from "./expenses-client.module.css";

type ProjectRow = {
  id: string;
  name: string;
};

function toTargetYearMonth(expenseDate: string) {
  return expenseDate ? `${expenseDate.slice(0, 7)}-01` : null;
}

function toNumberOrNull(value: string) {
  const text = value.trim();
  if (!text) return null;
  const num = Number(text.replace(/,/g, ""));
  if (Number.isNaN(num)) return null;
  return num;
}

export default function ExpensesClient() {
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [projectKeyword, setProjectKeyword] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState("");

  const [expenseDate, setExpenseDate] = useState("");
  const [expenseName, setExpenseName] = useState("");
  const [amount, setAmount] = useState("");
  const [invoice, setInvoice] = useState(false);
  const [purpose, setPurpose] = useState("");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setMessage("");

      try {
        const { data, error } = await supabase
          .from("project")
          .select("id,name")
          .order("name", { ascending: true });

        if (error) throw new Error(error.message);

        setProjects((data ?? []) as ProjectRow[]);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : String(error));
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [supabase]);

  const filteredProjects = useMemo(() => {
    const keyword = projectKeyword.trim().toLowerCase();
    if (!keyword) return projects;
    return projects.filter((project) => project.name.toLowerCase().includes(keyword));
  }, [projectKeyword, projects]);

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId]
  );

  const validate = () => {
    if (!expenseDate) return "経費発生日を入力してください。";
    if (!expenseName.trim()) return "経費名を入力してください。";

    const amountNum = toNumberOrNull(amount);
    if (amountNum == null || amountNum < 0) {
      return "金額は0以上の数値で入力してください。";
    }

    if (!purpose.trim()) return "用途を入力してください。";

    return null;
  };

  const resetForm = () => {
    setProjectKeyword("");
    setSelectedProjectId("");
    setExpenseDate("");
    setExpenseName("");
    setAmount("");
    setInvoice(false);
    setPurpose("");
  };

  const submit = async () => {
    setMessage("");

    const validationError = validate();
    if (validationError) {
      setMessage(validationError);
      return;
    }

    setSaving(true);

    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw new Error(authError.message);

      const userId = authData.user?.id;
      if (!userId) throw new Error("ログインユーザーを取得できません。");

      const amountNum = toNumberOrNull(amount);
      const targetYearMonth = toTargetYearMonth(expenseDate);

      const payload = {
        project_id: selectedProjectId || null,
        category: 0,
        expense_name: expenseName.trim(),
        partner_id: null,
        target_year_month: targetYearMonth,
        amount: amountNum,
        expense_date: expenseDate,
        invoice,
        purpose: purpose.trim(),
        updated_by: userId,
      };

      const { error } = await supabase.from("project_actual_cost").insert(payload);

      if (error) throw new Error(error.message);

      resetForm();
      setMessage("経費申請を登録しました。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className={styles.page}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>経費申請</h1>
      </div>

      {message && <p className={styles.message}>{message}</p>}

      <div className={styles.card}>
        {loading ? (
          <p className={styles.loadingText}>読み込み中...</p>
        ) : (
          <>
            <div className={styles.gridRow}>
              <div className={styles.gridLabel}>プロジェクト検索</div>
              <div className={styles.projectSelectArea}>
                <input
                  value={projectKeyword}
                  onChange={(event) => setProjectKeyword(event.target.value)}
                  className={styles.input}
                  placeholder="project.name で検索"
                />
                <select
                  value={selectedProjectId}
                  onChange={(event) => setSelectedProjectId(event.target.value)}
                  className={styles.select}
                >
                  <option value="">未選択</option>
                  {filteredProjects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
                <div className={styles.helpText}>
                  選択中: {selectedProject ? selectedProject.name : "未選択"}
                </div>
              </div>
            </div>

            <div className={styles.gridRow}>
              <div className={styles.gridLabel}>経費発生日</div>
              <input
                type="date"
                value={expenseDate}
                onChange={(event) => setExpenseDate(event.target.value)}
                className={styles.inputSmall}
              />
            </div>

            <div className={styles.gridRow}>
              <div className={styles.gridLabel}>経費名</div>
              <input
                value={expenseName}
                onChange={(event) => setExpenseName(event.target.value)}
                className={styles.input}
                placeholder="例: 新幹線代"
              />
            </div>

            <div className={styles.gridRow}>
              <div className={styles.gridLabel}>金額</div>
              <input
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                className={styles.inputSmall}
                inputMode="numeric"
                placeholder="円単位"
              />
            </div>

            <div className={styles.gridRow}>
              <div className={styles.gridLabel}>インボイス</div>
              <label className={styles.checkRow}>
                <input
                  type="checkbox"
                  checked={invoice}
                  onChange={(event) => setInvoice(event.target.checked)}
                />
                <span>領収書に番号表記あり</span>
              </label>
            </div>

            <div className={styles.gridRow}>
              <div className={styles.gridLabel}>用途</div>
              <textarea
                value={purpose}
                onChange={(event) => setPurpose(event.target.value)}
                className={styles.textarea}
                rows={5}
                placeholder="用途を入力"
              />
            </div>

            <div className={styles.buttonRow}>
              <button
                type="button"
                onClick={submit}
                className={styles.submitButton}
                disabled={saving}
              >
                {saving ? "申請中..." : "申請"}
              </button>
            </div>
          </>
        )}
      </div>
    </main>
  );
}