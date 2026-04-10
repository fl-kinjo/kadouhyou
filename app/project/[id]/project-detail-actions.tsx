"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/app/utils/supabase/client";
import styles from "./project-detail-actions.module.css";

export default function ProjectDetailActions({ projectId }: { projectId: string }) {
  const supabase = createClient();
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const deleteProject = async () => {
    const ok = window.confirm("この案件を削除しますか？\n\n案件メンバーもあわせて削除されます。");
    if (!ok) return;

    setDeleting(true);
    setErrorMsg("");

    const { error } = await supabase.from("project").delete().eq("id", projectId);

    if (error) {
      setErrorMsg(error.message);
      setDeleting(false);
      return;
    }

    router.replace("/project");
    router.refresh();
  };

  return (
    <div className={styles.wrap}>
      <button type="button" onClick={deleteProject} className={styles.deleteButton} disabled={deleting}>
        {deleting ? "案件を削除中" : "案件を削除する"}
      </button>
      <Link href={`/project/${projectId}/edit`} className={styles.editButton}>
        基本情報を編集する
      </Link>
      {errorMsg && <p className={styles.errorText}>{errorMsg}</p>}
    </div>
  );
}
