"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/app/utils/supabase/client";
import styles from "./job-detail-client.module.css";

type JobRow = {
  id: string;
  name: string;
  monthly_unit_price: number;
  updated_by: string | null;
};

type ProfileRow = {
  id: string;
  email: string | null;
  last_name: string | null;
  first_name: string | null;
  status: number | null;
};

type ProfileJobRow = {
  profile_id: string;
  job_id: string;
};

type ManMonthRow = {
  profile_id: string;
  target_year_month: string;
  operating_person_months: number | string;
};

type MemberRow = {
  profile_id: string;
  email: string;
  last_name: string;
  first_name: string;
  status: number;
};

function getFiscalMonths(year: number) {
  const result: { key: string; label: string }[] = [];

  for (let month = 6; month <= 12; month += 1) {
    result.push({
      key: `${year}-${String(month).padStart(2, "0")}-01`,
      label: `${month}月`,
    });
  }

  for (let month = 1; month <= 5; month += 1) {
    result.push({
      key: `${year + 1}-${String(month).padStart(2, "0")}-01`,
      label: `${month}月`,
    });
  }

  return result;
}

function normalizeStatusValue(status: number | null | undefined) {
  return status === 1 || status === 2 ? status : 0;
}

function normalizeOperatingPersonMonths(value: string) {
  return value.trim();
}

function fullName(lastName?: string | null, firstName?: string | null) {
  return `${lastName ?? ""}${firstName ?? ""}`.trim();
}

