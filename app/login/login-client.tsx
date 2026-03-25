"use client";

import Image from "next/image";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/app/utils/supabase/client";
import styles from "./login-client.module.css";

export default function LoginClient() {
  const supabase = createClient();
  const router = useRouter();
  const params = useSearchParams();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  const errorParam = params.get("error");

  const signIn = async () => {
    setMsg("");
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    setLoading(false);

    if (error) return setMsg(error.message);
    router.replace("/summary");
  };

  const loginWithGoogle = async () => {
    setMsg("");
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) setMsg(error.message);
  };

  return (
    <main className={styles.main}>
      <div className={`${styles.sideLogoWrap} ${styles.sideLogoLeft}`}>
        <Image
          src="/image/KINTSURU_rogo.png"
          alt="金鶴"
          width={420}
          height={420}
          className={styles.sideLogo}
          priority
        />
      </div>

      <div className={`${styles.sideLogoWrap} ${styles.sideLogoRight}`}>
        <Image
          src="/image/KINTSURU_rogo.png"
          alt="金鶴"
          width={420}
          height={420}
          className={styles.sideLogo}
          priority
        />
      </div>

      <section className={styles.centerWrap}>
        <div className={styles.titleWrap}>
          <Image
            src="/image/KINTSURU_title.png"
            alt="KINTSURU"
            width={340}
            height={74}
            className={styles.titleImage}
            priority
          />
          <p className={styles.subText}>今日も一日がんばりましょう</p>
        </div>

        {errorParam === "domain_not_allowed" && (
          <p className={styles.errorText}>
            このGoogleアカウントは使用できません（@framelunch.jp のみ許可）
          </p>
        )}

        <div className={styles.formWrap}>
          <div className={styles.fieldWrap}>
            <label className={styles.label}>メールアドレス</label>
            <input
              className={styles.input}
              placeholder="example@xxx.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </div>

          <div className={styles.fieldWrap}>
            <label className={styles.label}>パスワード</label>
            <input
              className={styles.input}
              placeholder="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              onKeyDown={(e) => {
                if (e.key === "Enter") signIn();
              }}
            />
          </div>

          <label className={styles.rememberRow}>
            <input type="checkbox" defaultChecked />
            <span>ログイン状態を保持する</span>
          </label>

          <button type="button" onClick={signIn} className={styles.loginButton} disabled={loading}>
            {loading ? "ログイン中..." : "ログイン"}
          </button>

          <button type="button" onClick={loginWithGoogle} className={styles.googleButton}>
            Continue with Google
          </button>

          {msg && <p className={styles.errorText}>{msg}</p>}
        </div>
      </section>

      <div className={styles.footerText}>Kintsuru | @framelunch</div>
    </main>
  );
}