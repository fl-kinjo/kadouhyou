"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/app/utils/supabase/client";

export default function AppHeader() {
  const [open, setOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  if (pathname === "/login") {
    return null;
  }

  const logout = async () => {
    setLoggingOut(true);
    await supabase.auth.signOut();
    setOpen(false);
    router.replace("/login");
    router.refresh();
    setLoggingOut(false);
  };

  return (
    <>
      <header style={header}>
        <button onClick={() => setOpen(true)} style={hamburger}>
          ☰
        </button>

        <div style={{ fontWeight: 900 }}>KINTSURU</div>
      </header>

      {open && <div style={overlay} onClick={() => setOpen(false)} />}

      <aside
        style={{
          ...drawer,
          transform: open ? "translateX(0)" : "translateX(-100%)",
        }}
      >
        <div style={{ marginBottom: 20, fontWeight: 900 }}>メニュー</div>

        <nav style={{ display: "grid", gap: 14 }}>
          <MenuLink href="/project" label="案件管理" onClick={() => setOpen(false)} />
          <MenuLink href="/report" label="業務報告" onClick={() => setOpen(false)} />
          <MenuLink href="/summary" label="サマリー" onClick={() => setOpen(false)} />
          <MenuLink href="/client" label="クライアント管理" onClick={() => setOpen(false)} />
          <MenuLink href="/partner" label="パートナー管理" onClick={() => setOpen(false)} />
          <MenuLink href="/team" label="組織管理" onClick={() => setOpen(false)} />
          <MenuLink href="/employee" label="社員管理" onClick={() => setOpen(false)} />
          <MenuLink href="/job" label="職種管理" onClick={() => setOpen(false)} />

          <button type="button" onClick={logout} style={logoutButton} disabled={loggingOut}>
            {loggingOut ? "ログアウト中..." : "ログアウト"}
          </button>
        </nav>
      </aside>
    </>
  );
}

function MenuLink({ href, label, onClick }: { href: string; label: string; onClick?: () => void }) {
  return (
    <Link href={href} style={link} onClick={onClick}>
      {label}
    </Link>
  );
}

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

const logoutButton: React.CSSProperties = {
  textAlign: "left",
  border: "none",
  background: "transparent",
  color: "#000",
  fontWeight: 700,
  cursor: "pointer",
  padding: 0,
  fontSize: "inherit",
};