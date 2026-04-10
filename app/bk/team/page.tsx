import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/app/utils/supabase/server";
import TeamClient from "./team-client";
import styles from "./team-client.module.css";

export default async function TeamPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");

  return (
    <main className={styles.page}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>チーム管理画面</h1>

        <div className={styles.pageHeaderLinks}>
          <Link href="/projects" className={styles.headerLink}>
            案件一覧へ
          </Link>
        </div>
      </div>

      <div className={styles.topBorder} />

      <TeamClient />
    </main>
  );
}
