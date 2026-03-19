"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import NextLink from "next/link";
import { api, Link as LinkType, Category } from "@/lib/api";

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

// ─── Link Card ────────────────────────────────────────────────────────────────

function LinkCard({
  link,
  categoryName,
  onDelete,
}: {
  link: LinkType;
  categoryName?: string;
  onDelete: (id: string) => void;
}) {
  const [imgError, setImgError] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [hovered, setHovered] = useState(false);

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

  return (
    <NextLink href={`/links/${link.id}`} style={{ textDecoration: "none", color: "inherit" }}>
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          transform: hovered ? "translateY(-3px)" : "none",
          boxShadow: hovered ? "var(--shadow-card-hover)" : "var(--shadow-card)",
          transition: "transform 0.15s ease, box-shadow 0.15s ease",
          cursor: "pointer",
          height: "100%",
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
    </NextLink>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const router = useRouter();
  const [links, setLinks] = useState<LinkType[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedSource, setSelectedSource] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [filterLoading, setFilterLoading] = useState(false);

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
              MyArchive
            </h1>
          </div>
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
        </header>

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

          {/* Row 2: Source type chips */}
          <div style={{ display: "flex", gap: "0.375rem", padding: "0.5rem 0 0.625rem", flexWrap: "wrap" }}>
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
          </div>

        </div>
      </div>

      {/* Main content — full width */}
      <main style={{ flex: 1, padding: "1.25rem 1.5rem", overflowY: "auto" }}>
        <div
          style={{
            marginBottom: "1rem",
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
          }}
        >
          <p style={{ color: "var(--text-muted)", fontSize: 12, fontVariantNumeric: "tabular-nums" }}>
            {filterLoading ? "Loading…" : `${links.length} ${links.length === 1 ? "link" : "links"}`}
          </p>
        </div>

        {links.length === 0 ? (
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
            {links.map((link) => (
              <LinkCard
                key={link.id}
                link={link}
                categoryName={getCategoryName(link.category_id)}
                onDelete={handleLinkDeleted}
              />
            ))}
          </div>
        )}
      </main>

      {showAddModal && (
        <AddLinkModal onClose={() => setShowAddModal(false)} onAdded={handleLinkAdded} />
      )}
    </div>
  );
}
