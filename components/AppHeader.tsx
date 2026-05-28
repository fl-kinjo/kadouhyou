"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/app/utils/supabase/client";

const MENU_GROUPS = [
  {
    key: "attendance",
    title: "勤怠系",
    items: [
      { href: "/attendance", label: "勤怠入力" },
      { href: "/attendance-management", label: "勤怠管理" },
      { href: "/leave-request", label: "休暇申請" },
      { href: "/report", label: "業務報告" },
    ],
  },
  {
    key: "request",
    title: "申請系",
    items: [
      { href: "/expenses", label: "経費申請" },
      { href: "/expenses-management", label: "経費管理" },
    ],
  },
  {
    key: "project",
    title: "案件系",
    items: [
      { href: "/project", label: "案件管理" },
      { href: "/summary", label: "案件サマリー" },
      { href: "/summary/sales2", label: "営業サマリー" },
      { href: "/client", label: "クライアント管理" },
      { href: "/partner", label: "パートナー管理" },
    ],
  },
  {
    key: "general",
    title: "総務管理系",
    items: [
      { href: "/employee", label: "社員管理" },
      { href: "/team", label: "組織管理" },
      { href: "/job", label: "職種管理" },
    ],
  },
] as const;

export default function AppHeader() {
  const [open, setOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  const initialGroupState = useMemo(
    () =>
      MENU_GROUPS.reduce<Record<string, boolean>>((acc, group) => {
        acc[group.key] = false;
        return acc;
      }, {}),
    []
  );

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(initialGroupState);

  if (pathname === "/login") {
    return null;
  }

  const closeDrawer = () => setOpen(false);

  const toggleGroup = (groupKey: string) => {
    setOpenGroups((current) => ({
      ...current,
      [groupKey]: !current[groupKey],
    }));
  };

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
        <button onClick={() => setOpen(true)} style={hamburger} type="button">
          ☰
        </button>

        <Link href="/top" style={logoLink} onClick={closeDrawer}>
          <Image
            src="/image/header-logo.png"
            alt="KINTSURU"
            width={200}
            height={60}
            priority
            style={logoImage}
          />
        </Link>
      </header>

      {open && <div style={overlay} onClick={closeDrawer} />}

      <aside
        style={{
          ...drawer,
          transform: open ? "translateX(0)" : "translateX(-100%)",
        }}
      >
        <div style={{ marginBottom: 20, fontWeight: 900 }}>メニュー</div>

        <nav style={navWrap}>
          <MenuLink href="/top" label="トップ" onClick={closeDrawer} />

          {MENU_GROUPS.map((group) => {
            const isOpen = openGroups[group.key];

            return (
              <div key={group.key} style={groupWrap}>
                <button
                  type="button"
                  onClick={() => toggleGroup(group.key)}
                  style={groupButton}
                >
                  <span>{group.title}</span>
                  <span style={groupChevron}>{isOpen ? "▾" : "▸"}</span>
                </button>

                {isOpen && (
                  <div style={groupLinks}>
                    {group.items.map((item) => (
                      <MenuLink
                        key={item.href}
                        href={item.href}
                        label={item.label}
                        onClick={closeDrawer}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          <button type="button" onClick={logout} style={logoutButton} disabled={loggingOut}>
            {loggingOut ? "ログアウト中..." : "ログアウト"}
          </button>
        </nav>
      </aside>
    </>
  );
}

function MenuLink({
  href,
  label,
  onClick,
}: {
  href: string;
  label: string;
  onClick?: () => void;
}) {
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

const logoLink: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  textDecoration: "none",
  marginTop: 10,
};

const logoImage: React.CSSProperties = {
  width: "auto",
  height: 60,
  objectFit: "contain",
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
  width: 280,
  height: "100%",
  background: "#f5f5f5",
  padding: 20,
  zIndex: 40,
  transition: "0.25s",
  overflowY: "auto",
};

const navWrap: React.CSSProperties = {
  display: "grid",
  gap: 18,
};

const groupWrap: React.CSSProperties = {
  display: "grid",
  gap: 8,
};

const groupButton: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  width: "100%",
  border: "none",
  background: "transparent",
  padding: 0,
  color: "#666",
  fontSize: 13,
  fontWeight: 900,
  cursor: "pointer",
  textAlign: "left",
};

const groupChevron: React.CSSProperties = {
  fontSize: 14,
  color: "#666",
};

const groupLinks: React.CSSProperties = {
  display: "grid",
  gap: 12,
  paddingLeft: 12,
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