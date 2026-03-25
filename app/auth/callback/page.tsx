"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/app/utils/supabase/client";

const ALLOWED_DOMAIN = "framelunch.jp";

export default function AuthCallbackPage() {
  const supabase = createClient();
  const router = useRouter();

  useEffect(() => {
    const checkDomain = async () => {
      const { data, error } = await supabase.auth.getUser();

      if (error || !data.user?.email) {
        await supabase.auth.signOut();
        router.replace("/login");
        return;
      }

      const email = data.user.email;
      const domain = email.split("@")[1];

      if (domain !== ALLOWED_DOMAIN) {
        // ❌ 許可されていないドメイン
        await supabase.auth.signOut();
        router.replace("/login?error=domain_not_allowed");
        return;
      }

      // ✅ 許可ドメイン
      router.replace("/summary");
    };

    checkDomain();
  }, [router, supabase]);

  return <p style={{ padding: 24 }}>Signing in...</p>;
}