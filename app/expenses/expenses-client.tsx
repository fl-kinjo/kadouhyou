"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/app/utils/supabase/client";
import styles from "./expenses-client.module.css";

type ProjectRow = {
  id: string;
  name: string;
  project_no: number | string | null;
};

type TeamRow = {
  id: string;
  name: string;
  department_code: string | null;
};

type ExpenseRow = {
  id: string;
  project_id: string | null;
  team_id: string | null;
  expense_type: number | null;
  expense_name: string | null;
  target_year_month: string | null;
  amount: number | null;
  expense_date: string | null;
  invoice: boolean | null;
  purpose: string | null;
  updated_at: string | null;
  updated_by: string | null;
  profile_id: string | null;
  category: number | null;
  application_status: number | null;
  request_group_id: string | null;
  receipt_file_path: string | null;
  receipt_file_name: string | null;
  receipt_mime_type: string | null;
  receipt_size_bytes: number | null;
};

type TabType = "form" | "list";
type ExpenseType = "direct" | "indirect";

type DetailFormRow = {
  id: string;
  expenseDate: string;
  category: string;
  amount: string;
  purpose: string;
  invoice: boolean;
  receiptFileName: string;
  receiptFile: File | null;
};

const CATEGORY_OPTIONS = [
  { value: "0", label: "交通費" },
  { value: "1", label: "飲食費" },
  { value: "2", label: "宿泊費" },
  { value: "3", label: "会議費" },
  { value: "4", label: "消耗品費" },
  { value: "5", label: "その他" },
] as const;

