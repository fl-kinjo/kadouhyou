"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/app/utils/supabase/client";

export type MemberLite = {
  user_id: string;
  name: string;
  email?: string;
};

type TeamRow = {
  id: string;
  name: string;
  parent_id: string | null;
};

type EmployeeTeamRow = {
  team_id: string;
  employee_id: string;
};

type EmployeeRow = {
  id: string;
  user_id: string | null;
  last_name: string | null;
  first_name: string | null;
  email: string | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
  initialSelectedUserIds: string[];
  onConfirm: (selected: MemberLite[]) => void;
};

type TreeNode = {
  id: string;
  name: string;
  parent_id: string | null;
  children: TreeNode[];
};

function fullName(last: string | null, first: string | null) {
  const l = (last ?? "").trim();
  const f = (first ?? "").trim();
  return `${l}${l && f ? " " : ""}${f}`.trim() || "（名前未設定）";
}

function buildTree(rows: TeamRow[]) {
  const map = new Map<string, TreeNode>();

  for (const r of rows) {
    map.set(r.id, {
      id: r.id,
      name: r.name,
      parent_id: r.parent_id,
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

  const sortRec = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => a.name.localeCompare(b.name, "ja"));
    for (const n of nodes) sortRec(n.children);
  };
  sortRec(roots);

  return roots;
}

function flattenTree(nodes: TreeNode[], depth = 0) {
  const out: Array<{ node: TreeNode; depth: number }> = [];
  for (const n of nodes) {
    out.push({ node: n, depth });
    out.push(...flattenTree(n.children, depth + 1));
  }
  return out;
}

export default function MemberSelectModal({
  open,
  onClose,
  initialSelectedUserIds,
  onConfirm,
}: Props) {
  const supabase = createClient();

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [employeeTeams, setEmployeeTeams] = useState<EmployeeTeamRow[]>([]);
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);

  const [activeTeamId, setActiveTeamId] = useState<string>("");
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;

    setSelectedUserIds(new Set(initialSelectedUserIds));
    setMsg("");

    const load = async () => {
      setLoading(true);
      try {
        const [{ data: t, error: tErr }, { data: et, error: etErr }, { data: e, error: eErr }] =
          await Promise.all([
            supabase.from("teams").select("id,name,parent_id").order("name", { ascending: true }),
            supabase.from("employee_teams").select("team_id,employee_id"),
            supabase.from("employees").select("id,user_id,last_name,first_name,email"),
          ]);

        if (tErr) throw new Error(tErr.message);
        if (etErr) throw new Error(etErr.message);
        if (eErr) throw new Error(eErr.message);

        const teamRows = (t ?? []) as TeamRow[];
        setTeams(teamRows);
        setEmployeeTeams((et ?? []) as EmployeeTeamRow[]);
        setEmployees((e ?? []) as EmployeeRow[]);

        setActiveTeamId(teamRows[0]?.id ?? "");
      } catch (err: any) {
        setMsg(err?.message ?? String(err));
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [open, initialSelectedUserIds, supabase]);

  const roots = useMemo(() => buildTree(teams), [teams]);
  const flatTeams = useMemo(() => flattenTree(roots), [roots]);

  const teamToEmployeeIds = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const row of employeeTeams) {
      if (!m.has(row.team_id)) m.set(row.team_id, []);
      m.get(row.team_id)!.push(String(row.employee_id));
    }
    return m;
  }, [employeeTeams]);

  const employeeMap = useMemo(() => {
    const m = new Map<string, EmployeeRow>();
    for (const e of employees) {
      m.set(String(e.id), e);
    }
    return m;
  }, [employees]);

  const userIdToEmployee = useMemo(() => {
    const m = new Map<string, EmployeeRow>();
    for (const e of employees) {
      if (!e.user_id) continue;
      m.set(String(e.user_id), e);
    }
    return m;
  }, [employees]);

  const rightMembers: MemberLite[] = useMemo(() => {
    if (!activeTeamId) return [];
    const employeeIds = teamToEmployeeIds.get(activeTeamId) ?? [];
    const uniqIds = Array.from(new Set(employeeIds));

    return uniqIds
      .map((eid) => {
        const e = employeeMap.get(eid);
        return {
          user_id: String(e?.user_id ?? ""),
          name: fullName(e?.last_name ?? null, e?.first_name ?? null),
          email: e?.email ?? undefined,
        };
      })
      .filter((m) => m.user_id !== "")
      .sort((a, b) => a.name.localeCompare(b.name, "ja"));
  }, [activeTeamId, teamToEmployeeIds, employeeMap]);

  const selectedList: MemberLite[] = useMemo(() => {
    return Array.from(selectedUserIds)
      .map((uid) => {
        const e = userIdToEmployee.get(uid);
        return {
          user_id: uid,
          name: fullName(e?.last_name ?? null, e?.first_name ?? null),
          email: e?.email ?? undefined,
        };
      })
      .filter((m) => m.user_id !== "")
      .sort((a, b) => a.name.localeCompare(b.name, "ja"));
  }, [selectedUserIds, userIdToEmployee]);

  const toggleUser = (uid: string) => {
    setSelectedUserIds((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  };

  const clear = () => setSelectedUserIds(new Set());

  const toggleAllInActiveTeam = () => {
    const ids = rightMembers.map((m) => m.user_id);
    const allSelected = ids.length > 0 && ids.every((id) => selectedUserIds.has(id));

    setSelectedUserIds((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        for (const id of ids) next.delete(id);
      } else {
        for (const id of ids) next.add(id);
      }
      return next;
    });
  };

  const confirm = () => onConfirm(selectedList);

  if (!open) return null;

  return (
    <div style={overlay} onClick={onClose}>
      <div style={card} onClick={(e) => e.stopPropagation()}>
        <div style={header}>
          <div style={{ fontSize: 22, fontWeight: 900 }}>メンバーを選択</div>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <button type="button" onClick={onClose} style={btnGhost}>
              閉じる
            </button>
            <button type="button" onClick={confirm} style={btnRed}>
              確定
            </button>
          </div>
        </div>

        {msg && <p style={{ margin: "10px 18px 0", color: "#b00", fontWeight: 800 }}>{msg}</p>}

        <div style={body}>
          <div style={colLeft}>
            <div style={{ fontWeight: 900, marginBottom: 10 }}>選択中のメンバー</div>

            {selectedList.length === 0 ? (
              <div style={{ color: "#777" }}>（未選択）</div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {selectedList.map((m) => (
                  <div key={m.user_id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={chipCheck}>✓</span>
                    <div>
                      <div style={{ fontWeight: 800 }}>{m.name}</div>
                      {m.email ? <div style={{ color: "#777", fontSize: 12 }}>{m.email}</div> : null}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div style={{ marginTop: 16 }}>
              <button type="button" onClick={clear} style={btnSmallGhost}>
                選択解除
              </button>
            </div>
          </div>

          <div style={colMid}>
            <div style={{ color: "#777", fontSize: 12, marginBottom: 10 }}>※複数選択が可能です</div>

            {loading ? (
              <div style={{ color: "#777" }}>読み込み中...</div>
            ) : flatTeams.length === 0 ? (
              <div style={{ color: "#777" }}>チームがありません</div>
            ) : (
              <div style={{ display: "grid" }}>
                <button
                  type="button"
                  onClick={() => setActiveTeamId("")}
                  style={{
                    ...teamBtn,
                    ...(activeTeamId === "" ? teamBtnActive : null),
                  }}
                >
                  <span>指定なし</span>
                  <span style={{ opacity: 0.6 }}>›</span>
                </button>

                {flatTeams.map(({ node, depth }) => (
                  <button
                    key={node.id}
                    type="button"
                    onClick={() => setActiveTeamId(node.id)}
                    style={{
                      ...teamBtn,
                      ...(activeTeamId === node.id ? teamBtnActive : null),
                    }}
                  >
                    <span style={{ paddingLeft: depth * 18 }}>{node.name}</span>
                    <span style={{ opacity: 0.6 }}>›</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div style={colRight}>
            {activeTeamId ? (
              <label style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                <input
                  type="checkbox"
                  checked={rightMembers.length > 0 && rightMembers.every((m) => selectedUserIds.has(m.user_id))}
                  onChange={toggleAllInActiveTeam}
                />
                <span style={{ fontWeight: 900 }}>このチームの全メンバー</span>
              </label>
            ) : null}

            {loading ? (
              <div style={{ color: "#777" }}>読み込み中...</div>
            ) : !activeTeamId ? (
              <div style={{ color: "#777" }}>（チームを選択してください）</div>
            ) : rightMembers.length === 0 ? (
              <div style={{ color: "#777" }}>（このチームにメンバーがいません）</div>
            ) : (
              <div style={{ display: "grid", gap: 14 }}>
                {rightMembers.map((m) => {
                  const checked = selectedUserIds.has(m.user_id);
                  return (
                    <label key={m.user_id} style={itemRow}>
                      <input type="checkbox" checked={checked} onChange={() => toggleUser(m.user_id)} />
                      <div>
                        <div style={{ fontWeight: 800 }}>{m.name}</div>
                        {m.email ? <div style={{ color: "#777", fontSize: 12 }}>{m.email}</div> : null}
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ===== styles ===== */

const overlay: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.35)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 16,
  zIndex: 120,
};

const card: React.CSSProperties = {
  width: "min(1100px, 100%)",
  maxHeight: "min(720px, calc(100dvh - 32px))",
  background: "#fff",
  borderRadius: 10,
  border: "1px solid #ddd",
  overflow: "hidden",
  display: "flex",
  flexDirection: "column",
};

const header: React.CSSProperties = {
  position: "sticky",
  top: 0,
  background: "#fff",
  zIndex: 1,
  padding: "18px 20px",
  borderBottom: "1px solid #eee",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
};

const body: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "320px 320px 1fr",
  minHeight: 520,
  flex: 1,
};

const colLeft: React.CSSProperties = {
  padding: 18,
  borderRight: "1px solid #eee",
  overflow: "auto",
};

const colMid: React.CSSProperties = {
  padding: 18,
  borderRight: "1px solid #eee",
  overflow: "auto",
};

const colRight: React.CSSProperties = {
  padding: 18,
  overflow: "auto",
};

const btnRed: React.CSSProperties = {
  border: "none",
  background: "#b00",
  color: "#fff",
  borderRadius: 999,
  padding: "12px 28px",
  fontWeight: 900,
  cursor: "pointer",
};

const btnGhost: React.CSSProperties = {
  border: "2px solid #bbb",
  background: "#fff",
  borderRadius: 999,
  padding: "10px 22px",
  fontWeight: 900,
  cursor: "pointer",
};

const btnSmallGhost: React.CSSProperties = {
  border: "2px solid #bbb",
  background: "#fff",
  borderRadius: 999,
  padding: "10px 16px",
  fontWeight: 900,
  cursor: "pointer",
};

const teamBtn: React.CSSProperties = {
  border: "none",
  background: "transparent",
  padding: "12px 10px",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  fontWeight: 900,
  borderRadius: 6,
  textAlign: "left",
};

const teamBtnActive: React.CSSProperties = {
  background: "#eee",
};

const itemRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
};

const chipCheck: React.CSSProperties = {
  width: 22,
  height: 22,
  borderRadius: 999,
  background: "#666",
  color: "#fff",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 12,
  fontWeight: 900,
};