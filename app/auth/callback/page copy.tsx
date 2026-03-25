"use client";

import { useEffect } from "react";
import { createClient } from "@/app/utils/supabase/client";
import { useRouter } from "next/navigation";

export default function AuthCallbackPage() {
  const supabase = createClient();
  const router = useRouter();

  useEffect(() => {
    // OAuth後のセッション確定（Cookie保存）
    supabase.auth.getSession().then(() => {
      router.replace("/summary");
    });
  }, [router, supabase]);

  return <p style={{ padding: 24 }}>Signing in...</p>;
}