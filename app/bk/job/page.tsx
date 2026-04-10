import { redirect } from "next/navigation";
import { createClient } from "@/app/utils/supabase/server";
import JobClient from "./job-client";
import styles from "./job-client.module.css";

export default async function JobPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");

  return (
    <main className={styles.page}>
      <div>
        <h1 className={styles.pageTitle}>職種登録</h1>
      </div>

      <div className={styles.topBorder} />

      <JobClient />
    </main>
  );
}
