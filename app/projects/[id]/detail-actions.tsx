"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/app/utils/supabase/client";
import styles from "./detail-actions.module.css";

export default function DetailActions({ projectId }: { projectId: string }) {
  const supabase = createClient();
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [msg, setMsg] = useState("");

  const deleteProject = async () => {
    const ok = window.confirm(
      "この案件を削除しますか？\n\n関連する予定コスト・実コスト・案件メンバー・業務報告も削除されます。"
    );
    if (!ok) return;

    setDeleting(true);
    setMsg("");

    try {
      const { error: e1 } = await supabase.from("work_entries").delete().eq("project_id", projectId);
      if (e1) throw new Error(e1.message);

      const { error: e2 } = await supabase.from("project_members").delete().eq("project_id", projectId);
      if (e2) throw new Error(e2.message);

      const { error: e3 } = await supabase.from("project_actual_costs").delete().eq("project_id", projectId);
      if (e3) throw new Error(e3.message);

      const { error: e4 } = await supabase.from("project_costs").delete().eq("project_id", projectId);
      if (e4) throw new Error(e4.message);

      const { error: e5 } = await supabase.from("projects").delete().eq("id", projectId);
      if (e5) throw new Error(e5.message);

      router.replace("/projects");
      router.refresh();
    } catch (e: any) {
      setMsg(e?.message ?? String(e));
      setDeleting(false);
    }
  };

  return (
    <div className={styles.wrap}>
      <Link href={`/projects/${projectId}/edit`} className={styles.btnEdit}>
        編集
      </Link>

      <button type="button" onClick={deleteProject} disabled={deleting} className={styles.btnDelete}>
        {deleting ? "削除中..." : "削除"}
      </button>

      {msg ? <span className={styles.errorText}>{msg}</span> : null}
    </div>
  );
}