export default function JobDetailClient({ jobId }: { jobId: string }) {
  const supabase = createClient();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [savingJob, setSavingJob] = useState(false);
  const [savingManMonths, setSavingManMonths] = useState(false);
  const [msg, setMsg] = useState("");
  const [displayYear, setDisplayYear] = useState(new Date().getFullYear());

  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [profileJobs, setProfileJobs] = useState<ProfileJobRow[]>([]);
  const [memberMonthInputs, setMemberMonthInputs] = useState<Record<string, Record<string, string>>>({});

  const [formName, setFormName] = useState("");
  const [formMonthlyUnitPrice, setFormMonthlyUnitPrice] = useState("");

  const fiscalMonths = useMemo(() => getFiscalMonths(displayYear), [displayYear]);

  const load = async () => {
    setLoading(true);
    setMsg("");

    try {
      const fromMonth = fiscalMonths[0]?.key;
      const toMonth = fiscalMonths[fiscalMonths.length - 1]?.key;

      const [
        { data: jobData, error: jobError },
        { data: profileJobData, error: profileJobError },
        { data: profileData, error: profileError },
        { data: manMonthData, error: manMonthError },
      ] = await Promise.all([
        supabase
          .from("job")
          .select("id,name,monthly_unit_price,updated_by")
          .eq("id", jobId)
          .single(),
        supabase.from("profile_job").select("profile_id,job_id").eq("job_id", jobId),
        supabase
          .from("profiles_2")
          .select("id,email,last_name,first_name,status")
          .order("created_at", { ascending: true }),
        supabase
          .from("man_month")
          .select("profile_id,target_year_month,operating_person_months")
          .gte("target_year_month", fromMonth)
          .lte("target_year_month", toMonth),
      ]);

      if (jobError) throw new Error(jobError.message);
      if (profileJobError) throw new Error(profileJobError.message);
      if (profileError) throw new Error(profileError.message);
      if (manMonthError) throw new Error(manMonthError.message);

      const nextJob = jobData as JobRow;
      const nextProfileJobs = (profileJobData ?? []) as ProfileJobRow[];
      const nextProfiles = (profileData ?? []) as ProfileRow[];
      const nextManMonths = (manMonthData ?? []) as ManMonthRow[];

      setProfiles(nextProfiles);
      setProfileJobs(nextProfileJobs);

      setFormName(nextJob.name ?? "");
      setFormMonthlyUnitPrice(String(nextJob.monthly_unit_price ?? ""));

      const nextInputs: Record<string, Record<string, string>> = {};

      for (const relation of nextProfileJobs) {
        const profileId = relation.profile_id;
        nextInputs[profileId] = {};

        for (const month of fiscalMonths) {
          const found = nextManMonths.find(
            (item) => item.profile_id === profileId && item.target_year_month === month.key
          );

          nextInputs[profileId][month.key] =
            found?.operating_person_months != null ? String(found.operating_person_months) : "1";
        }
      }

      setMemberMonthInputs(nextInputs);
    } catch (e: any) {
      setMsg(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId, displayYear]);

  const getCurrentProfileId = async () => {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError) throw new Error(userError.message);
    if (!user) throw new Error("ログインユーザーを取得できませんでした。");

    const { data: profile, error: profileError } = await supabase
      .from("profiles_2")
      .select("id")
      .eq("id", user.id)
      .single();

    if (profileError) {
      throw new Error("profiles_2 にログインユーザーのプロフィールが見つかりません。");
    }

    return (profile as { id: string }).id;
  };

  const members = useMemo<MemberRow[]>(() => {
    const targetProfileIds = new Set(profileJobs.map((item) => item.profile_id));

    return profiles
      .filter((profile) => targetProfileIds.has(profile.id))
      .map((profile) => ({
        profile_id: profile.id,
        email: (profile.email ?? "").trim(),
        last_name: profile.last_name ?? "",
        first_name: profile.first_name ?? "",
        status: normalizeStatusValue(profile.status),
      }))
      .sort((a, b) => {
        const aName = fullName(a.last_name, a.first_name) || a.email;
        const bName = fullName(b.last_name, b.first_name) || b.email;
        return aName.localeCompare(bName, "ja");
      });
  }, [profileJobs, profiles]);

  const update = async () => {
    setMsg("");

    const name = formName.trim();
    if (!name) {
      setMsg("職種名を入力してください。");
      return;
    }

    const parsed = Number(formMonthlyUnitPrice.replace(/,/g, "").trim());
    if (!Number.isInteger(parsed) || parsed < 0) {
      setMsg("人月単価は0以上の整数で入力してください。");
      return;
    }

    setSavingJob(true);
    try {
      const profileId = await getCurrentProfileId();

      const { error } = await supabase
        .from("job")
        .update({
          name,
          monthly_unit_price: parsed,
          updated_by: profileId,
        })
        .eq("id", jobId);

      if (error) throw new Error(error.message);

      await load();
      setMsg("更新しました。");
    } catch (e: any) {
      setMsg(e?.message ?? String(e));
    } finally {
      setSavingJob(false);
    }
  };

  const saveMemberManMonths = async () => {
    setMsg("");
    setSavingManMonths(true);

    try {
      const updaterId = await getCurrentProfileId();

      for (const member of members) {
        for (const month of fiscalMonths) {
          const rawValue = normalizeOperatingPersonMonths(
            memberMonthInputs[member.profile_id]?.[month.key] ?? "1"
          );
          const parsed = Number(rawValue);

          if (!Number.isFinite(parsed) || parsed < 0) {
            throw new Error(
              `稼働人月は0以上の数値で入力してください: ${
                fullName(member.last_name, member.first_name) || member.email
              } ${month.label}`
            );
          }

          if (parsed === 1) {
            const { error } = await supabase
              .from("man_month")
              .delete()
              .eq("profile_id", member.profile_id)
              .eq("target_year_month", month.key);

            if (error) throw new Error(error.message);
          } else {
            const { error } = await supabase.from("man_month").upsert(
              {
                profile_id: member.profile_id,
                target_year_month: month.key,
                operating_person_months: parsed,
                updated_by: updaterId,
              },
              { onConflict: "profile_id,target_year_month" }
            );

            if (error) throw new Error(error.message);
          }
        }
      }

      await load();
      setMsg("各人の稼働人月を更新しました。");
    } catch (e: any) {
      setMsg(e?.message ?? String(e));
    } finally {
      setSavingManMonths(false);
    }
  };

  const remove = async () => {
    const ok = window.confirm("この職種を削除しますか？");
    if (!ok) return;

    setMsg("");
    setSavingJob(true);

    try {
      const { error } = await supabase.from("job").delete().eq("id", jobId);

      if (error) throw new Error(error.message);

      router.replace("/job");
      router.refresh();
    } catch (e: any) {
      setMsg(e?.message ?? String(e));
      setSavingJob(false);
    }
  };

  if (loading) {
    return (
      <main className={styles.page}>
        <h1 className={styles.pageTitle}>職種詳細</h1>
        <div className={styles.loadingText}>読み込み中...</div>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <div>
        <h1 className={styles.pageTitle}>職種詳細</h1>
      </div>

      <div className={styles.topBorder} />

      <div className={styles.yearNav}>
        <button
          type="button"
          onClick={() => setDisplayYear((current) => current - 1)}
          className={styles.yearNavButton}
        >
          ‹
        </button>
        <div className={styles.yearLabel}>{displayYear}年</div>
        <button
          type="button"
          onClick={() => setDisplayYear((current) => current + 1)}
          className={styles.yearNavButton}
        >
          ›
        </button>
      </div>

      <div className={styles.topArea}>
        <div className={styles.formArea}>
          <div className={styles.formRow}>
            <div className={styles.label}>職種名</div>
            <input
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              className={styles.input}
            />
          </div>

          <div className={styles.formRow}>
            <div className={styles.label}>人月単価</div>
            <div className={styles.priceInputRow}>
              <span className={styles.yenMark}>¥</span>
              <input
                value={formMonthlyUnitPrice}
                onChange={(e) => setFormMonthlyUnitPrice(e.target.value)}
                className={styles.priceInput}
                placeholder="400000"
                inputMode="numeric"
              />
            </div>
          </div>
        </div>

        <div className={styles.buttonArea}>
          <button
            type="button"
            onClick={remove}
            disabled={savingJob || savingManMonths}
            className={styles.btnDelete}
          >
            削除する
          </button>
          <button
            type="button"
            onClick={update}
            disabled={savingJob || savingManMonths}
            className={styles.btnUpdate}
          >
            {savingJob ? "保存中..." : "更新する"}
          </button>
        </div>
      </div>

      <div className={styles.memberSection}>
        <div className={styles.memberSectionHeader}>
          <h2 className={styles.memberSectionTitle}>各人の稼働人月</h2>
          <button
            type="button"
            onClick={saveMemberManMonths}
            disabled={savingJob || savingManMonths}
            className={styles.btnUpdate}
          >
            {savingManMonths ? "保存中..." : "稼働人月を保存する"}
          </button>
        </div>

        <div className={styles.memberTableFrame}>
          <div className={styles.memberTableScroll}>
            <table className={styles.memberTable}>
              <thead>
                <tr>
                  <th className={styles.thName}>氏名</th>
                  {fiscalMonths.map((month) => (
                    <th key={month.key} className={styles.thMonth}>
                      {month.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {members.length === 0 ? (
                  <tr>
                    <td className={styles.emptyCell} colSpan={13}>
                      この職種に紐づくユーザーはいません。
                    </td>
                  </tr>
                ) : (
                  members.map((member) => (
                    <tr key={member.profile_id}>
                      <td className={styles.nameCell}>
                        {fullName(member.last_name, member.first_name) || member.email}
                      </td>

                      {fiscalMonths.map((month) => (
                        <td key={month.key} className={styles.monthCell}>
                          <input
                            value={memberMonthInputs[member.profile_id]?.[month.key] ?? "1"}
                            onChange={(e) =>
                              setMemberMonthInputs((current) => ({
                                ...current,
                                [member.profile_id]: {
                                  ...(current[member.profile_id] ?? {}),
                                  [month.key]: e.target.value,
                                },
                              }))
                            }
                            className={styles.memberInput}
                            inputMode="decimal"
                            placeholder="1"
                          />
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <p className={styles.memberNote}>※稼働目標＝人月単価×稼働人月</p>
      </div>

      {msg && <p className={styles.message}>{msg}</p>}
    </main>
  );
}
