import type { InsightData } from "@/types/insights";

export interface Link {
  id: string;
  url: string;
  title: string | null;
  description: string | null;
  source_type: string;
  category_id: string | null;
  thumbnail_url: string | null;
  user_notes: string | null;
  status: "pending" | "in_progress" | "done";
  created_at: string;
}

export interface Category {
  id: string;
  name: string;
  description: string | null;
}

export interface UserProfile {
  id: string;
  interview_answers: Record<string, string> | null;
  interests: Record<string, unknown> | null;
  preferences: Record<string, unknown> | null;
}

export interface InterviewQuestion {
  id: string;
  question: string;
}

export interface LLMReview {
  model: string;
  perspective: string;
  content: string;
}

export interface ReviewResponse {
  link_id: string;
  user_insight: string;
  reviews: LLMReview[];
}

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(path, { ...init, cache: "no-store" });
  return res;
}

export const api = {
  async getLinks(params?: { category_id?: string; source_type?: string }): Promise<Link[]> {
    const url = new URL("/api/links", window.location.origin);
    if (params?.category_id) url.searchParams.set("category_id", params.category_id);
    if (params?.source_type) url.searchParams.set("source_type", params.source_type);
    const res = await apiFetch(url.pathname + url.search);
    if (!res.ok) throw new Error("Failed to fetch links");
    return res.json();
  },

  async createLink(url: string, user_notes?: string): Promise<Link> {
    const res = await apiFetch("/api/links", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, user_notes }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as { detail?: string }).detail || "Failed to add link");
    }
    return res.json();
  },

  async getLink(id: string): Promise<Link> {
    const res = await apiFetch(`/api/links/${id}`);
    if (!res.ok) throw new Error("Link not found");
    return res.json();
  },

  async updateLink(id: string, user_notes: string | null): Promise<Link> {
    const res = await apiFetch(`/api/links/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_notes }),
    });
    if (!res.ok) throw new Error("Failed to update link");
    return res.json();
  },

  async updateLinkStatus(id: string, status: "pending" | "in_progress" | "done"): Promise<Link> {
    const res = await apiFetch(`/api/links/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) throw new Error("Failed to update status");
    return res.json();
  },

  async deleteLink(id: string): Promise<void> {
    const res = await apiFetch(`/api/links/${id}`, { method: "DELETE" });
    if (!res.ok) throw new Error("Failed to delete link");
  },

  async getCategories(): Promise<Category[]> {
    const res = await apiFetch("/api/categories");
    if (!res.ok) return [];
    return res.json();
  },

  async getProfile(): Promise<UserProfile | null> {
    const res = await apiFetch("/api/profile");
    if (!res.ok) return null;
    return res.json();
  },

  async getQuestions(): Promise<InterviewQuestion[]> {
    const res = await apiFetch("/api/profile/questions");
    if (!res.ok) return [];
    const data = await res.json();
    return data.questions;
  },

  async submitInterview(answers: Record<string, string>): Promise<UserProfile> {
    const res = await apiFetch("/api/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers }),
    });
    if (!res.ok) throw new Error("Failed to submit interview");
    return res.json();
  },

  async createReview(linkId: string, userInsight: string): Promise<ReviewResponse> {
    const res = await apiFetch(`/api/reviews/${linkId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_insight: userInsight }),
    });
    if (!res.ok) throw new Error("Failed to generate reviews");
    return res.json();
  },

  async getInsights(refresh = false): Promise<InsightData | null> {
    const url = refresh ? "/api/insights?refresh=true" : "/api/insights";
    const res = await apiFetch(url);
    if (res.status === 204 || res.status === 503) return null;
    if (!res.ok) return null;
    return res.json();
  },
};
