"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/app/utils/supabase/client";
import styles from "./teams-client.module.css";

type TeamRow = {
  id: string;
  name: string;
  parent_id: string | null;
  member_count: number | string | null;
  created_at: string;
};

function toNumber(v: number | string | null | undefined) {
  if (v == null) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

type TreeNode = {
  id: string;
  name: string;
  parent_id: string | null;
  member_count: number;
  children: TreeNode[];
};

function buildTree(rows: TeamRow[]) {
  const map = new Map<string, TreeNode>();
  for (const r of rows) {
    map.set(r.id, {
      id: r.id,
      name: r.name,
      parent_id: r.parent_id,
      member_count: toNumber(r.member_count),
      children: [],
    });
  }

  const roots: TreeNode[] = [];
  for (const n of map.values()) {
    if (n.parent_id && map.has(n.parent_id)) {
      map.get(n.parent_id)!.children.push(n);
    } else {
      roots.push(n);
    }
  }

  const sortRec = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => a.name.localeCompare(b.name, "ja"));
    for (const n of nodes) sortRec(n.children);
  };
  sortRec(roots);

  return { roots, map };
}

function flattenTree(nodes: TreeNode[], depth = 0) {
  const out: Array<{ node: TreeNode; depth: number }> = [];
  for (const n of nodes) {
    out.push({ node: n, depth });
    out.push(...flattenTree(n.children, depth + 1));
  }
  return out;
}

function collectDescendants(rootId: string, map: Map<string, TreeNode>) {
  const set = new Set<string>();
  const root = map.get(rootId);
  if (!root) return set;

  const dfs = (n: TreeNode) => {
    for (const c of n.children) {
      set.add(c.id);
      dfs(c);
    }
  };
  dfs(root);
  return set;
}

export default function TeamsClient() {
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [rows, setRows] = useState<TeamRow[]>([]);

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [mode, setMode] = useState<"create" | "edit">("create");
  const [editId, setEditId] = useState<string | null>(null);

  const [formName, setFormName] = useState("");
  const [formParentId, setFormParentId] = useState<string>("");

  const load = async () => {
    setLoading(true);
    setMsg("");

    try {
      const { data, error } = await supabase
        .from("teams_with_counts")
        .select("id,name,parent_id,member_count,created_at");

      if (error) throw new Error(error.message);
      setRows((data ?? []) as TeamRow[]);
    } catch (e: any) {
      setMsg(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const { roots, map } = useMemo(() => buildTree(rows), [rows]);
  const flat = useMemo(() => flattenTree(roots), [roots]);

  const excludedParentIds = useMemo(() => {
    if (!editId) return new Set<string>();
    const desc = collectDescendants(editId, map);
    desc.add(editId);
    return desc;
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

  const openCreate = () => {
    setMsg("");
    setMode("create");
    setEditId(null);
    setFormName("");
    setFormParentId("");
    setOpen(true);
  };

  const openEdit = (teamId: string) => {
    setMsg("");
    const t = rows.find((x) => x.id === teamId);
    if (!t) return;

    setMode("edit");
    setEditId(teamId);
    setFormName(t.name ?? "");
    setFormParentId(t.parent_id ?? "");
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
    if (!name) return setMsg("組織名を入力してください。");

    setSaving(true);
    try {
      const parent_id = formParentId ? formParentId : null;

      if (mode === "edit" && editId) {
        const { error } = await supabase
          .from("teams")
          .update({ name, parent_id })
          .eq("id", editId);

        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabase.from("teams").insert({ name, parent_id });
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

  const del = async (teamId: string) => {
    const t = rows.find((x) => x.id === teamId);
    const ok = confirm(`このチームを削除しますか？\n\n${t?.name ?? ""}`);
    if (!ok) return;

    setMsg("");
    setSaving(true);
    try {
      const { error: e1 } = await supabase.from("teams").update({ parent_id: null }).eq("parent_id", teamId);
      if (e1) throw new Error(e1.message);

      const { error: e2 } = await supabase.from("teams").delete().eq("id", teamId);
      if (e2) throw new Error(e2.message);

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
              <th className={styles.thHead}>部署名</th>
              <th className={styles.thHeadCenter}>メンバー数</th>
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
                    <span
                      className={styles.teamName}
                      style={{ paddingLeft: `${depth * 24}px` }}
                    >
                      {node.name}
                    </span>
                  </td>
                  <td className={styles.tdCenter}>{node.member_count}名</td>
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
                        onClick={() => del(node.id)}
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
                <div className={styles.formLabel}>組織名</div>
                <input
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className={styles.input}
                />
              </div>

              <div className={styles.formRow}>
                <div className={styles.formLabel}>親組織</div>
                <select
                  value={formParentId}
                  onChange={(e) => setFormParentId(e.target.value)}
                  className={styles.select}
                >
                  <option value="">（なし）</option>
                  {parentOptions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
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