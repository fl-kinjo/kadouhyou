"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/app/utils/supabase/client";
import styles from "./employees-client.module.css";

type Team = {
  id: string;
  parent_id: string | null;
  name: string;
};

type ProfileLite = {
  id: string;
  email: string | null;
};

type JobRole = {
  id: string;
  name: string;
};

type EmployeeListRow = {
  employee_id: string;
  last_name: string;
  first_name: string;
  is_admin: boolean;
  user_id: string | null;
  email: string | null;
  team_paths: string | null;
  roles: string | null;
  created_at: string;
};

function fullName(r: { last_name: string; first_name: string }) {
  return `${r.last_name ?? ""}${r.first_name ?? ""}`.trim();
}

function uniq<T>(arr: T[]) {
  return Array.from(new Set(arr));
}

export default function EmployeesClient() {
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  const [teams, setTeams] = useState<Team[]>([]);
  const [profiles, setProfiles] = useState<ProfileLite[]>([]);
  const [jobRoles, setJobRoles] = useState<JobRole[]>([]);
  const [rows, setRows] = useState<EmployeeListRow[]>([]);

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<"create" | "edit">("create");
  const [editingId, setEditingId] = useState<string | null>(null);

  const [formLast, setFormLast] = useState("");
  const [formFirst, setFormFirst] = useState("");
  const [formIsAdmin, setFormIsAdmin] = useState(false);
  const [formProfileId, setFormProfileId] = useState<string>("");
  const [formTeamIds, setFormTeamIds] = useState<string[]>([""]);
  const [formJobRoleIds, setFormJobRoleIds] = useState<string[]>([""]);

  const load = async () => {
    setLoading(true);
    setMsg("");

    try {
      const [
        { data: ts, error: tErr },
        { data: ps, error: pErr },
        { data: jrs, error: jrErr },
        { data: es, error: eErr },
      ] = await Promise.all([
        supabase.from("teams").select("id,parent_id,name").order("created_at", { ascending: true }),
        supabase.from("profiles").select("id,email").order("email", { ascending: true }),
        supabase.from("job_roles").select("id,name").order("created_at", { ascending: true }),
        supabase
          .from("employee_list_view")
          .select("employee_id,last_name,first_name,is_admin,user_id,email,team_paths,roles,created_at")
          .order("created_at", { ascending: false }),
      ]);

      if (tErr) throw new Error(tErr.message);
      if (pErr) throw new Error(pErr.message);
      if (jrErr) throw new Error(jrErr.message);
      if (eErr) throw new Error(eErr.message);

      setTeams((ts ?? []) as Team[]);
      setProfiles((ps ?? []) as ProfileLite[]);
      setJobRoles((jrs ?? []) as JobRole[]);
      setRows((es ?? []) as EmployeeListRow[]);
    } catch (e: any) {
      setMsg(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const teamOptions = useMemo(() => {
    const byParent = new Map<string | null, Team[]>();
    for (const t of teams) {
      const k = t.parent_id ?? null;
      if (!byParent.has(k)) byParent.set(k, []);
      byParent.get(k)!.push(t);
    }
    for (const [, arr] of byParent) arr.sort((a, b) => a.name.localeCompare(b.name, "ja"));

    const out: { id: string; label: string; depth: number }[] = [];
    const dfs = (parent: string | null, depth: number) => {
      const children = byParent.get(parent) ?? [];
      for (const c of children) {
        const indent = "　".repeat(depth);
        out.push({ id: c.id, label: `${indent}${c.name}`, depth });
        dfs(c.id, depth + 1);
      }
    };
    dfs(null, 0);
    return out;
  }, [teams]);

  const profileOptions = useMemo(() => {
    return (profiles ?? [])
      .filter((p) => (p.email ?? "").trim())
      .map((p) => ({ id: p.id, email: (p.email ?? "").trim() }))
      .sort((a, b) => a.email.localeCompare(b.email, "ja"));
  }, [profiles]);

  const jobRoleOptions = useMemo(() => {
    return [...jobRoles].sort((a, b) => a.name.localeCompare(b.name, "ja"));
  }, [jobRoles]);

  const usedJobRoleIds = useMemo(() => new Set(formJobRoleIds.filter(Boolean)), [formJobRoleIds]);

  const openCreate = () => {
    setMsg("");
    setMode("create");
    setEditingId(null);
    setFormLast("");
    setFormFirst("");
    setFormIsAdmin(false);
    setFormProfileId("");
    setFormTeamIds([""]);
    setFormJobRoleIds([""]);
    setOpen(true);
  };

  const close = () => {
    setOpen(false);
    setEditingId(null);
  };

  const addTeamRow = () => setFormTeamIds((p) => [...p, ""]);
  const removeTeamRow = (idx: number) =>
    setFormTeamIds((p) => (p.length <= 1 ? p : p.filter((_, i) => i !== idx)));
  const setTeamAt = (idx: number, v: string) => setFormTeamIds((p) => p.map((x, i) => (i === idx ? v : x)));

  const addJobRoleRow = () => setFormJobRoleIds((p) => [...p, ""]);
  const removeJobRoleRow = (idx: number) =>
    setFormJobRoleIds((p) => (p.length <= 1 ? p : p.filter((_, i) => i !== idx)));
  const setJobRoleAt = (idx: number, v: string) =>
    setFormJobRoleIds((p) => p.map((x, i) => (i === idx ? v : x)));

  const openEdit = async (employeeId: string) => {
    setMsg("");
    setMode("edit");
    setEditingId(employeeId);

    const r = rows.find((x) => x.employee_id === employeeId);
    if (!r) return setMsg("編集対象が見つかりません。更新してからやり直してください。");

    setFormLast(r.last_name ?? "");
    setFormFirst(r.first_name ?? "");
    setFormIsAdmin(!!r.is_admin);
    setFormProfileId(r.user_id ?? "");

    try {
      const [{ data: ets, error: etErr }, { data: ejrs, error: ejrErr }] = await Promise.all([
        supabase.from("employee_teams").select("team_id").eq("employee_id", employeeId),
        supabase.from("employee_job_roles").select("job_role_id").eq("employee_id", employeeId),
      ]);

      if (etErr) throw new Error(etErr.message);
      if (ejrErr) throw new Error(ejrErr.message);

      const teamIds = (ets ?? []).map((x: any) => String(x.team_id)).filter(Boolean);
      const jobRoleIds = (ejrs ?? []).map((x: any) => String(x.job_role_id)).filter(Boolean);

      setFormTeamIds(teamIds.length ? teamIds : [""]);
      setFormJobRoleIds(jobRoleIds.length ? jobRoleIds : [""]);
    } catch (e: any) {
      setMsg(e?.message ?? String(e));
      setFormTeamIds([""]);
      setFormJobRoleIds([""]);
    }

    setOpen(true);
  };

  const validate = () => {
    if (!formLast.trim()) return "姓を入力してください。";
    if (!formFirst.trim()) return "名を入力してください。";
    if (!formProfileId) return "メール（profiles.email）を選択してください。";

    const teamIds = formTeamIds.map((x) => x.trim()).filter(Boolean);
    if (teamIds.length !== uniq(teamIds).length) return "所属組織が重複しています。";

    const jobRoleIds = formJobRoleIds.map((x) => x.trim()).filter(Boolean);
    if (jobRoleIds.length !== uniq(jobRoleIds).length) return "職種が重複しています。";

    return null;
  };

  const save = async () => {
    setMsg("");
    const err = validate();
    if (err) return setMsg(err);

    setSaving(true);
    try {
      const prof = profileOptions.find((p) => p.id === formProfileId);
      const email = prof?.email ?? "";

      const teamIds = uniq(formTeamIds.map((x) => x.trim()).filter(Boolean));
      const jobRoleIds = uniq(formJobRoleIds.map((x) => x.trim()).filter(Boolean));

      if (mode === "create") {
        const { data: ins, error: insErr } = await supabase
          .from("employees")
          .insert({
            user_id: formProfileId,
            email,
            last_name: formLast.trim(),
            first_name: formFirst.trim(),
            is_admin: formIsAdmin,
          })
          .select("id")
          .single();

        if (insErr) throw new Error(insErr.message);
        const newId = (ins as any)?.id as string;

        if (teamIds.length) {
          const payload = teamIds.map((team_id) => ({ employee_id: newId, team_id }));
          const { error: etErr } = await supabase.from("employee_teams").insert(payload);
          if (etErr) throw new Error(etErr.message);
        }

        if (jobRoleIds.length) {
          const payload = jobRoleIds.map((job_role_id) => ({ employee_id: newId, job_role_id }));
          const { error: ejrErr } = await supabase.from("employee_job_roles").insert(payload);
          if (ejrErr) throw new Error(ejrErr.message);
        }
      } else {
        if (!editingId) throw new Error("編集対象IDがありません。");

        const { error: upErr } = await supabase
          .from("employees")
          .update({
            user_id: formProfileId,
            email,
            last_name: formLast.trim(),
            first_name: formFirst.trim(),
            is_admin: formIsAdmin,
          })
          .eq("id", editingId);

        if (upErr) throw new Error(upErr.message);

        const { error: delTeamErr } = await supabase.from("employee_teams").delete().eq("employee_id", editingId);
        if (delTeamErr) throw new Error(delTeamErr.message);

        if (teamIds.length) {
          const payload = teamIds.map((team_id) => ({ employee_id: editingId, team_id }));
          const { error: etErr } = await supabase.from("employee_teams").insert(payload);
          if (etErr) throw new Error(etErr.message);
        }

        const { error: delJobErr } = await supabase.from("employee_job_roles").delete().eq("employee_id", editingId);
        if (delJobErr) throw new Error(delJobErr.message);

        if (jobRoleIds.length) {
          const payload = jobRoleIds.map((job_role_id) => ({ employee_id: editingId, job_role_id }));
          const { error: ejrErr } = await supabase.from("employee_job_roles").insert(payload);
          if (ejrErr) throw new Error(ejrErr.message);
        }
      }

      close();
      await load();
    } catch (e: any) {
      setMsg(e?.message ?? String(e));
    } finally {
      setSaving(false);
    }
  };

  const del = async (employeeId: string) => {
    const ok = confirm("この社員を削除しますか？");
    if (!ok) return;

    setMsg("");
    setSaving(true);
    try {
      const { error } = await supabase.from("employees").delete().eq("id", employeeId);
      if (error) throw new Error(error.message);

      await load();
    } catch (e: any) {
      setMsg(e?.message ?? String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className={styles.page}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>社員一覧</h1>

        <div className={styles.pageHeaderLinks}>
          <Link href="/teams" className={styles.headerLink}>
            チーム管理へ
          </Link>
          <button type="button" onClick={openCreate} className={styles.btnRed} disabled={saving}>
            ＋ 新規社員登録
          </button>
        </div>
      </div>

      <div className={styles.topBorder} />

      <div className={styles.tableFrame}>
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th}>#</th>
                <th className={styles.th}>社員名</th>
                <th className={styles.th}>所属組織</th>
                <th className={styles.th}>職種</th>
                <th className={styles.thCenter}>管理者</th>
                <th className={styles.thRight}>操作</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td className={styles.td} colSpan={6}>
                    読み込み中...
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td className={styles.td} colSpan={6}>
                    まだ社員が登録されていません。
                  </td>
                </tr>
              ) : (
                rows.map((r, i) => (
                  <tr key={r.employee_id}>
                    <td className={styles.tdSmall}>{i + 1}</td>
                    <td className={styles.td}>{fullName(r)}</td>
                    <td className={styles.tdWide}>{r.team_paths ?? ""}</td>
                    <td className={styles.td}>{r.roles ?? ""}</td>
                    <td className={styles.tdCenter}>{r.is_admin ? "○" : ""}</td>
                    <td className={styles.tdRight}>
                      <div className={styles.operationButtons}>
                        <button type="button" onClick={() => openEdit(r.employee_id)} className={styles.btnSmall} disabled={saving}>
                          編集
                        </button>
                        <button type="button" onClick={() => del(r.employee_id)} className={styles.btnSmall} disabled={saving}>
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
      </div>

      {msg && <p className={styles.errorText}>{msg}</p>}

      {open && (
        <div className={styles.modalOverlay} onClick={close}>
          <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>{mode === "edit" ? "社員編集" : "社員登録画面"}</h2>
              <button type="button" onClick={close} className={styles.btnX} aria-label="close">
                ✕
              </button>
            </div>

            <div className={styles.modalForm}>
              <div className={styles.formRow}>
                <div className={styles.formLabel}>姓</div>
                <input value={formLast} onChange={(e) => setFormLast(e.target.value)} className={styles.input} />
              </div>

              <div className={styles.formRow}>
                <div className={styles.formLabel}>名</div>
                <input value={formFirst} onChange={(e) => setFormFirst(e.target.value)} className={styles.input} />
              </div>

              <div className={styles.formRow}>
                <div className={styles.formLabel}>メール</div>
                <select value={formProfileId} onChange={(e) => setFormProfileId(e.target.value)} className={styles.select}>
                  <option value="">選択してください（profiles.email）</option>
                  {profileOptions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.email}
                    </option>
                  ))}
                </select>
              </div>

              <div className={styles.formRow}>
                <div className={styles.formLabel}>管理者</div>
                <input type="checkbox" checked={formIsAdmin} onChange={(e) => setFormIsAdmin(e.target.checked)} />
              </div>

              <hr className={styles.divider} />

              <div className={styles.block}>
                <div className={styles.blockHeader}>
                  <div className={styles.blockLabel}>所属組織</div>
                  <button type="button" onClick={addTeamRow} className={styles.btnPlus} disabled={saving}>
                    ＋ 所属組織を追加
                  </button>
                </div>

                {formTeamIds.map((teamId, idx) => (
                  <div key={`team-${idx}`} className={styles.dynamicRow}>
                    <select value={teamId} onChange={(e) => setTeamAt(idx, e.target.value)} className={styles.selectWide}>
                      <option value="">選択してください（teams）</option>
                      {teamOptions.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.label}
                        </option>
                      ))}
                    </select>

                    {idx > 0 && (
                      <button type="button" onClick={() => removeTeamRow(idx)} className={styles.btnMini} disabled={saving}>
                        削除
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <div className={styles.block}>
                <div className={styles.blockHeader}>
                  <div className={styles.blockLabel}>職種</div>
                  <button type="button" onClick={addJobRoleRow} className={styles.btnPlus} disabled={saving}>
                    ＋ 職種を追加
                  </button>
                </div>

                {formJobRoleIds.map((jobRoleId, idx) => (
                  <div key={`job-role-${idx}`} className={styles.dynamicRow}>
                    <select
                      value={jobRoleId}
                      onChange={(e) => setJobRoleAt(idx, e.target.value)}
                      className={styles.selectWide}
                    >
                      <option value="">選択してください（職種管理）</option>
                      {jobRoleOptions.map((jr) => {
                        const alreadyUsed = usedJobRoleIds.has(jr.id) && jr.id !== jobRoleId;
                        return (
                          <option key={jr.id} value={jr.id} disabled={alreadyUsed}>
                            {jr.name}
                          </option>
                        );
                      })}
                    </select>

                    {idx > 0 && (
                      <button type="button" onClick={() => removeJobRoleRow(idx)} className={styles.btnMini} disabled={saving}>
                        削除
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <div className={styles.modalButtonRow}>
                <button type="button" onClick={save} className={styles.btnRedBig} disabled={saving}>
                  {saving ? "保存中..." : mode === "edit" ? "更新する" : "登録する"}
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