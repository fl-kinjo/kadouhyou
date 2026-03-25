"use client";

import { createClient } from "@/app/utils/supabase/client";
import { useRouter } from "next/navigation";

export default function SummaryPage() {
  const supabase = createClient();
  const router = useRouter();

  const logout = async () => {
    await supabase.auth.signOut();
    router.replace("/login");
  };

  return (
    <main style={{ padding: 24 }}>
      <h1>サマリー</h1>

      <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
        <button onClick={() => router.push("/projects")}>
          案件一覧へ
        </button>

        <button onClick={logout}>
          ログアウト
        </button>
      </div>
    </main>
  );
}