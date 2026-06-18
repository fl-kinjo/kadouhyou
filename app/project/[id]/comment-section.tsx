"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/app/utils/supabase/client";
import styles from "./comment-section.module.css";

type Profile = {
  last_name: string | null;
  first_name: string | null;
  email: string | null;
};

type CommentRow = {
  id: string;
  project_id: string;
  profile_id: string | null;
  comment: string;
  created_at: string;
  profile?: Profile | Profile[] | null;
};

function getProfile(row: CommentRow): Profile | null {
  if (!row.profile) return null;
  if (Array.isArray(row.profile)) return row.profile[0] ?? null;
  return row.profile;
}

function formatProfileName(profile: Profile | null): string {
  if (!profile) return "-";
  const name = `${profile.last_name ?? ""}${profile.first_name ?? ""}`.trim();
  return name || profile.email || "-";
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function CommentSection({ projectId }: { projectId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const loadComments = useCallback(async () => {
    setLoading(true);
    setMessage("");

    const { data, error } = await supabase
      .from("project_comment")
      .select("id,project_id,profile_id,comment,created_at,profile:profiles_2!project_comment_profile_id_fkey(last_name,first_name,email)")
      .eq("project_id", projectId)
      .order("created_at", { ascending: true });

    if (error) {
      setMessage(error.message);
      setComments([]);
      setLoading(false);
      return;
    }

    setComments((data ?? []) as CommentRow[]);
    setLoading(false);
  }, [projectId, supabase]);

  useEffect(() => {
    loadComments();
  }, [loadComments]);

  const submitComment = async () => {
    const trimmedComment = comment.trim();
    if (!trimmedComment || saving) return;

    setSaving(true);
    setMessage("");

    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw new Error(authError.message);

      const userId = authData.user?.id;
      if (!userId) throw new Error("ログインユーザーを取得できません。");

      const { error } = await supabase.from("project_comment").insert({
        project_id: projectId,
        profile_id: userId,
        comment: trimmedComment,
        updated_by: userId,
      });

      if (error) throw new Error(error.message);

      setComment("");
      await loadComments();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className={styles.commentSection}>
      <div className={styles.commentHeader}>
        <h2 className={styles.commentTitle}>コメント</h2>
        <p className={styles.commentLead}>案件に関するメモや共有事項を追加できます。</p>
      </div>

      {message && <p className={styles.message}>{message}</p>}

      <div className={styles.commentInputCard}>
        <textarea
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          className={styles.commentTextarea}
          placeholder="コメントを入力してください"
          rows={4}
          disabled={saving}
        />
        <div className={styles.commentButtonRow}>
          <button
            type="button"
            className={styles.commentSubmitButton}
            onClick={submitComment}
            disabled={saving || comment.trim().length === 0}
          >
            {saving ? "追加中..." : "コメントを追加する"}
          </button>
        </div>
      </div>

      <div className={styles.commentList}>
        {loading ? (
          <div className={styles.emptyComment}>コメントを読み込み中です。</div>
        ) : comments.length === 0 ? (
          <div className={styles.emptyComment}>コメントはまだありません。</div>
        ) : (
          comments.map((row) => {
            const profile = getProfile(row);
            return (
              <article key={row.id} className={styles.commentItem}>
                <div className={styles.commentMeta}>
                  <span className={styles.commentAuthor}>{formatProfileName(profile)}</span>
                  <span className={styles.commentDate}>{formatDateTime(row.created_at)}</span>
                </div>
                <p className={styles.commentBody}>{row.comment}</p>
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}
