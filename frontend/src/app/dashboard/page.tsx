"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { api, Link as LinkType, Category } from "@/lib/api";
import type { InsightData } from "@/types/insights";

const SOURCE_TYPES = [
  { value: "", label: "All Sources" },
  { value: "ecommerce", label: "E-Commerce" },
  { value: "social", label: "Social" },
  { value: "news", label: "News" },
  { value: "other", label: "Other" },
];

function sourceTypeLabel(type: string): string {
  return SOURCE_TYPES.find((s) => s.value === type)?.label ?? type;
}

function sourceTypeColor(type: string): string {
  const map: Record<string, string> = {
    ecommerce: "#f59e0b",
    social: "#06b6d4",
    news: "#10b981",
    other: "#94a3b8",
  };
  return map[type] ?? "#94a3b8";
}

function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace("www.", "");
  } catch {
    return url;
  }
}

function getStatusLabels(sourceType: string): { pending: string; in_progress: string; done: string } {
  switch (sourceType) {
    case "ecommerce": return { pending: "To Buy",      in_progress: "Considering", done: "Purchased" };
    case "news":      return { pending: "Unread",      in_progress: "Reading",     done: "Read" };
    case "social":    return { pending: "To Watch",    in_progress: "Watching",    done: "Watched" };
    default:          return { pending: "To Do",       in_progress: "In Progress", done: "Done" };
  }
}

const SWIPE_THRESHOLD = 72; // px

// ─── Add Link Modal ───────────────────────────────────────────────────────────

function AddLinkModal({
  onClose,
  onAdded,
}: {
  onClose: () => void;
  onAdded: () => void;
}) {
  const [url, setUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setLoading(true);
    setError("");
    try {
      await api.createLink(url.trim(), notes.trim() || undefined);
      onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add link");
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.65)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: "1rem",
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{
          background: "var(--surface)",
          borderRadius: "var(--radius-lg)",
          border: "1px solid var(--border)",
          padding: "1.5rem",
          width: "100%",
          maxWidth: 480,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "1.25rem",
          }}
        >
          <h2 style={{ fontSize: 17, fontWeight: 600 }}>Add New Link</h2>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              color: "var(--text-muted)",
              fontSize: 22,
              lineHeight: 1,
              padding: "0 4px",
            }}
          >
            ×
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
        >
          <div>
            <label
              style={{
                display: "block",
                marginBottom: 5,
                color: "var(--text-muted)",
                fontSize: 12,
                fontWeight: 500,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}
            >
              URL *
            </label>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com"
              required
              autoFocus
              style={{ width: "100%", padding: "0.6rem 0.75rem" }}
            />
          </div>

          <div>
            <label
              style={{
                display: "block",
                marginBottom: 5,
                color: "var(--text-muted)",
                fontSize: 12,
                fontWeight: 500,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}
            >
              Notes{" "}
              <span style={{ color: "var(--text-dim)", textTransform: "none" }}>
                (optional)
              </span>
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Why are you saving this?"
              rows={3}
              style={{ width: "100%", padding: "0.6rem 0.75rem" }}
            />
          </div>

          {error && (
            <p style={{ color: "var(--danger)", fontSize: 13 }}>{error}</p>
          )}

          <div
            style={{
              display: "flex",
              gap: "0.75rem",
              justifyContent: "flex-end",
            }}
          >
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: "0.5rem 1.125rem",
                background: "var(--surface-2)",
                color: "var(--text-muted)",
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              style={{
                padding: "0.5rem 1.125rem",
                background: "var(--primary)",
                color: "white",
                fontWeight: 500,
              }}
            >
              {loading ? "Saving…" : "Save Link"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Delete Button ────────────────────────────────────────────────────────────

function DeleteButton({ deleting, onDelete }: { deleting: boolean; onDelete: (e: React.MouseEvent) => void }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onDelete}
      disabled={deleting}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        margin: "0 0.75rem 0.75rem",
        padding: "0.375rem 0",
        background: hovered ? "rgba(248, 113, 113, 0.08)" : "transparent",
        color: hovered ? "var(--danger)" : "var(--text-dim)",
        fontSize: 11,
        border: `1px solid ${hovered ? "rgba(248, 113, 113, 0.25)" : "var(--border)"}`,
        borderRadius: "var(--radius)",
        minHeight: 32,
      }}
    >
      {deleting ? "Deleting…" : "Delete"}
    </button>
  );
}

