"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, Link as LinkType, Category } from "@/lib/api";
import type { InsightData } from "@/types/insights";

function BarChart({ links, categories, tab }: {
  links: LinkType[];
  categories: Category[];
  tab: "all" | "recent";
}) {
  const now = new Date();
  const cutoff30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const filtered = tab === "recent"
    ? links.filter((l) => new Date(l.created_at) >= cutoff30d)
    : links;

  const catMap = Object.fromEntries(categories.map((c) => [c.id, c.name]));

  const stats: Record<string, { count: number; done: number }> = {};
  for (const l of filtered) {
    const name = catMap[l.category_id ?? ""] ?? "Uncategorized";
    if (!stats[name]) stats[name] = { count: 0, done: 0 };
    stats[name].count++;
    if (l.status === "done") stats[name].done++;
  }

  const allLinks30d: Record<string, number> = {};
  const allLinksPrior: Record<string, number> = {};
  for (const l of links) {
    const name = catMap[l.category_id ?? ""] ?? "Uncategorized";
    if (new Date(l.created_at) >= cutoff30d) {
      allLinks30d[name] = (allLinks30d[name] ?? 0) + 1;
    } else {
      allLinksPrior[name] = (allLinksPrior[name] ?? 0) + 1;
    }
  }

  const total30d = Object.values(allLinks30d).reduce((a, b) => a + b, 0);
  const totalPrior = Object.values(allLinksPrior).reduce((a, b) => a + b, 0);

  const entries = Object.entries(stats).sort((a, b) => b[1].count - a[1].count);
  const maxCount = Math.max(...entries.map(([, s]) => s.count), 1);

  if (entries.length === 0) {
    return <p style={{ color: "var(--text-dim)", fontSize: 13 }}>이 기간에 저장된 링크가 없습니다.</p>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      {entries.map(([name, s]) => {
        const pct = s.count / maxCount;
        const donePct = s.done / s.count;
        const share30d = total30d ? (allLinks30d[name] ?? 0) / total30d : 0;
        const sharePrior = totalPrior ? (allLinksPrior[name] ?? 0) / totalPrior : 0;
        const surging = share30d - sharePrior >= 0.1;

        return (
          <div key={name}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
              <span style={{ fontSize: 12, fontWeight: 500, minWidth: 100 }}>{name}</span>
              {surging && (
                <span style={{
                  fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 10,
                  background: "rgba(16,185,129,0.12)", color: "#10b981",
                  border: "1px solid rgba(16,185,129,0.2)",
                }}>↑ 급증</span>
              )}
              <span style={{ fontSize: 11, color: "var(--text-dim)", marginLeft: "auto" }}>
                {s.count}개 · {Math.round(donePct * 100)}% 완료
              </span>
            </div>
            <div style={{ position: "relative", height: 8, background: "var(--surface-2)", borderRadius: 4, overflow: "hidden" }}>
              <div style={{
                position: "absolute", left: 0, top: 0, height: "100%",
                width: `${pct * 100}%`, background: "rgba(99,102,241,0.25)", borderRadius: 4,
              }} />
              <div style={{
                position: "absolute", left: 0, top: 0, height: "100%",
                width: `${pct * donePct * 100}%`, background: "#10b981", borderRadius: 4,
              }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function InsightsPage() {
  const router = useRouter();
  const [insight, setInsight] = useState<InsightData | null>(null);
  const [links, setLinks] = useState<LinkType[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<"all" | "recent">("all");

  useEffect(() => {
    Promise.all([
      api.getInsights(),
      api.getLinks(),
      api.getCategories(),
    ]).then(([ins, ls, cs]) => {
      setInsight(ins);
      setLinks(ls);
      setCategories(cs);
      setLoading(false);
    });
  }, []);

  async function handleRefresh() {
    setRefreshing(true);
    const ins = await api.getInsights(true);
    setInsight(ins);
    setRefreshing(false);
  }

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100dvh", color: "var(--text-muted)" }}>
        분석 중…
      </div>
    );
  }

  if (!insight) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100dvh", gap: "1rem", color: "var(--text-muted)" }}>
        <p>아직 인사이트를 생성하기에 충분한 링크가 없습니다.</p>
        <button onClick={() => router.push("/dashboard")} style={{ padding: "0.5rem 1rem", background: "var(--primary)", color: "white", fontWeight: 500 }}>
          대시보드로 돌아가기
        </button>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "1.5rem 1rem 3rem" }}>

      {/* Back */}
      <button
        onClick={() => router.push("/dashboard")}
        style={{ fontSize: 12, color: "var(--text-dim)", background: "transparent", padding: 0, marginBottom: "1.5rem" }}
      >
        ← 대시보드
      </button>

      {/* Block 1: Portrait */}
      <section style={{ marginBottom: "2rem" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "1rem", marginBottom: "0.75rem" }}>
          <h2 style={{ fontSize: 16, fontWeight: 700 }}>나의 포트레이트</h2>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            style={{
              fontSize: 11, padding: "0.25rem 0.75rem", borderRadius: 12,
              border: "1px solid var(--border)", background: "transparent",
              color: "var(--text-muted)", cursor: refreshing ? "not-allowed" : "pointer",
              opacity: refreshing ? 0.5 : 1, whiteSpace: "nowrap",
            }}
          >
            {refreshing ? "분석 중…" : "다시 분석"}
          </button>
        </div>
        <p style={{ fontSize: 14, lineHeight: 1.75, color: "var(--text-muted)" }}>
          {insight.portrait}
        </p>
      </section>

      {/* Block 2: Interest map */}
      <section style={{ marginBottom: "2rem" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
          <h2 style={{ fontSize: 16, fontWeight: 700 }}>관심사 지형도</h2>
          <div style={{ display: "flex", gap: "0.25rem" }}>
            {(["all", "recent"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  fontSize: 11, padding: "0.2rem 0.75rem", borderRadius: 12,
                  border: `1px solid ${tab === t ? "var(--primary)" : "var(--border)"}`,
                  background: tab === t ? "rgba(99,102,241,0.1)" : "transparent",
                  color: tab === t ? "var(--primary)" : "var(--text-dim)",
                }}
              >
                {t === "all" ? "전체 기간" : "최근 30일"}
              </button>
            ))}
          </div>
        </div>
        <BarChart links={links} categories={categories} tab={tab} />
      </section>

      {/* Block 3: Discovered patterns */}
      <section>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: "1rem" }}>발견된 패턴</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {[
            { label: "요즘 관심사", text: insight.emerging, color: "#10b981", bg: "rgba(16,185,129,0.06)" },
            { label: "의외의 연결", text: insight.connection, color: "var(--primary)", bg: "rgba(99,102,241,0.06)" },
            { label: "아직 못 읽은 것들", text: insight.blind_spots, color: "#f59e0b", bg: "rgba(245,158,11,0.06)" },
          ].map(({ label, text, color, bg }) => (
            <div key={label} style={{
              padding: "0.875rem 1rem",
              borderRadius: "var(--radius-lg)",
              background: bg,
              border: `1px solid ${color}22`,
            }}>
              <p style={{ fontSize: 10, fontWeight: 700, color, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.375rem" }}>
                {label}
              </p>
              <p style={{ fontSize: 13, lineHeight: 1.65, color: "var(--text-muted)" }}>
                {text}
              </p>
            </div>
          ))}
        </div>
      </section>

    </div>
  );
}
