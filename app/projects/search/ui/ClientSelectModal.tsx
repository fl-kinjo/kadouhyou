"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/app/utils/supabase/client";

export type ClientLite = {
  id: string;
  name: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  initialSelectedIds: string[];
  onConfirm: (selected: ClientLite[]) => void;
};

const KANA_ROWS = ["指定なし", "あ", "か", "さ", "た", "な", "は", "ま", "や", "ら", "わ", "その他"] as const;
type KanaRow = (typeof KANA_ROWS)[number];

function kanaRowOf(name: string): KanaRow {
  const s = (name ?? "").trim();
  if (!s) return "その他";
  const c = s[0];

  // ざっくりの判定（ひらがな/カタカナ/漢字混在でも落ちないように「その他」へ寄せる）
  const toHira = (ch: string) => {
    const code = ch.charCodeAt(0);
    // カタカナ→ひらがな（全角）変換の範囲
    if (code >= 0x30a1 && code <= 0x30f6) return String.fromCharCode(code - 0x60);
    return ch;
  };
  const h = toHira(c);

  const inRange = (from: string, to: string) => h >= from && h <= to;

  if (inRange("あ", "お")) return "あ";
  if (inRange("か", "ご")) return "か";
  if (inRange("さ", "ぞ")) return "さ";
  if (inRange("た", "ど")) return "た";
  if (inRange("な", "の")) return "な";
  if (inRange("は", "ぽ")) return "は";
  if (inRange("ま", "も")) return "ま";
  if (inRange("や", "よ")) return "や";
  if (inRange("ら", "ろ")) return "ら";
  if (inRange("わ", "ん")) return "わ";

  return "その他";
}

export default function ClientSelectModal({ open, onClose, initialSelectedIds, onConfirm }: Props) {
  const supabase = createClient();

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  const [clients, setClients] = useState<ClientLite[]>([]);
  const [activeKana, setActiveKana] = useState<KanaRow>("指定なし");

  // モーダル内部の一時選択（確定まで SearchClient へ反映しない）
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;

    // openの度に初期値を復元
    setSelectedIds(new Set(initialSelectedIds));
    setActiveKana("指定なし");
    setMsg("");

    const load = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase.from("clients").select("id,name").order("name", { ascending: true });
        if (error) throw new Error(error.message);

        const list = (data ?? []) as any[];
        setClients(
          list.map((r) => ({
            id: String(r.id),
            name: String(r.name ?? ""),
          }))
        );
      } catch (e: any) {
        setMsg(e?.message ?? String(e));
      } finally {
        setLoading(false);
      }
    };

    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const grouped = useMemo(() => {
    const map = new Map<KanaRow, ClientLite[]>();
    for (const k of KANA_ROWS) map.set(k, []);
    for (const c of clients) {
      const k = kanaRowOf(c.name);
      map.get(k)!.push(c);
    }
    // 「指定なし」は一覧表示用として空にしておく（右側は全件表示にする）
    map.set("指定なし", []);
    return map;
  }, [clients]);

  const rightList = useMemo(() => {
    if (activeKana === "指定なし") return clients;
    return grouped.get(activeKana) ?? [];
  }, [activeKana, clients, grouped]);

  const selectedList = useMemo(() => {
    const m = new Map(clients.map((c) => [c.id, c]));
    return Array.from(selectedIds)
      .map((id) => m.get(id))
      .filter(Boolean) as ClientLite[];
  }, [clients, selectedIds]);

  const toggle = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const clear = () => setSelectedIds(new Set());

  const confirm = () => onConfirm(selectedList);

  if (!open) return null;

  return (
    <div style={overlay} onClick={onClose}>
      <div style={card} onClick={(e) => e.stopPropagation()}>
        {/* header */}
        <div style={header}>
          <div style={{ fontSize: 20, fontWeight: 900 }}>クライアントを選択</div>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <button type="button" onClick={onClose} style={btnGhost}>
              閉じる
            </button>
            <button type="button" onClick={confirm} style={btnRed}>
              確定
            </button>
          </div>
        </div>

        {msg && <p style={{ marginTop: 10, color: "#b00", fontWeight: 800 }}>{msg}</p>}

        <div style={body}>
          {/* left: selected */}
          <div style={colLeft}>
            <div style={{ fontWeight: 900, marginBottom: 10 }}>選択中のクライアント</div>

            {selectedList.length === 0 ? (
              <div style={{ color: "#777" }}>（未選択）</div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {selectedList.map((c) => (
                  <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={chipCheck}>✓</span>
                    <span style={{ fontWeight: 800 }}>{c.name}</span>
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

          {/* middle: kana */}
          <div style={colMid}>
            <div style={{ color: "#777", fontSize: 12, marginBottom: 10 }}>※複数選択が可能です</div>
            <div style={{ display: "grid" }}>
              {KANA_ROWS.map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setActiveKana(k)}
                  style={{
                    ...kanaBtn,
                    ...(activeKana === k ? kanaBtnActive : null),
                  }}
                >
                  <span>{k}</span>
                  <span style={{ opacity: 0.6 }}>›</span>
                </button>
              ))}
            </div>
          </div>

          {/* right: list */}
          <div style={colRight}>
            {loading ? (
              <div style={{ color: "#777" }}>読み込み中...</div>
            ) : rightList.length === 0 ? (
              <div style={{ color: "#777" }}>（該当なし）</div>
            ) : (
              <div style={{ display: "grid", gap: 14 }}>
                {rightList.map((c) => {
                  const checked = selectedIds.has(c.id);
                  return (
                    <label key={c.id} style={itemRow}>
                      <input type="checkbox" checked={checked} onChange={() => toggle(c.id)} />
                      <span style={{ fontWeight: 800 }}>{c.name}</span>
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
  zIndex: 100,
};

const card: React.CSSProperties = {
  width: "min(920px, calc(100vw - 32px))",   // ← 1100px → 920px に縮小 + 画面からはみ出さない
  maxHeight: "calc(100vh - 32px)",           // ← 画面高さ内に収める
  background: "#fff",
  borderRadius: 10,
  border: "1px solid #ddd",
  overflow: "hidden",
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
  gridTemplateColumns: "260px 200px 1fr",    // ← 320/260 を縮小（サイズ調整のみ）
  minHeight: 420,                            // ← 520 を縮小
  maxHeight: "calc(100vh - 32px - 64px)",    // ← header分を引いて、本文だけスクロール可能に
  overflow: "auto",
};

const colLeft: React.CSSProperties = {
  padding: 18,
  borderRight: "1px solid #eee",
};

const colMid: React.CSSProperties = {
  padding: 18,
  borderRight: "1px solid #eee",
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

const kanaBtn: React.CSSProperties = {
  border: "none",
  background: "transparent",
  padding: "12px 10px",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  fontWeight: 900,
  borderRadius: 6,
};

const kanaBtnActive: React.CSSProperties = {
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