const APPLICATION_STATUS_LABELS: Record<number, string> = {
  0: "承認待ち",
  1: "承認済み",
  2: "却下",
  3: "取消",
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

function formatDateJP(value: string | null) {
  if (!value) return "-";
  return value.replaceAll("-", "/");
}

function formatCurrency(value: number | null) {
  if (value == null) return "-";
  return `¥${value.toLocaleString("ja-JP")}`;
}

function formatExpenseTypeLabel(value: number | null) {
  return value === 1 ? "間接経費" : "直接経費";
}

function formatApplicationStatus(value: number | null) {
  if (value == null) return "-";
  return APPLICATION_STATUS_LABELS[value] ?? String(value);
}

function getCategoryLabel(value: number | null) {
  const option = CATEGORY_OPTIONS.find((item) => Number(item.value) === value);
  return option?.label ?? "-";
}

function createEmptyDetail(): DetailFormRow {
  return {
    id: crypto.randomUUID(),
    expenseDate: "",
    category: "",
    amount: "",
    purpose: "",
    invoice: false,
    receiptFileName: "",
    receiptFile: null,
  };
}

function formatProjectLabel(project: ProjectRow | null) {
  if (!project) return "-";
  const projectNo = project.project_no == null || project.project_no === "" ? "" : `${project.project_no} / `;
  return `${projectNo}${project.name}`;
}

function formatTeamLabel(team: TeamRow | null) {
  if (!team) return "-";
  return team.name;
}

function mergeProjects(current: ProjectRow[], next: ProjectRow[]) {
  const map = new Map<string, ProjectRow>();
  current.forEach((project) => map.set(project.id, project));
  next.forEach((project) => map.set(project.id, project));
  return Array.from(map.values());
}

function sanitizeFileName(fileName: string) {
  return fileName.replace(/[^\w.\-]/g, "_");
}

export default function ExpensesClient() {
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [downloadingReceiptPath, setDownloadingReceiptPath] = useState("");
  const [message, setMessage] = useState("");
  const [activeTab, setActiveTab] = useState<TabType>("form");
  const [expenseType, setExpenseType] = useState<ExpenseType>("direct");

  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [projectSearchResults, setProjectSearchResults] = useState<ProjectRow[]>([]);
  const [projectSearchKeyword, setProjectSearchKeyword] = useState("");
  const [projectSearchLoading, setProjectSearchLoading] = useState(false);
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);

  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [selectedTeamId, setSelectedTeamId] = useState("");
  const [details, setDetails] = useState<DetailFormRow[]>([createEmptyDetail()]);

  const load = useCallback(async () => {
    setLoading(true);
    setMessage("");

    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw new Error(authError.message);

      const userId = authData.user?.id;
      if (!userId) throw new Error("ログインユーザーを取得できません。");

      const { data: profileTeamData, error: profileTeamError } = await supabase
        .from("profile_team")
        .select("team_id")
        .eq("profile_id", userId);

      if (profileTeamError) throw new Error(profileTeamError.message);

      const teamIds = Array.from(
        new Set((profileTeamData ?? []).map((row) => row.team_id).filter(Boolean) as string[])
      );

      const teamPromise = teamIds.length > 0
        ? supabase
            .from("team")
            .select("id,name,department_code")
            .in("id", teamIds)
            .order("name", { ascending: true })
        : Promise.resolve({ data: [], error: null });

      const [{ data: teamData, error: teamError }, { data: expenseData, error: expenseError }] =
        await Promise.all([
          teamPromise,
          supabase
            .from("project_actual_cost")
            .select(
              "id,project_id,team_id,expense_type,expense_name,target_year_month,amount,expense_date,invoice,purpose,updated_at,updated_by,profile_id,category,application_status,request_group_id,receipt_file_path,receipt_file_name,receipt_mime_type,receipt_size_bytes"
            )
            .eq("profile_id", userId)
            .order("expense_date", { ascending: false })
            .order("updated_at", { ascending: false }),
        ]);

      if (teamError) throw new Error(teamError.message);
      if (expenseError) throw new Error(expenseError.message);

      const nextExpenses = (expenseData ?? []) as ExpenseRow[];
      const projectIds = Array.from(
        new Set(nextExpenses.map((expense) => expense.project_id).filter(Boolean) as string[])
      );

      let expenseProjectRows: ProjectRow[] = [];
      if (projectIds.length > 0) {
        const { data: expenseProjectData, error: expenseProjectError } = await supabase
          .from("project")
          .select("id,name,project_no")
          .in("id", projectIds);

        if (expenseProjectError) throw new Error(expenseProjectError.message);
        expenseProjectRows = (expenseProjectData ?? []) as ProjectRow[];
      }

      setProjects((current) => mergeProjects(current, expenseProjectRows));
      setTeams((teamData ?? []) as TeamRow[]);
      setExpenses(nextExpenses);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  const searchProjects = useCallback(
    async (keyword: string) => {
      setProjectSearchLoading(true);

      try {
        const normalizedKeyword = keyword.trim();
        const baseQuery = supabase
          .from("project")
          .select("id,name,project_no")
          .order("project_no", { ascending: false })
          .limit(20);

        const queries = [
          normalizedKeyword
            ? baseQuery.ilike("name", `%${normalizedKeyword}%`)
            : baseQuery,
        ];

        const projectNo = Number(normalizedKeyword);
        if (normalizedKeyword && Number.isInteger(projectNo)) {
          queries.push(
            supabase
              .from("project")
              .select("id,name,project_no")
              .eq("project_no", projectNo)
              .limit(20)
          );
        }

        const results = await Promise.all(queries);
        const rows: ProjectRow[] = [];

        results.forEach(({ data, error }) => {
          if (error) throw new Error(error.message);
          rows.push(...((data ?? []) as ProjectRow[]));
        });

        const uniqueRows = mergeProjects([], rows).slice(0, 20);
        setProjectSearchResults(uniqueRows);
        setProjects((current) => mergeProjects(current, uniqueRows));
      } catch (error) {
        setMessage(error instanceof Error ? error.message : String(error));
        setProjectSearchResults([]);
      } finally {
        setProjectSearchLoading(false);
      }
    },
    [supabase]
  );

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      searchProjects(projectSearchKeyword);
    }, 300);

    return () => window.clearTimeout(timer);
  }, [projectSearchKeyword, searchProjects]);

  const projectMap = useMemo(() => {
    return new Map(projects.map((project) => [project.id, formatProjectLabel(project)]));
  }, [projects]);

  const teamMap = useMemo(() => {
    return new Map(teams.map((team) => [team.id, team]));
  }, [teams]);

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId]
  );

  const selectedTeam = useMemo(
    () => teams.find((team) => team.id === selectedTeamId) ?? null,
    [teams, selectedTeamId]
  );

  const totalAmount = useMemo(() => {
    return details.reduce((sum, detail) => sum + (toNumberOrNull(detail.amount) ?? 0), 0);
  }, [details]);

  const validate = () => {
    if (expenseType === "direct" && !selectedProjectId) {
      return "案件を選択してください。";
    }

    if (expenseType === "indirect" && !selectedTeamId) {
      return "チームを選択してください。";
    }

    for (let i = 0; i < details.length; i += 1) {
      const row = details[i];
      const index = i + 1;

      if (!row.expenseDate) return `明細${index}の日付を入力してください。`;
      if (!row.category) return `明細${index}のカテゴリを選択してください。`;

      const amountNum = toNumberOrNull(row.amount);
      if (amountNum == null || amountNum < 0) {
        return `明細${index}の金額は0以上の数値で入力してください。`;
      }

      if (!row.purpose.trim()) return `明細${index}の用途を入力してください。`;
    }

    return null;
  };

  const resetForm = () => {
    setExpenseType("direct");
    setSelectedProjectId("");
    setSelectedTeamId("");
    setProjectSearchKeyword("");
    setDetails([createEmptyDetail()]);
  };

  const updateDetail = (detailId: string, patch: Partial<DetailFormRow>) => {
    setDetails((current) =>
      current.map((detail) => (detail.id === detailId ? { ...detail, ...patch } : detail))
    );
  };

  const addDetail = () => {
    setDetails((current) => [...current, createEmptyDetail()]);
  };

  const duplicateDetail = (detailId: string) => {
    setDetails((current) => {
      const target = current.find((detail) => detail.id === detailId);
      if (!target) return current;

      const duplicated: DetailFormRow = {
        ...target,
        id: crypto.randomUUID(),
        invoice: false,
        receiptFileName: "",
        receiptFile: null,
      };

      const index = current.findIndex((detail) => detail.id === detailId);
      const next = [...current];
      next.splice(index + 1, 0, duplicated);
      return next;
    });
  };

  const removeDetail = (detailId: string) => {
    setDetails((current) => {
      if (current.length === 1) {
        return [createEmptyDetail()];
      }
      return current.filter((detail) => detail.id !== detailId);
    });
  };

  const downloadReceipt = async (filePath: string, fileName?: string | null) => {
    setMessage("");
    setDownloadingReceiptPath(filePath);

    try {
      const { data, error } = await supabase.storage
        .from("expense-receipts")
        .createSignedUrl(filePath, 60);

      if (error) throw new Error(error.message);

      const response = await fetch(data.signedUrl);
      if (!response.ok) {
        throw new Error("領収書ファイルの取得に失敗しました。");
      }

      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);

      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = fileName || filePath.split("/").pop() || "receipt";
      document.body.appendChild(link);
      link.click();
      link.remove();

      window.URL.revokeObjectURL(blobUrl);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setDownloadingReceiptPath("");
    }
  };

  const submit = async () => {
    setMessage("");

    const validationError = validate();
    if (validationError) {
      setMessage(validationError);
      return;
    }

    setSaving(true);

    const uploadedPaths: string[] = [];

    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw new Error(authError.message);

      const userId = authData.user?.id;
      if (!userId) throw new Error("ログインユーザーを取得できません。");

      const requestGroupId = crypto.randomUUID();

      const payloads = await Promise.all(
        details.map(async (detail, index) => {
          const amountNum = toNumberOrNull(detail.amount);
          const categoryOption = CATEGORY_OPTIONS.find((option) => option.value === detail.category);

          let receiptFilePath: string | null = null;
          let receiptFileName: string | null = null;
          let receiptMimeType: string | null = null;
          let receiptSizeBytes: number | null = null;

          if (detail.receiptFile) {
            const safeFileName = sanitizeFileName(detail.receiptFile.name);
            const storagePath = `${userId}/${requestGroupId}/detail_${index + 1}_${Date.now()}_${safeFileName}`;

            const { error: uploadError } = await supabase.storage
              .from("expense-receipts")
              .upload(storagePath, detail.receiptFile, {
                upsert: false,
              });

            if (uploadError) throw new Error(uploadError.message);

            uploadedPaths.push(storagePath);
            receiptFilePath = storagePath;
            receiptFileName = detail.receiptFile.name;
            receiptMimeType = detail.receiptFile.type || null;
            receiptSizeBytes = detail.receiptFile.size;
          }

          return {
            project_id: expenseType === "direct" ? selectedProjectId || null : null,
            team_id: expenseType === "indirect" ? selectedTeamId || null : null,
            expense_type: expenseType === "direct" ? 0 : 1,
            category: Number(detail.category),
            expense_name: categoryOption?.label ?? "その他",
            partner_id: null,
            target_year_month: toTargetYearMonth(detail.expenseDate),
            amount: amountNum,
            expense_date: detail.expenseDate,
            invoice: !!detail.receiptFile,
            purpose: detail.purpose.trim(),
            profile_id: userId,
            updated_by: userId,
            application_status: 0,
            request_group_id: requestGroupId,
            receipt_file_path: receiptFilePath,
            receipt_file_name: receiptFileName,
            receipt_mime_type: receiptMimeType,
            receipt_size_bytes: receiptSizeBytes,
          };
        })
      );

      const { error } = await supabase.from("project_actual_cost").insert(payloads);

      if (error) throw new Error(error.message);

      resetForm();
      setActiveTab("list");
      await load();
      setMessage("経費申請を登録しました。");
    } catch (error) {
      if (uploadedPaths.length > 0) {
        await supabase.storage.from("expense-receipts").remove(uploadedPaths);
      }
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  const renderTargetLabel = (expense: ExpenseRow) => {
    if (expense.expense_type === 1) {
      const team = expense.team_id ? teamMap.get(expense.team_id) ?? null : null;
      return formatTeamLabel(team);
    }

    if (expense.project_id) {
      return projectMap.get(expense.project_id) ?? "-";
    }

    return "-";
  };

  return (
    <main className={styles.page}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>経費申請</h1>
      </div>

      {message && <p className={styles.message}>{message}</p>}

      <div className={styles.tabBar}>
        <button
          type="button"
          className={`${styles.tabButton} ${activeTab === "form" ? styles.tabButtonActive : ""}`}
          onClick={() => setActiveTab("form")}
        >
          申請フォーム
        </button>
        <button
          type="button"
          className={`${styles.tabButton} ${activeTab === "list" ? styles.tabButtonActive : ""}`}
          onClick={() => setActiveTab("list")}
        >
          申請一覧
        </button>
      </div>

      {activeTab === "form" ? (
        <>
          <section className={styles.sectionCard}>
            <div className={styles.sectionTitle}>経費種別</div>

            <div className={styles.expenseTypeTabs}>
              <button
                type="button"
                className={`${styles.expenseTypeButton} ${
                  expenseType === "direct" ? styles.expenseTypeButtonActive : ""
                }`}
                onClick={() => {
                  setExpenseType("direct");
                  setSelectedTeamId("");
                }}
              >
                直接経費
              </button>
              <button
                type="button"
                className={`${styles.expenseTypeButton} ${
                  expenseType === "indirect" ? styles.expenseTypeButtonActive : ""
                }`}
                onClick={() => {
                  setExpenseType("indirect");
                  setSelectedProjectId("");
                }}
              >
                間接経費
              </button>
            </div>

            <div className={styles.selectionArea}>
              <div className={styles.fieldLabel}>
                {expenseType === "direct" ? "案件を選択" : "チームを選択"}
              </div>

              {expenseType === "direct" ? (
                <>
                  <input
                    value={projectSearchKeyword}
                    onChange={(event) => setProjectSearchKeyword(event.target.value)}
                    className={styles.input}
                    placeholder="案件名または案件NOで検索"
                  />

                  <div className={styles.projectSearchBox}>
                    {projectSearchLoading ? (
                      <div className={styles.projectSearchEmpty}>検索中...</div>
                    ) : projectSearchResults.length === 0 ? (
                      <div className={styles.projectSearchEmpty}>案件が見つかりません。</div>
                    ) : (
                      projectSearchResults.map((project) => (
                        <button
                          key={project.id}
                          type="button"
                          className={`${styles.projectSearchOption} ${
                            selectedProjectId === project.id ? styles.projectSearchOptionActive : ""
                          }`}
                          onClick={() => {
                            setSelectedProjectId(project.id);
                            setProjects((current) => mergeProjects(current, [project]));
                          }}
                        >
                          {formatProjectLabel(project)}
                        </button>
                      ))
                    )}
                  </div>

                  <div className={styles.helpText}>
                    選択中: {selectedProject ? formatProjectLabel(selectedProject) : "未選択"}
                  </div>
                </>
              ) : (
                <>
                  <select
                    value={selectedTeamId}
                    onChange={(event) => setSelectedTeamId(event.target.value)}
                    className={styles.select}
                  >
                    <option value="">- チームを選択してください -</option>
                    {teams.map((team) => (
                      <option key={team.id} value={team.id}>
                        {formatTeamLabel(team)}
                      </option>
                    ))}
                  </select>
                  <div className={styles.helpText}>
                    選択中: {selectedTeam ? formatTeamLabel(selectedTeam) : "未選択"}
                  </div>
                </>
              )}
            </div>
          </section>

          <section className={styles.sectionCard}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionTitle}>経費明細</div>
              <button type="button" onClick={addDetail} className={styles.addDetailButton}>
                ＋ 明細を追加
              </button>
            </div>

            <div className={styles.detailList}>
              {details.map((detail, index) => (
                <div key={detail.id} className={styles.detailCard}>
                  <div className={styles.detailHeader}>
                    <div className={styles.detailTitle}>明細{index + 1}</div>
                    <div className={styles.detailHeaderButtons}>
                      <button
                        type="button"
                        className={styles.detailSubButton}
                        onClick={() => duplicateDetail(detail.id)}
                      >
                        ＋ 複製
                      </button>
                      <button
                        type="button"
                        className={styles.detailCloseButton}
                        onClick={() => removeDetail(detail.id)}
                        aria-label={`明細${index + 1}を削除`}
                      >
                        ×
                      </button>
                    </div>
                  </div>

                  <div className={styles.detailGridTop}>
                    <div className={styles.detailField}>
                      <label className={styles.fieldLabel}>日付</label>
                      <input
                        type="date"
                        value={detail.expenseDate}
                        onChange={(event) =>
                          updateDetail(detail.id, { expenseDate: event.target.value })
                        }
                        className={styles.input}
                      />
                    </div>

                    <div className={styles.detailField}>
                      <label className={styles.fieldLabel}>カテゴリ</label>
                      <select
                        value={detail.category}
                        onChange={(event) =>
                          updateDetail(detail.id, { category: event.target.value })
                        }
                        className={styles.select}
                      >
                        <option value="">選択してください</option>
                        {CATEGORY_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className={styles.detailField}>
                      <label className={styles.fieldLabel}>金額（円）</label>
                      <input
                        value={detail.amount}
                        onChange={(event) =>
                          updateDetail(detail.id, { amount: event.target.value })
                        }
                        className={styles.input}
                        inputMode="numeric"
                        placeholder="0"
                      />
                    </div>
                  </div>

                  <div className={styles.detailGridBottom}>
                    <div className={styles.detailFieldWide}>
                      <label className={styles.fieldLabel}>用途</label>
                      <input
                        value={detail.purpose}
                        onChange={(event) =>
                          updateDetail(detail.id, { purpose: event.target.value })
                        }
                        className={styles.input}
                        placeholder="例：取引先との飲み会費用として"
                      />
                    </div>

                    <div className={styles.detailFieldReceipt}>
                      <label className={styles.fieldLabel}>領収書</label>
                      <label className={styles.uploadButton}>
                        アップロードする
                        <input
                          type="file"
                          className={styles.hiddenFileInput}
                          onChange={(event) => {
                            const file = event.target.files?.[0] ?? null;
                            updateDetail(detail.id, {
                              invoice: !!file,
                              receiptFileName: file?.name ?? "",
                              receiptFile: file,
                            });
                          }}
                        />
                      </label>
                      {detail.receiptFileName && (
                        <div className={styles.receiptFileName}>{detail.receiptFileName}</div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className={styles.totalRow}>
              <span className={styles.totalLabel}>合計金額</span>
              <span className={styles.totalValue}>¥{totalAmount.toLocaleString("ja-JP")}</span>
            </div>
          </section>

          <div className={styles.submitRow}>
            <button
              type="button"
              onClick={submit}
              className={styles.submitButton}
              disabled={saving || loading}
            >
              {saving ? "申請中..." : "申請する"}
            </button>
          </div>
        </>
      ) : (
        <section className={styles.listSection}>
          {loading ? (
            <div className={styles.emptyState}>読み込み中...</div>
          ) : expenses.length === 0 ? (
            <div className={styles.emptyState}>経費申請データがありません。</div>
          ) : (
            <div className={styles.listCard}>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>申請種別</th>
                      <th>案件 / チーム</th>
                      <th>日付</th>
                      <th>カテゴリ</th>
                      <th>金額</th>
                      <th>領収書</th>
                      <th>用途</th>
                      <th>ステータス</th>
                      <th>申請日</th>
                    </tr>
                  </thead>
                  <tbody>
                    {expenses.map((expense) => (
                      <tr key={expense.id}>
                        <td>{formatExpenseTypeLabel(expense.expense_type)}</td>
                        <td>{renderTargetLabel(expense)}</td>
                        <td>{formatDateJP(expense.expense_date)}</td>
                        <td>{getCategoryLabel(expense.category)}</td>
                        <td>{formatCurrency(expense.amount)}</td>
                        <td>
                          {expense.receipt_file_path ? (
                            <button
                              type="button"
                              className={styles.receiptLinkButton}
                              onClick={() =>
                                downloadReceipt(
                                  expense.receipt_file_path!,
                                  expense.receipt_file_name
                                )
                              }
                              disabled={downloadingReceiptPath === expense.receipt_file_path}
                            >
                              {downloadingReceiptPath === expense.receipt_file_path
                                ? "ダウンロード中..."
                                : "領収書を保存"}
                            </button>
                          ) : (
                            "なし"
                          )}
                        </td>
                        <td className={styles.purposeCell}>{expense.purpose ?? "-"}</td>
                        <td>{formatApplicationStatus(expense.application_status)}</td>
                        <td>{formatDateJP(expense.updated_at?.slice(0, 10) ?? null)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      )}
    </main>
  );
}