// ─── Insight Panel ────────────────────────────────────────────────────────────

function InsightPanel({ insight, onViewAll }: {
  insight: InsightData;
  onViewAll: () => void;
}) {
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem("mya_insight_panel") === "collapsed"
  );

  function toggleCollapse() {
    const next = !collapsed;
    setCollapsed(next);
    if (next) {
      localStorage.setItem("mya_insight_panel", "collapsed");
    } else {
      localStorage.removeItem("mya_insight_panel");
    }
  }

  return (
    <div style={{
      borderBottom: "1px solid var(--border)",
      background: "var(--surface-2)",
      padding: "0.625rem 1.5rem",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem" }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          나의 관심사
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          {collapsed && (
            <div style={{ display: "flex", gap: "0.375rem", flexWrap: "wrap" }}>
              {insight.themes.slice(0, 2).map((t) => (
                <span key={t.name} style={{
                  padding: "2px 8px", borderRadius: 12, fontSize: 10, fontWeight: 600,
                  background: "rgba(99,102,241,0.12)", color: "var(--primary)",
                  border: "1px solid rgba(99,102,241,0.2)",
                }}>
                  {t.name}
                </span>
              ))}
            </div>
          )}
          <button
            onClick={onViewAll}
            style={{ fontSize: 11, color: "var(--primary)", background: "transparent", padding: 0 }}
          >
            전체 보기 →
          </button>
          <button
            onClick={toggleCollapse}
            style={{ fontSize: 11, color: "var(--text-dim)", background: "transparent", padding: 0 }}
          >
            {collapsed ? "∨" : "∧"}
          </button>
        </div>
      </div>

      {!collapsed && (
        <div style={{ marginTop: "0.5rem" }}>
          <p style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.6, marginBottom: "0.5rem" }}>
            {insight.portrait.split(". ").slice(0, 2).join(". ") + "."}
          </p>
          <div style={{ display: "flex", gap: "0.375rem", flexWrap: "wrap" }}>
            {insight.themes.map((t) => (
              <span key={t.name} style={{
                padding: "2px 8px", borderRadius: 12, fontSize: 10, fontWeight: 600,
                background: "rgba(99,102,241,0.12)", color: "var(--primary)",
                border: "1px solid rgba(99,102,241,0.2)",
              }}>
                {t.name}
              </span>
            ))}
            {insight.emerging && (
              <span style={{
                padding: "2px 8px", borderRadius: 12, fontSize: 10, fontWeight: 600,
                background: "rgba(16,185,129,0.1)", color: "#10b981",
                border: "1px solid rgba(16,185,129,0.2)",
              }}>
                ↑ 부상중
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Link Card ────────────────────────────────────────────────────────────────

const LONG_PRESS_DURATION = 600; // ms
const LONG_PRESS_MOVE_THRESHOLD = 6; // px

function LinkCard({
  link,
  categoryName,
  onDelete,
  onStatusChange,
  isFirstCard,
  showSwipeHint,
}: {
  link: LinkType;
  categoryName?: string;
  onDelete: (id: string) => void;
  onStatusChange: (id: string, status: "pending" | "in_progress" | "done") => void;
  isFirstCard?: boolean;
  showSwipeHint?: boolean;
}) {
  const router = useRouter();
  const [imgError, setImgError] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [dragX, setDragX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [isLongPressing, setIsLongPressing] = useState(false);
  const startXRef = useRef<number | null>(null);
  const hasDraggedRef = useRef(false);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);

  const statusLabels = getStatusLabels(link.source_type);
  const isDone = link.status === "done";
  const isInProgress = link.status === "in_progress";

  function cancelLongPress() {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    setIsLongPressing(false);
  }

  function onPointerDown(e: React.PointerEvent) {
    // Only primary button (left click / touch)
    if (e.pointerType === "mouse" && e.button !== 0) return;
    startXRef.current = e.clientX;
    hasDraggedRef.current = false;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

    // Start long-press timer
    longPressTimerRef.current = setTimeout(async () => {
      longPressTimerRef.current = null;
      if (hasDraggedRef.current) return; // swipe in progress, ignore
      setIsLongPressing(false);
      if (link.status === "in_progress") return; // already in_progress
      setUpdatingStatus(true);
      try {
        await api.updateLinkStatus(link.id, "in_progress");
        onStatusChange(link.id, "in_progress");
      } finally {
        setUpdatingStatus(false);
      }
    }, LONG_PRESS_DURATION);

    setIsLongPressing(true);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (startXRef.current === null) return;
    const delta = e.clientX - startXRef.current;
    if (Math.abs(delta) > LONG_PRESS_MOVE_THRESHOLD) {
      hasDraggedRef.current = true;
      cancelLongPress();
      setIsDragging(true);
      setDragX(delta);
    }
  }

  async function onPointerUp(e: React.PointerEvent) {
    cancelLongPress();
    const delta = dragX;
    setDragX(0);
    setIsDragging(false);
    startXRef.current = null;

    if (!hasDraggedRef.current) {
      // Pure click — navigate
      router.push(`/links/${link.id}`);
      return;
    }
    hasDraggedRef.current = false;

    if (Math.abs(delta) < SWIPE_THRESHOLD) return; // snap back, no action

    const newStatus: "pending" | "done" = delta > 0 ? "done" : "pending";
    if (newStatus === link.status) return;

    setUpdatingStatus(true);
    try {
      await api.updateLinkStatus(link.id, newStatus);
      onStatusChange(link.id, newStatus);
    } finally {
      setUpdatingStatus(false);
    }
  }

  async function handleDelete(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm("Delete this link?")) return;
    setDeleting(true);
    try {
      await api.deleteLink(link.id);
      onDelete(link.id);
    } catch {
      setDeleting(false);
    }
  }

  const accentColor = sourceTypeColor(link.source_type);

  // Swipe overlay config
  const swipeProgress = Math.min(Math.abs(dragX) / SWIPE_THRESHOLD, 1);
  const swipingRight = dragX > 0;
  const overlayColor = swipingRight ? "#10b981" : "#f59e0b";
  const overlayLabel = swipingRight
    ? `✓ ${statusLabels.done}`
    : `↩ ${statusLabels.pending}`;

  return (
    <div
      style={{ position: "relative", height: "100%", touchAction: "pan-y" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); }}
    >
      {/* Swipe background hint */}
      {isDragging && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "var(--radius-lg)",
            background: overlayColor,
            opacity: swipeProgress * 0.25,
            pointerEvents: "none",
            zIndex: 1,
          }}
        />
      )}

      {/* Swipe action label */}
      {isDragging && swipeProgress > 0.3 && (
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: swipingRight ? "1rem" : undefined,
            right: swipingRight ? undefined : "1rem",
            transform: "translateY(-50%)",
            zIndex: 2,
            pointerEvents: "none",
            background: overlayColor,
            color: "white",
            padding: "0.4rem 0.75rem",
            borderRadius: 20,
            fontSize: 12,
            fontWeight: 700,
            opacity: swipeProgress,
            whiteSpace: "nowrap",
          }}
        >
          {overlayLabel}
        </div>
      )}

      {/* Card */}
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => { cancelLongPress(); setDragX(0); setIsDragging(false); startXRef.current = null; }}
        style={{
          background: "var(--surface)",
          border: `1px solid ${isDone ? "#10b98133" : isInProgress ? "#f59e0b33" : isLongPressing ? "#f59e0b55" : "var(--border)"}`,
          outline: isLongPressing ? "2px solid #f59e0b88" : "none",
          borderRadius: "var(--radius-lg)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          transform: isDragging
            ? `translateX(${Math.sign(dragX) * Math.min(Math.abs(dragX), 120)}px)`
            : isLongPressing ? "scale(0.97)" : hovered ? "translateY(-3px)" : "none",
          boxShadow: hovered && !isDragging ? "var(--shadow-card-hover)" : "var(--shadow-card)",
          transition: isDragging ? "none" : "transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease",
          cursor: isDragging ? "grabbing" : "pointer",
          height: "100%",
          userSelect: "none",
          opacity: isDone && !hovered && !isDragging ? 0.55 : (updatingStatus ? 0.6 : 1),
          filter: isDone && !hovered ? "grayscale(20%)" : "none",
          animation: isFirstCard && showSwipeHint ? "swipeHint 0.7s ease" : "none",
          position: "relative",
          zIndex: 3,
        }}
      >
        {/* Thumbnail */}
        <div
          style={{
            position: "relative",
            width: "100%",
            paddingTop: "56.25%",
            background: "var(--surface-2)",
            overflow: "hidden",
          }}
        >
          {link.thumbnail_url && !imgError ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={link.thumbnail_url}
              alt={link.title ?? "thumbnail"}
              onError={() => setImgError(true)}
              draggable={false}
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                objectFit: "cover",
              }}
            />
          ) : (
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 36,
                color: "var(--text-dim)",
              }}
            >
              🔗
            </div>
          )}

          {/* Status badge overlay on thumbnail */}
          {isDone && (
            <div
              style={{
                position: "absolute",
                top: 8,
                right: 8,
                background: "#10b981",
                color: "white",
                borderRadius: 12,
                padding: "2px 8px",
                fontSize: 10,
                fontWeight: 700,
                lineHeight: 1.6,
                letterSpacing: "0.03em",
              }}
            >
              ✓ {statusLabels.done}
            </div>
          )}
          {isInProgress && (
            <div
              style={{
                position: "absolute",
                top: 8,
                right: 8,
                background: "#f59e0b",
                color: "white",
                borderRadius: 12,
                padding: "2px 8px",
                fontSize: 10,
                fontWeight: 700,
                lineHeight: 1.6,
                letterSpacing: "0.03em",
              }}
            >
              ● {statusLabels.in_progress}
            </div>
          )}
        </div>

        {/* Body */}
        <div
          style={{
            padding: "0.75rem",
            flex: 1,
            display: "flex",
            flexDirection: "column",
            gap: "0.375rem",
          }}
        >
          <p
            style={{
              fontWeight: 500,
              fontSize: 13,
              lineHeight: 1.45,
              overflow: "hidden",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
            }}
          >
            {link.title ?? getDomain(link.url)}
          </p>
          <p
            style={{
              color: "var(--text-dim)",
              fontSize: 11,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {getDomain(link.url)}
          </p>

          <div
            style={{
              display: "flex",
              gap: "0.3rem",
              flexWrap: "wrap",
              marginTop: "auto",
              paddingTop: "0.375rem",
            }}
          >
            <span
              style={{
                padding: "2px 7px",
                borderRadius: 4,
                fontSize: 10,
                fontWeight: 600,
                background: `${accentColor}1a`,
                color: accentColor,
                border: `1px solid ${accentColor}33`,
                textTransform: "uppercase",
                letterSpacing: "0.04em",
              }}
            >
              {sourceTypeLabel(link.source_type)}
            </span>
            {categoryName && (
              <span
                style={{
                  padding: "2px 7px",
                  borderRadius: 4,
                  fontSize: 10,
                  fontWeight: 600,
                  background: "#6366f11a",
                  color: "var(--primary)",
                  border: "1px solid #6366f133",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                }}
              >
                {categoryName}
              </span>
            )}
          </div>
        </div>

        {/* Delete */}
        <DeleteButton deleting={deleting} onDelete={handleDelete} />
      </div>
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const router = useRouter();
  const [links, setLinks] = useState<LinkType[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedSource, setSelectedSource] = useState("");
  const [selectedStatus, setSelectedStatus] = useState<"" | "pending" | "in_progress" | "done">("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [filterLoading, setFilterLoading] = useState(false);
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");
  const [showSwipeHint, setShowSwipeHint] = useState(false);
  const [insight, setInsight] = useState<InsightData | null>(null);
  const [insightLoading, setInsightLoading] = useState(false);

  useEffect(() => {
    (async () => {
      const profile = await api.getProfile();
      if (!profile) {
        router.push("/onboarding");
        return;
      }
      const [linksData, catsData] = await Promise.all([
        api.getLinks(),
        api.getCategories(),
      ]);
      setLinks(linksData);
      setCategories(catsData);
      setLoading(false);
      if (linksData.length >= 5) {
        setInsightLoading(true);
        api.getInsights().then((data) => { setInsight(data); setInsightLoading(false); });
      }
      if (!localStorage.getItem("mya_swipe_hint") && linksData.length > 0) {
        setTimeout(() => {
          setShowSwipeHint(true);
          localStorage.setItem("mya_swipe_hint", "1");
          setTimeout(() => setShowSwipeHint(false), 2000);
        }, 500);
      }
    })();
  }, [router]);

  async function applyFilter(categoryId: string, sourceType: string) {
    setFilterLoading(true);
    try {
      const data = await api.getLinks({
        category_id: categoryId || undefined,
        source_type: sourceType || undefined,
      });
      setLinks(data);
    } finally {
      setFilterLoading(false);
    }
  }

  function handleCategoryChange(id: string) {
    setSelectedCategory(id);
    applyFilter(id, selectedSource);
  }

  function handleSourceChange(type: string) {
    setSelectedSource(type);
    applyFilter(selectedCategory, type);
  }

  function handleLinkAdded() {
    setShowAddModal(false);
    applyFilter(selectedCategory, selectedSource);
  }

  function handleLinkDeleted(id: string) {
    setLinks((prev) => prev.filter((l) => l.id !== id));
  }

  function handleStatusChange(id: string, status: "pending" | "in_progress" | "done") {
    setLinks((prev) => prev.map((l) => l.id === id ? { ...l, status } : l));
  }

  function getCategoryName(categoryId: string | null): string | undefined {
    if (!categoryId) return undefined;
    return categories.find((c) => c.id === categoryId)?.name;
  }

  if (loading) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100dvh",
          gap: "1rem",
          color: "var(--text-muted)",
        }}
      >
        <img src="/myhamdang.png" alt="Myhamdang" style={{ width: 64, height: 64, objectFit: "contain" }} />
        Loading…
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column" }}>

      {/* Sticky top group: header + filter bar */}
      <div style={{ position: "sticky", top: 0, zIndex: 100, background: "var(--surface)" }}>

        {/* Header */}
        <header
          style={{
            padding: "0.875rem 1.5rem",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
            <img src="/myhamdang.png" alt="Myhamdang" style={{ width: 32, height: 32, objectFit: "contain" }} />
            <h1 style={{ fontSize: 17, fontWeight: 700, letterSpacing: "-0.02em" }}>
              Arkive
            </h1>
          </div>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <button
              onClick={() => setShowAddModal(true)}
              style={{
                padding: "0.5rem 1rem",
                background: "var(--primary)",
                color: "white",
                fontWeight: 600,
                fontSize: 13,
                letterSpacing: "0.01em",
              }}
            >
              + Add Link
            </button>
            <button
              onClick={() => signOut({ callbackUrl: "/" })}
              style={{
                padding: "0.5rem 0.75rem",
                background: "transparent",
                color: "var(--text-dim)",
                fontSize: 12,
                border: "1px solid var(--border)",
              }}
            >
              Sign out
            </button>
          </div>
        </header>

        {insightLoading && !insight && (
          <div style={{ borderBottom: "1px solid var(--border)", background: "var(--surface-2)", padding: "0.75rem 1.5rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <div style={{ height: 10, width: "60%", background: "var(--border)", borderRadius: 4, animation: "pulse 1.5s ease-in-out infinite" }} />
            <div style={{ height: 10, width: "40%", background: "var(--border)", borderRadius: 4, animation: "pulse 1.5s ease-in-out infinite" }} />
          </div>
        )}
        {insight && (
          <InsightPanel
            insight={insight}
            onViewAll={() => router.push("/insights")}
          />
        )}

        {/* Filter bar */}
        <div style={{ borderBottom: "1px solid var(--border)", padding: "0 1.5rem" }}>

          {/* Row 1: Category tabs */}
          <div
            role="tablist"
            aria-label="카테고리 필터"
            style={{
              display: "flex",
              gap: 2,
              overflowX: "auto",
              scrollbarWidth: "none",
              padding: "0.625rem 0 0",
            }}
          >
            <button
              role="tab"
              aria-selected={selectedCategory === ""}
              onClick={() => handleCategoryChange("")}
              style={{
                padding: "0.375rem 0.875rem",
                borderRadius: 0,
                fontSize: 13,
                borderBottom: selectedCategory === "" ? "2px solid var(--primary)" : "2px solid transparent",
                color: selectedCategory === "" ? "var(--primary)" : "var(--text-muted)",
                fontWeight: selectedCategory === "" ? 600 : 400,
                background: "transparent",
                whiteSpace: "nowrap",
              }}
            >
              All
            </button>
            {categories.map((cat) => (
              <button
                role="tab"
                key={cat.id}
                aria-selected={selectedCategory === cat.id}
                onClick={() => handleCategoryChange(cat.id)}
                style={{
                  padding: "0.375rem 0.875rem",
                  borderRadius: 0,
                  fontSize: 13,
                  borderBottom: selectedCategory === cat.id ? "2px solid var(--primary)" : "2px solid transparent",
                  color: selectedCategory === cat.id ? "var(--primary)" : "var(--text-muted)",
                  fontWeight: selectedCategory === cat.id ? 600 : 400,
                  background: "transparent",
                  whiteSpace: "nowrap",
                }}
              >
                {cat.name}
              </button>
            ))}
          </div>

          {/* Row 2: Source type + status chips */}
          <div style={{ display: "flex", gap: "0.375rem", padding: "0.5rem 0 0.625rem", flexWrap: "wrap", alignItems: "center" }}>
            {SOURCE_TYPES.map((s) => (
              <button
                key={s.value}
                onClick={() => handleSourceChange(s.value)}
                aria-pressed={selectedSource === s.value}
                style={{
                  padding: "0.2rem 0.75rem",
                  borderRadius: 20,
                  fontSize: 11,
                  fontWeight: 500,
                  border: `1px solid ${selectedSource === s.value ? "var(--primary)" : "var(--border)"}`,
                  background: selectedSource === s.value ? "rgba(129,140,248,0.1)" : "transparent",
                  color: selectedSource === s.value ? "var(--primary)" : "var(--text-dim)",
                }}
              >
                {s.label}
              </button>
            ))}

            {/* Divider */}
            <span style={{ width: 1, height: 14, background: "var(--border)", margin: "0 0.125rem" }} />

            {/* Status filter chips */}
            {(["", "pending", "in_progress", "done"] as const).map((s) => {
              const label = s === "" ? "All" : s === "pending" ? "To Do" : s === "in_progress" ? "In Progress" : "Done";
              const active = selectedStatus === s;
              const color = s === "done" ? "#10b981" : s === "in_progress" ? "#f59e0b" : s === "pending" ? "#94a3b8" : undefined;
              return (
                <button
                  key={s}
                  onClick={() => setSelectedStatus(s)}
                  aria-pressed={active}
                  style={{
                    padding: "0.2rem 0.75rem",
                    borderRadius: 20,
                    fontSize: 11,
                    fontWeight: 500,
                    border: `1px solid ${active ? (color ?? "var(--primary)") : "var(--border)"}`,
                    background: active ? `${color ?? "var(--primary)"}1a` : "transparent",
                    color: active ? (color ?? "var(--primary)") : "var(--text-dim)",
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>

        </div>
      </div>

      {/* Main content — full width */}
      <main style={{ flex: 1, padding: "1.25rem 1.5rem", overflowY: "auto" }}>
        {(() => {
          const visibleLinks = selectedStatus
            ? links.filter((l) => l.status === selectedStatus)
            : links;

          const sortedLinks = [...visibleLinks].sort((a, b) => {
            const diff = new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
            return sortOrder === "newest" ? diff : -diff;
          });

          const doneCount = links.filter((l) => l.status === "done").length;
          const total = links.length;
          const pct = total ? Math.round(doneCount / total * 100) : 0;

          return (
        <>
        <div
          style={{
            marginBottom: "1rem",
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
            flexWrap: "wrap",
          }}
        >
          <p style={{ color: "var(--text-muted)", fontSize: 12, fontVariantNumeric: "tabular-nums" }}>
            {filterLoading ? "Loading…" : `${visibleLinks.length} ${visibleLinks.length === 1 ? "link" : "links"}`}
          </p>
          {!filterLoading && total > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span style={{ color: "var(--text-dim)", fontSize: 11 }}>·</span>
              <span style={{ color: "var(--text-muted)", fontSize: 11, fontVariantNumeric: "tabular-nums" }}>
                {doneCount} / {total} done
              </span>
              <div style={{ width: 60, height: 4, background: "var(--surface-2)", borderRadius: 2, overflow: "hidden" }}>
                <div style={{ width: `${pct}%`, height: "100%", background: "#10b981", borderRadius: 2 }} />
              </div>
              <span style={{ color: "var(--text-dim)", fontSize: 11, fontVariantNumeric: "tabular-nums" }}>{pct}%</span>
            </div>
          )}
          <div style={{ marginLeft: "auto", display: "flex", gap: "0.5rem" }}>
            {(["newest", "oldest"] as const).map((order) => {
              const active = sortOrder === order;
              return (
                <button
                  key={order}
                  onClick={() => setSortOrder(order)}
                  style={{
                    fontSize: 11,
                    background: "transparent",
                    color: active ? "var(--primary)" : "var(--text-dim)",
                    textDecoration: active ? "underline" : "none",
                    padding: "0 2px",
                  }}
                >
                  {order === "newest" ? "↓ 최신순" : "↑ 오래된순"}
                </button>
              );
            })}
          </div>
        </div>

        {sortedLinks.length === 0 ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: 320,
              gap: "0.75rem",
              color: "var(--text-muted)",
            }}
          >
            <img src="/myhamdang.png" alt="Myhamdang" style={{ width: 160, height: 160, objectFit: "contain", filter: "grayscale(100%)", opacity: 0.3 }} />
            <p style={{ fontSize: 15 }}>No links saved yet</p>
            <button
              onClick={() => setShowAddModal(true)}
              style={{
                padding: "0.5rem 1rem",
                background: "var(--primary)",
                color: "white",
                marginTop: "0.25rem",
                fontWeight: 500,
              }}
            >
              Add your first link
            </button>
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
              gap: "1rem",
              opacity: filterLoading ? 0.5 : 1,
              transition: "opacity 0.2s",
            }}
          >
            {sortedLinks.map((link, index) => (
              <LinkCard
                key={link.id}
                link={link}
                categoryName={getCategoryName(link.category_id)}
                onDelete={handleLinkDeleted}
                onStatusChange={handleStatusChange}
                isFirstCard={index === 0}
                showSwipeHint={showSwipeHint}
              />
            ))}
          </div>
        )}
        </>
          );
        })()}
      </main>

      {showAddModal && (
        <AddLinkModal onClose={() => setShowAddModal(false)} onAdded={handleLinkAdded} />
      )}
    </div>
  );
}
