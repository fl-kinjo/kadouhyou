"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/app/utils/supabase/client";
import styles from "./team-client.module.css";

type TeamRow = {
  id: string;
  name: string;
  parent_id: string | null;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
};

type ProfileRow = {
  id: string;
  status: number | null;
};

type ProfileTeamRow = {
  profile_id: string;
  team_id: string;
};

type TreeNode = {
  id: string;
  name: string;
  parent_id: string | null;
  children: TreeNode[];
};

function buildTree(rows: TeamRow[]) {
  const map = new Map<string, TreeNode>();

  for (const row of rows) {
    map.set(row.id, {
      id: row.id,
      name: row.name,
      parent_id: row.parent_id,
      children: [],
    });
  }

  const roots: TreeNode[] = [];

  for (const node of map.values()) {
    if (node.parent_id && map.has(node.parent_id)) {
      map.get(node.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const sortRecursively = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => a.name.localeCompare(b.name, "ja"));
    for (const node of nodes) {
      sortRecursively(node.children);
    }
  };

  sortRecursively(roots);

  return { roots, map };
}

function flattenTree(nodes: TreeNode[], depth = 0) {
  const result: Array<{ node: TreeNode; depth: number }> = [];

  for (const node of nodes) {
    result.push({ node, depth });
    result.push(...flattenTree(node.children, depth + 1));
  }

  return result;
}

function collectDescendants(rootId: string, map: Map<string, TreeNode>) {
  const ids = new Set<string>();
  const root = map.get(rootId);

  if (!root) return ids;

  const walk = (node: TreeNode) => {
    for (const child of node.children) {
      ids.add(child.id);
      walk(child);
    }
  };

  walk(root);
  return ids;
}

export default function TeamClient() {
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [rows, setRows] = useState<TeamRow[]>([]);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [profileTeams, setProfileTeams] = useState<ProfileTeamRow[]>([]);

  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"create" | "edit">("create");
  const [editId, setEditId] = useState<string | null>(null);

  const [formName, setFormName] = useState("");
  const [formParentId, setFormParentId] = useState("");

  const load = async () => {
    setLoading(true);
    setMsg("");

    try {
      const [
        { data: teamData, error: teamError },
        { data: profileTeamData, error: profileTeamError },
        { data: profileData, error: profileError },
      ] = await Promise.all([
        supabase
          .from("team")
          .select("id,name,parent_id,created_at,updated_at,updated_by")
          .order("created_at", { ascending: true }),
        supabase.from("profile_team").select("profile_id,team_id"),
        supabase.from("profiles_2").select("id,status"),
      ]);

      if (teamError) throw new Error(teamError.message);
      if (profileTeamError) throw new Error(profileTeamError.message);
      if (profileError) throw new Error(profileError.message);
      setRows((teamData ?? []) as TeamRow[]);
      setProfiles((profileData ?? []) as ProfileRow[]);
      setProfileTeams((profileTeamData ?? []) as ProfileTeamRow[]);
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

  const { roots, map } = useMemo(() => buildTree(rows), [rows]);
  const flat = useMemo(() => flattenTree(roots), [roots]);

  const memberCountMap = useMemo(() => {
    const activeProfileIds = new Set(
      profiles.filter((profile) => profile.status !== 2).map((profile) => profile.id)
    );
    const counts = new Map<string, number>();

    for (const relation of profileTeams) {
      if (!activeProfileIds.has(relation.profile_id)) continue;
      counts.set(relation.team_id, (counts.get(relation.team_id) ?? 0) + 1);
    }

    return counts;
  }, [profileTeams, profiles]);

  const excludedParentIds = useMemo(() => {
    if (!editId) return new Set<string>();
    const descendants = collectDescendants(editId, map);
    descendants.add(editId);
    return descendants;
  }, [editId, map]);

  const parentOptions = useMemo(() => {
    return flat
      .filter(({ node }) => {
        if (mode !== "edit") return true;
        return !excludedParentIds.has(node.id);
      })
      .map(({ node, depth }) => ({
        id: node.id,
        label: `${"　".repeat(depth)}${node.name}`,
      }));
  }, [flat, mode, excludedParentIds]);

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

  const openCreate = () => {
    setMsg("");
    setMode("create");
    setEditId(null);
    setFormName("");
    setFormParentId("");
    setOpen(true);
  };

  const openEdit = (teamId: string) => {
    const row = rows.find((item) => item.id === teamId);
    if (!row) return;

    setMsg("");
    setMode("edit");
    setEditId(teamId);
    setFormName(row.name ?? "");
    setFormParentId(row.parent_id ?? "");
    setOpen(true);
  };

  const closeModal = () => {
    setOpen(false);
    setSaving(false);
    setMode("create");
    setEditId(null);
  };

  const save = async () => {
    setMsg("");

    const name = formName.trim();
    if (!name) return setMsg("チーム名を入力してください。");

    setSaving(true);

    try {
      const profileId = await getCurrentProfileId();
      const payload = {
        name,
        parent_id: formParentId || null,
        updated_by: profileId,
      };

      if (mode === "edit" && editId) {
        const { error } = await supabase.from("team").update(payload).eq("id", editId);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabase.from("team").insert(payload);
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

  const remove = async (teamId: string) => {
    const team = rows.find((item) => item.id === teamId);
    const ok = window.confirm(`このチームを削除しますか？\n\n${team?.name ?? ""}`);
    if (!ok) return;

    setMsg("");
    setSaving(true);

    try {
      const { error: childUpdateError } = await supabase
        .from("team")
        .update({ parent_id: null })
        .eq("parent_id", teamId);

      if (childUpdateError) throw new Error(childUpdateError.message);

      const { error: deleteError } = await supabase.from("team").delete().eq("id", teamId);
      if (deleteError) throw new Error(deleteError.message);

      await load();
    } catch (e: any) {
      setMsg(e?.message ?? String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section>
      <div className={styles.actionsRow}>
        <button type="button" onClick={openCreate} className={styles.btnRed}>
          ＋ 新規チーム登録
        </button>
      </div>

      <div className={styles.sectionBorder} />

      <div className={styles.tableOuter}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.thHead}>チーム名</th>
              <th className={styles.thHead}>人数</th>
              <th className={styles.thHeadRight}>操作</th>
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td className={styles.td} colSpan={3}>
                  読み込み中...
                </td>
              </tr>
            ) : flat.length === 0 ? (
              <tr>
                <td className={styles.td} colSpan={3}>
                  まだチームがありません。
                </td>
              </tr>
            ) : (
              flat.map(({ node, depth }) => (
                <tr key={node.id}>
                  <td className={styles.td}>
                    <span className={styles.teamName} style={{ paddingLeft: `${depth * 24}px` }}>
                      {node.name}
                    </span>
                  </td>
                  <td className={styles.td}>{memberCountMap.get(node.id) ?? 0}</td>
                  <td className={styles.tdRight}>
                    <div className={styles.operationButtons}>
                      <button
                        type="button"
                        onClick={() => openEdit(node.id)}
                        className={styles.btnSmall}
                        disabled={saving}
                      >
                        編集
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(node.id)}
                        className={styles.btnSmall}
                        disabled={saving}
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
              <h2 className={styles.modalTitle}>{mode === "edit" ? "編集" : "登録"}</h2>
              <button type="button" onClick={closeModal} className={styles.btnX} aria-label="close">
                ✕
              </button>
            </div>

            <div className={styles.modalForm}>
              <div className={styles.formRow}>
                <div className={styles.formLabel}>チーム名</div>
                <input
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className={styles.input}
                />
              </div>

              <div className={styles.formRow}>
                <div className={styles.formLabel}>親チーム</div>
                <select
                  value={formParentId}
                  onChange={(e) => setFormParentId(e.target.value)}
                  className={styles.select}
                >
                  <option value="">（なし）</option>
                  {parentOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className={styles.modalButtonRow}>
                <button type="button" onClick={save} disabled={saving} className={styles.btnRedBig}>
                  {saving ? "保存中..." : mode === "edit" ? "更新する" : "登録する"}
                </button>
              </div>

              {msg && <p className={styles.modalErrorText}>{msg}</p>}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
