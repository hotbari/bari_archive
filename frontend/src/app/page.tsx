"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function LandingPage() {
  useEffect(() => {
    const els = document.querySelectorAll(".lp-reveal");
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("is-visible");
            obs.unobserve(e.target);
          }
        });
      },
      { threshold: 0.12 }
    );
    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, []);

  return (
    <main className="lp-root">
      {/* Nav */}
      <nav className="lp-nav">
        <span className="lp-wordmark">Arkive</span>
        <div className="lp-nav-actions">
          <Link href="/dashboard" className="lp-nav-login">Log In</Link>
          <Link href="/dashboard" className="lp-nav-cta">Try Arkive</Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="lp-hero">
        <div className="lp-hero-mesh" aria-hidden="true" />
        <div className="lp-hero-content">
          <p className="lp-eyebrow lp-hero-in" style={{ animationDelay: "0.05s" }}>
            Web archiving, reimagined
          </p>
          <h1 className="lp-headline lp-hero-in" style={{ animationDelay: "0.18s" }}>
            Save a link.<br />
            <span className="lp-headline-accent">Get the full picture.</span>
          </h1>
          <p className="lp-tagline lp-hero-in" style={{ animationDelay: "0.28s" }}>
            Smarter than memory.
          </p>
          <p className="lp-subline lp-hero-in" style={{ animationDelay: "0.38s" }}>
            Stop losing context on the things you save. Arkive auto-organizes
            every link and delivers AI summaries from three different perspectives —
            so nothing slips through.
          </p>
          <div className="lp-hero-cta-group lp-hero-in" style={{ animationDelay: "0.52s" }}>
            <Link href="/dashboard" className="lp-cta-primary">Save Your First Link</Link>
            <p className="lp-hero-note">Free. No account required.</p>
          </div>
        </div>
      </section>

      {/* Pain → Solution */}
      <section className="lp-pain">
        <div className="lp-pain-inner lp-reveal">
          <p className="lp-pain-before">You&rsquo;ve got 80 open tabs, a Notion graveyard, and still can&rsquo;t find that article.</p>
          <span className="lp-pain-arrow" aria-hidden="true">→</span>
          <p className="lp-pain-after">Arkive remembers, classifies, and explains every link you save.</p>
        </div>
      </section>

      {/* How It Works */}
      <section className="lp-howitworks">
        <p className="lp-section-label lp-reveal">How it works</p>
        <ol className="lp-steps">
          <li className="lp-step lp-reveal" data-delay="0">
            <span className="lp-step-num">1</span>
            <div>
              <h4>Save</h4>
              <p>Paste any URL. Arkive scrapes and stores it in seconds.</p>
            </div>
          </li>
          <li className="lp-step lp-reveal" data-delay="1">
            <span className="lp-step-num">2</span>
            <div>
              <h4>Organize</h4>
              <p>AI assigns source type, category, and picks the best thumbnail — automatically.</p>
            </div>
          </li>
          <li className="lp-step lp-reveal" data-delay="2">
            <span className="lp-step-num">3</span>
            <div>
              <h4>Review</h4>
              <p>Request multi-LLM analysis on any saved link with a single prompt.</p>
            </div>
          </li>
        </ol>
      </section>

      {/* Features */}
      <section className="lp-features">
        <p className="lp-section-label lp-reveal">What it does</p>
        <div className="lp-features-grid">
          <article className="lp-feature-card lp-feature-card--indigo lp-reveal" data-delay="0">
            <span className="lp-feature-index" style={{ color: "#818cf8" }}>01</span>
            <h3>AI Categorization</h3>
            <p>Every link is classified by source — e-commerce, social, news — then sorted into topic clusters your reading habits reveal over time.</p>
          </article>
          <article className="lp-feature-card lp-feature-card--cyan lp-reveal" data-delay="1">
            <span className="lp-feature-index" style={{ color: "#22d3ee" }}>02</span>
            <h3>Smart Thumbnails</h3>
            <p>Not every page has a great preview. Arkive scores candidate images and selects the one that actually represents the content.</p>
          </article>
          <article className="lp-feature-card lp-feature-card--emerald lp-reveal" data-delay="2">
            <span className="lp-feature-index" style={{ color: "#34d399" }}>03</span>
            <h3>Multi-LLM Reviews</h3>
            <p>Get perspectives from Claude, Gemini, and GPT simultaneously — so no single model frames your understanding.</p>
          </article>
        </div>
      </section>

      {/* Footer CTA */}
      <section className="lp-footer-cta">
        <h2 className="lp-reveal">Your archive is waiting.</h2>
        <Link href="/dashboard" className="lp-cta-primary lp-reveal" data-delay="1">
          Start Archiving — It&rsquo;s Free
        </Link>
        <p className="lp-footer-note lp-reveal" data-delay="2">No account required to start.</p>
      </section>
    </main>
  );
}
