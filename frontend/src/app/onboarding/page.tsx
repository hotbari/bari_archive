"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { api, InterviewQuestion } from "@/lib/api";

export default function Onboarding() {
  const router = useRouter();
  const [questions, setQuestions] = useState<InterviewQuestion[]>([]);
  const [currentStep, setCurrentStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      // If profile already exists, skip onboarding
      const profile = await api.getProfile();
      if (profile) {
        router.push("/dashboard");
        return;
      }
      const qs = await api.getQuestions();
      setQuestions(qs);
      const initial: Record<string, string> = {};
      qs.forEach((q) => (initial[q.id] = ""));
      setAnswers(initial);
      setLoading(false);
    })();
  }, [router]);

  const current = questions[currentStep];
  const isLast = currentStep === questions.length - 1;
  const currentAnswer = current ? (answers[current.id] ?? "") : "";
  const progress = questions.length > 0 ? ((currentStep + 1) / questions.length) * 100 : 0;

  function handleNext() {
    if (currentStep < questions.length - 1) {
      setCurrentStep((s) => s + 1);
    }
  }

  function handleBack() {
    if (currentStep > 0) {
      setCurrentStep((s) => s - 1);
    }
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError("");
    try {
      await api.submitInterview(answers);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save profile");
      setSubmitting(false);
    }
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
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "2rem 1rem",
      }}
    >
      <div style={{ width: "100%", maxWidth: 560 }}>
        {/* Logo */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.625rem",
            justifyContent: "center",
            marginBottom: "2.5rem",
          }}
        >
          <img src="/myhamdang.png" alt="Myhamdang" style={{ width: 36, height: 36, objectFit: "contain" }} />
          <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em" }}>MyArchive</h1>
        </div>

        {/* Card */}
        <div
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-lg)",
            padding: "2rem",
            boxShadow: "0 4px 24px rgba(0, 0, 0, 0.4), 0 1px 4px rgba(0, 0, 0, 0.3)",
          }}
        >
          {/* Welcome header (first step only) */}
          {currentStep === 0 && (
            <div style={{ marginBottom: "1.5rem", textAlign: "center" }}>
              <img src="/myhamdang.png" alt="Myhamdang" style={{ width: 80, height: 80, objectFit: "contain", marginBottom: "0.75rem" }} />
              <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: "0.5rem" }}>
                Welcome! Let&apos;s personalize your archive
              </h2>
              <p style={{ color: "var(--text-muted)", fontSize: 13, lineHeight: 1.6 }}>
                Answer a few quick questions so we can intelligently categorize your saved links.
              </p>
            </div>
          )}

          {/* Progress bar */}
          <div
            style={{
              marginBottom: "1.5rem",
              display: "flex",
              flexDirection: "column",
              gap: "0.5rem",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: 11,
                color: "var(--text-dim)",
              }}
            >
              <span>
                Question {currentStep + 1} of {questions.length}
              </span>
              <span>{Math.round(progress)}%</span>
            </div>
            <div
              style={{
                height: 4,
                borderRadius: 2,
                background: "var(--border)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${progress}%`,
                  background: "var(--primary)",
                  borderRadius: 2,
                  transition: "width 0.3s ease",
                }}
              />
            </div>
          </div>

          {/* Question */}
          {current && (
            <div style={{ marginBottom: "1.5rem" }}>
              <label
                style={{
                  display: "block",
                  fontSize: 15,
                  fontWeight: 500,
                  marginBottom: "0.875rem",
                  lineHeight: 1.4,
                }}
              >
                {current.question}
              </label>
              <textarea
                value={currentAnswer}
                onChange={(e) =>
                  setAnswers((prev) => ({ ...prev, [current.id]: e.target.value }))
                }
                placeholder="Type your answer here…"
                rows={4}
                autoFocus
                style={{
                  width: "100%",
                  padding: "0.75rem",
                  fontSize: 14,
                  lineHeight: 1.5,
                }}
              />
            </div>
          )}

          {error && (
            <p style={{ color: "var(--danger)", fontSize: 13, marginBottom: "1rem" }}>{error}</p>
          )}

          {/* Navigation */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <button
              onClick={handleBack}
              disabled={currentStep === 0}
              style={{
                padding: "0.5rem 1rem",
                background: "var(--surface-2)",
                color: "var(--text-muted)",
                fontSize: 13,
                opacity: currentStep === 0 ? 0.3 : 1,
              }}
            >
              ← Back
            </button>

            {isLast ? (
              <button
                onClick={handleSubmit}
                disabled={submitting}
                style={{
                  padding: "0.5rem 1.375rem",
                  background: "var(--primary)",
                  color: "white",
                  fontWeight: 600,
                  fontSize: 13,
                }}
              >
                {submitting ? "Setting up your archive…" : "Start Archiving →"}
              </button>
            ) : (
              <button
                onClick={handleNext}
                style={{
                  padding: "0.5rem 1.25rem",
                  background: "var(--primary)",
                  color: "white",
                  fontWeight: 500,
                  fontSize: 13,
                }}
              >
                Next →
              </button>
            )}
          </div>
        </div>

        <p style={{ textAlign: "center", color: "var(--text-dim)", fontSize: 11, marginTop: "1rem" }}>
          Your answers are used only to personalize your experience.
        </p>
      </div>
    </div>
  );
}
