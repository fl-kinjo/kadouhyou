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
  updated_at: string | null;
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

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "-";
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

function isEdited(row: CommentRow): boolean {
  if (!row.updated_at) return false;
  return new Date(row.updated_at).getTime() > new Date(row.created_at).getTime() + 1000;
}

export default function CommentSection({ projectId }: { projectId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [comment, setComment] = useState("");
  const [currentProfileId, setCurrentProfileId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingComment, setEditingComment] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const loadCurrentProfile = useCallback(async () => {
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError) throw new Error(authError.message);

    const userId = authData.user?.id;
    if (!userId) throw new Error("ログインユーザーを取得できません。");

    const { data: profileData, error: profileError } = await supabase
      .from("profiles_2")
      .select("id,is_admin")
      .eq("id", userId)
      .maybeSingle();

    if (profileError) throw new Error(profileError.message);

    setCurrentProfileId(userId);
    setIsAdmin(profileData?.is_admin === 1);
    return userId;
  }, [supabase]);

  const loadComments = useCallback(async () => {
    setLoading(true);
    setMessage("");

    const { data, error } = await supabase
      .from("project_comment")
      .select(
        "id,project_id,profile_id,comment,created_at,updated_at,profile:profiles_2!project_comment_profile_id_fkey(last_name,first_name,email)"
      )
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
    const load = async () => {
      try {
        await loadCurrentProfile();
        await loadComments();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : String(error));
        setLoading(false);
      }
    };

    load();
  }, [loadComments, loadCurrentProfile]);

  const submitComment = async () => {
    const trimmedComment = comment.trim();
    if (!trimmedComment || saving) return;

    setSaving(true);
    setMessage("");

    try {
      const userId = currentProfileId ?? (await loadCurrentProfile());

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

  const startEdit = (row: CommentRow) => {
    setMessage("");
    setEditingCommentId(row.id);
    setEditingComment(row.comment);
  };

  const cancelEdit = () => {
    if (updating) return;
    setEditingCommentId(null);
    setEditingComment("");
  };

  const updateComment = async (commentId: string) => {
    const trimmedComment = editingComment.trim();
    if (!trimmedComment || updating) return;

    setUpdating(true);
    setMessage("");

    try {
      const userId = currentProfileId ?? (await loadCurrentProfile());

      const { error } = await supabase
        .from("project_comment")
        .update({
          comment: trimmedComment,
          updated_by: userId,
        })
        .eq("id", commentId);

      if (error) throw new Error(error.message);

      setEditingCommentId(null);
      setEditingComment("");
      await loadComments();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setUpdating(false);
    }
  };

  const deleteComment = async (commentId: string) => {
    if (deletingId) return;
    if (!window.confirm("コメントを削除します。よろしいですか？")) return;

    setDeletingId(commentId);
    setMessage("");

    try {
      const { error } = await supabase.from("project_comment").delete().eq("id", commentId);
      if (error) throw new Error(error.message);

      if (editingCommentId === commentId) {
        setEditingCommentId(null);
        setEditingComment("");
      }
      await loadComments();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setDeletingId(null);
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
            const canManageComment = isAdmin || (!!currentProfileId && row.profile_id === currentProfileId);
            const editing = editingCommentId === row.id;

            return (
              <article key={row.id} className={styles.commentItem}>
                <div className={styles.commentMeta}>
                  <span className={styles.commentAuthor}>{formatProfileName(profile)}</span>
                  <span className={styles.commentDate}>{formatDateTime(row.created_at)}</span>
                  {isEdited(row) && <span className={styles.commentDate}>編集済み</span>}
                </div>

                {editing ? (
                  <div className={styles.commentEditWrap}>
                    <textarea
                      value={editingComment}
                      onChange={(event) => setEditingComment(event.target.value)}
                      className={styles.commentTextarea}
                      rows={4}
                      disabled={updating}
                    />
                    <div className={styles.commentActionRow}>
                      <button type="button" className={styles.commentCancelButton} onClick={cancelEdit} disabled={updating}>
                        キャンセル
                      </button>
                      <button
                        type="button"
                        className={styles.commentSaveButton}
                        onClick={() => updateComment(row.id)}
                        disabled={updating || editingComment.trim().length === 0}
                      >
                        {updating ? "保存中..." : "保存"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className={styles.commentBody}>{row.comment}</p>
                    {canManageComment && (
                      <div className={styles.commentActionRow}>
                        <button type="button" className={styles.commentTextButton} onClick={() => startEdit(row)}>
                          編集
                        </button>
                        <button
                          type="button"
                          className={styles.commentDeleteButton}
                          onClick={() => deleteComment(row.id)}
                          disabled={deletingId === row.id}
                        >
                          {deletingId === row.id ? "削除中..." : "削除"}
                        </button>
                      </div>
                    )}
                  </>
                )}
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}
