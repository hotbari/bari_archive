"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { api, Link as LinkType, LLMReview } from "@/lib/api";

const MODEL_COLORS: Record<string, string> = {
  claude: "#c026d3",
  gemini: "#1d4ed8",
  gpt: "#16a34a",
};

function modelColor(model: string): string {
  const key = model.toLowerCase();
  for (const [k, v] of Object.entries(MODEL_COLORS)) {
    if (key.includes(k)) return v;
  }
  return "#94a3b8";
}

function modelLabel(model: string): string {
  if (model.toLowerCase().includes("claude")) return "Claude";
  if (model.toLowerCase().includes("gemini")) return "Gemini";
  if (model.toLowerCase().includes("gpt")) return "GPT";
  return model;
}

function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace("www.", "");
  } catch {
    return url;
  }
}

function ReviewCard({ review }: { review: LLMReview }) {
  const color = modelColor(review.model);
  return (
    <div
      style={{
        background: "var(--surface)",
        border: `1px solid ${color}33`,
        borderLeft: `3px solid ${color}`,
        borderRadius: "var(--radius-lg)",
        padding: "1rem",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          marginBottom: "0.625rem",
        }}
      >
        <span
          style={{
            padding: "2px 8px",
            borderRadius: 4,
            fontSize: 11,
            fontWeight: 700,
            background: `${color}1a`,
            color: color,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          {modelLabel(review.model)}
        </span>
        <span style={{ color: "var(--text-dim)", fontSize: 12 }}>{review.perspective}</span>
      </div>
      <p style={{ color: "var(--text-muted)", fontSize: 13, lineHeight: 1.6 }}>{review.content}</p>
    </div>
  );
}

export default function LinkDetail() {
  const params = useParams();
  const router = useRouter();
  const linkId = params.id as string;

  const [link, setLink] = useState<LinkType | null>(null);
  const [notes, setNotes] = useState("");
  const [notesSaved, setNotesSaved] = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);
  const [insight, setInsight] = useState("");
  const [reviews, setReviews] = useState<LLMReview[]>([]);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewError, setReviewError] = useState("");
  const [imgError, setImgError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [togglingStatus, setTogglingStatus] = useState(false);

  useEffect(() => {
    api
      .getLink(linkId)
      .then((data) => {
        setLink(data);
        setNotes(data.user_notes ?? "");
        setLoading(false);
      })
      .catch(() => {
        setError("Link not found.");
        setLoading(false);
      });
  }, [linkId]);

  async function handleSaveNotes() {
    if (!link) return;
    setSavingNotes(true);
    setNotesSaved(false);
    try {
      const updated = await api.updateLink(link.id, notes || null);
      setLink(updated);
      setNotesSaved(true);
      setTimeout(() => setNotesSaved(false), 2000);
    } finally {
      setSavingNotes(false);
    }
  }

  async function handleToggleStatus() {
    if (!link) return;
    const newStatus = link.status === "done" ? "pending" : "done";
    setTogglingStatus(true);
    try {
      const updated = await api.updateLinkStatus(link.id, newStatus);
      setLink(updated);
    } finally {
      setTogglingStatus(false);
    }
  }

  async function handleGetReviews() {
    if (!insight.trim()) return;
    setReviewLoading(true);
    setReviewError("");
    setReviews([]);
    try {
      const result = await api.createReview(linkId, insight.trim());
      setReviews(result.reviews);
    } catch (err) {
      setReviewError(err instanceof Error ? err.message : "Failed to generate reviews");
    } finally {
      setReviewLoading(false);
    }
  }

  if (loading) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100dvh",
          color: "var(--text-muted)",
        }}
      >
        Loading…
      </div>
    );
  }

  if (error || !link) {
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
        <p>{error || "Link not found"}</p>
        <button
          onClick={() => router.push("/dashboard")}
          style={{ padding: "0.5rem 1rem", background: "var(--primary)", color: "white" }}
        >
          Back to Dashboard
        </button>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <header
        style={{
          padding: "0.875rem 1.5rem",
          borderBottom: "1px solid var(--border)",
          background: "var(--surface)",
          position: "sticky",
          top: 0,
          zIndex: 100,
          display: "flex",
          alignItems: "center",
          gap: "1rem",
        }}
      >
        <button
          onClick={() => router.push("/dashboard")}
          style={{
            background: "transparent",
            color: "var(--text-muted)",
            fontSize: 13,
            padding: "0.375rem 0.625rem",
            border: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            gap: "0.375rem",
          }}
        >
          ← Back
        </button>
        <h1
          style={{
            fontSize: 15,
            fontWeight: 600,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {link.title ?? getDomain(link.url)}
        </h1>
      </header>

      <div
        style={{
          flex: 1,
          maxWidth: 860,
          width: "100%",
          margin: "0 auto",
          padding: "1.5rem",
          display: "flex",
          flexDirection: "column",
          gap: "1.5rem",
        }}
      >
        {/* Thumbnail + meta */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: link.thumbnail_url && !imgError ? "280px 1fr" : "1fr",
            gap: "1.5rem",
            alignItems: "start",
          }}
        >
          {link.thumbnail_url && !imgError && (
            <div
              style={{
                borderRadius: "var(--radius-lg)",
                overflow: "hidden",
                border: "1px solid var(--border)",
                background: "var(--surface-2)",
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={link.thumbnail_url}
                alt={link.title ?? "thumbnail"}
                onError={() => setImgError(true)}
                style={{ width: "100%", display: "block", objectFit: "cover" }}
              />
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}>
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.3, marginBottom: "0.375rem" }}>
                {link.title ?? getDomain(link.url)}
              </h2>
              <a
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "var(--text-dim)", fontSize: 12, wordBreak: "break-all" }}
              >
                {link.url}
              </a>
            </div>

            {link.description && (
              <p style={{ color: "var(--text-muted)", fontSize: 13, lineHeight: 1.6 }}>
                {link.description}
              </p>
            )}

            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
              <span
                style={{
                  padding: "3px 10px",
                  borderRadius: 4,
                  fontSize: 11,
                  fontWeight: 600,
                  background: "var(--surface-2)",
                  color: "var(--text-muted)",
                  border: "1px solid var(--border)",
                  textTransform: "capitalize",
                }}
              >
                {link.source_type}
              </span>
              <button
                onClick={handleToggleStatus}
                disabled={togglingStatus}
                style={{
                  padding: "3px 12px",
                  borderRadius: 4,
                  fontSize: 11,
                  fontWeight: 700,
                  background: link.status === "done" ? "#10b9811a" : "var(--surface-2)",
                  color: link.status === "done" ? "#10b981" : "var(--text-muted)",
                  border: `1px solid ${link.status === "done" ? "#10b98133" : "var(--border)"}`,
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
              >
                {link.status === "done" ? "✓ 완료" : "○ 미완료"}
              </button>
            </div>
          </div>
        </div>

        {/* Notes */}
        <section
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-lg)",
            padding: "1.25rem",
            boxShadow: "var(--shadow-card)",
          }}
        >
          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: "0.75rem" }}>My Notes</h3>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Add your notes about this link…"
            rows={4}
            style={{ width: "100%", padding: "0.625rem 0.75rem", marginBottom: "0.75rem" }}
          />
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <button
              onClick={handleSaveNotes}
              disabled={savingNotes}
              style={{
                padding: "0.5rem 1rem",
                background: "var(--primary)",
                color: "white",
                fontWeight: 500,
                fontSize: 13,
              }}
            >
              {savingNotes ? "Saving…" : "Save Notes"}
            </button>
            {notesSaved && (
              <span style={{ color: "#10b981", fontSize: 12 }}>✓ Saved</span>
            )}
          </div>
        </section>

        {/* AI Reviews */}
        <section
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-lg)",
            padding: "1.25rem",
            boxShadow: "var(--shadow-card)",
          }}
        >
          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: "0.375rem" }}>
            AI Multi-Perspective Review
          </h3>
          <p style={{ color: "var(--text-dim)", fontSize: 12, marginBottom: "1rem" }}>
            Share your insight about this content and get perspectives from Claude, Gemini, and GPT.
          </p>

          <textarea
            value={insight}
            onChange={(e) => setInsight(e.target.value)}
            placeholder="What did you take away from this? What questions do you have?"
            rows={3}
            style={{ width: "100%", padding: "0.625rem 0.75rem", marginBottom: "0.75rem" }}
          />

          <button
            onClick={handleGetReviews}
            disabled={reviewLoading || !insight.trim()}
            style={{
              padding: "0.5rem 1.125rem",
              background: "var(--primary)",
              color: "white",
              fontWeight: 500,
              fontSize: 13,
            }}
          >
            {reviewLoading ? "Generating reviews…" : "Get AI Reviews"}
          </button>

          {reviewError && (
            <p style={{ color: "var(--danger)", fontSize: 13, marginTop: "0.75rem" }}>
              {reviewError}
            </p>
          )}

          {reviews.length > 0 && (
            <div
              style={{
                marginTop: "1.25rem",
                display: "flex",
                flexDirection: "column",
                gap: "0.875rem",
              }}
            >
              {reviews.map((r, i) => (
                <ReviewCard key={i} review={r} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
