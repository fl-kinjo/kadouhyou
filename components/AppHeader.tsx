"use client";

import { useState } from "react";
import Link from "next/link";

export default function AppHeader() {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* ===== ヘッダー ===== */}
      <header style={header}>
        <button onClick={() => setOpen(true)} style={hamburger}>
          ☰
        </button>

        <div style={{ fontWeight: 900 }}>KINTSURU</div>
      </header>

      {/* ===== オーバーレイ ===== */}
      {open && <div style={overlay} onClick={() => setOpen(false)} />}

      {/* ===== サイドメニュー ===== */}
      <aside
        style={{
          ...drawer,
          transform: open ? "translateX(0)" : "translateX(-100%)",
        }}
      >
        <div style={{ marginBottom: 20, fontWeight: 900 }}>メニュー</div>

        <nav style={{ display: "grid", gap: 14 }}>
          <MenuLink href="/projects" label="案件進捗管理" />
          <MenuLink href="/projects/search" label="案件検索" />
          <MenuLink href="/reports" label="業務報告" />
          <MenuLink href="/summary" label="サマリー" />
          <MenuLink href="/clients" label="クライアント管理" />
          <MenuLink href="/partners" label="パートナー管理" />
          <MenuLink href="/teams" label="組織登録" />
          <MenuLink href="/employees" label="社員登録" />
          <MenuLink href="/job-roles" label="職種登録" />
          <MenuLink href="/settings" label="設定" />
        </nav>
      </aside>
    </>
  );
}

function MenuLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} style={link}>
      {label}
    </Link>
  );
}

/* ===== style ===== */

const header: React.CSSProperties = {
  height: 56,
  background: "#fff",
  borderBottom: "1px solid #ddd",
  display: "flex",
  alignItems: "center",
  gap: 16,
  padding: "0 16px",
  position: "sticky",
  top: 0,
  zIndex: 40,
};

const hamburger: React.CSSProperties = {
  fontSize: 22,
  border: "none",
  background: "transparent",
  cursor: "pointer",
};

const overlay: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.3)",
  zIndex: 30,
};

const drawer: React.CSSProperties = {
  position: "fixed",
  top: 0,
  left: 0,
  width: 260,
  height: "100%",
  background: "#f5f5f5",
  padding: 20,
  zIndex: 40,
  transition: "0.25s",
  overflowY: "auto",
};

const link: React.CSSProperties = {
  textDecoration: "none",
  color: "#000",
  fontWeight: 700,
};