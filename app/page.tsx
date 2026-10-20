"use client";

import { useState, type FormEvent } from "react";

export default function HomePage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setSuccess(false);
    try {
      const response = await fetch("/api/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, consent, website }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "We couldn't sign you up right now.");
      setSuccess(true);
      setName("");
      setEmail("");
      setConsent(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return <main className="public-site">
    <header className="public-header">
      <a className="public-brand" href="/" aria-label="Sendroom home"><span className="public-brand-mark">S</span><span>sendroom<span className="brand-period">.</span></span></a>
      <nav className="public-nav" aria-label="Main navigation"><a href="#topics">Topics</a><a href="#about">About</a></nav>
    </header>

    <section className="public-hero" aria-labelledby="hero-title">
      <div className="hero-copy">
        <div className="public-kicker"><span className="kicker-dot" /> THE FINANCE BRIEFING</div>
        <h1 id="hero-title">Markets move. <span>Stay in the know.</span></h1>
        <p className="hero-description">Get concise notes on crypto, forex, and finance—so you can follow what matters without getting buried in the daily news cycle.</p>
        <div className="topic-chips" id="topics" aria-label="Newsletter topics"><span><i className="topic-icon crypto-icon">₿</i> Crypto</span><span><i className="topic-icon forex-icon">↗</i> Forex</span><span><i className="topic-icon finance-icon">◫</i> Finance</span></div>
        <div className="hero-footnote"><span className="sparkle">✳</span><span>Curated insights, clearly presented, delivered straight to your inbox.</span></div>
      </div>

      <div className="signup-card" id="signup">
        <div className="card-topline"><span className="card-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6.5h16v11H4z"/><path d="m4.5 7 7.5 6 7.5-6"/></svg></span><span className="card-frequency">FREE · PERIODIC</span></div>
        <h2>Get the newsletter</h2><p className="signup-intro">Sign up for the latest updates, delivered by email.</p>
        <form className="signup-form" onSubmit={submit}>
          <div className="form-field"><label htmlFor="newsletter-name">Your name</label><input id="newsletter-name" name="name" type="text" autoComplete="name" maxLength={120} placeholder="e.g. Alex Morgan" required value={name} onChange={(event) => setName(event.target.value)} /></div>
          <div className="form-field"><label htmlFor="newsletter-email">Email address</label><input id="newsletter-email" name="email" type="email" autoComplete="email" maxLength={254} placeholder="you@example.com" required value={email} onChange={(event) => setEmail(event.target.value)} /></div>
          <div className="newsletter-honeypot" aria-hidden="true"><label htmlFor="newsletter-website">Website</label><input id="newsletter-website" name="website" type="text" tabIndex={-1} autoComplete="off" value={website} onChange={(event) => setWebsite(event.target.value)} /></div>
          <label className="consent-row"><input type="checkbox" required checked={consent} onChange={(event) => setConsent(event.target.checked)} /><span>I agree to receive newsletter emails about crypto, forex, and finance.</span></label>
          <button className="signup-submit" type="submit" disabled={busy}>{busy ? <><span className="button-spinner" /> Signing you up…</> : <>Subscribe <span aria-hidden="true">→</span></>}</button>
          {error && <p className="form-feedback form-error" role="alert">{error}</p>}
          {success && <p className="form-feedback form-success" role="status">You're subscribed. Look out for the next briefing in your inbox.</p>}
        </form>
        <div className="privacy-note"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.8 13 4v3.6c0 3.1-2.2 5.4-5 6.6-2.8-1.2-5-3.5-5-6.6V4l5-2.2Z"/><path d="m5.7 7.8 1.5 1.5 3.2-3.2"/></svg><span>Your email is used only for the newsletter and is never shared.</span></div>
      </div>
      <div className="hero-orb orb-one" aria-hidden="true" /><div className="hero-orb orb-two" aria-hidden="true" />
    </section>

    <section className="public-value" id="about" aria-label="What you'll get">
      <div className="value-heading"><span className="section-overline">ONE NEWSLETTER. THREE PERSPECTIVES.</span><h2>Less noise. More perspective.</h2></div>
      <div className="value-grid">
        <article className="value-item"><span className="value-number">01</span><h3>Crypto</h3><p>Market developments, emerging trends, and stories worth following across digital assets.</p></article>
        <article className="value-item"><span className="value-number">02</span><h3>Forex</h3><p>Briefs on currency pairs, market moves, and the economic context shaping foreign exchange.</p></article>
        <article className="value-item"><span className="value-number">03</span><h3>Finance</h3><p>Economic and financial topics distilled into clear, concise updates you can follow with ease.</p></article>
      </div>
    </section>

    <footer className="public-footer"><a className="public-brand footer-brand" href="/"><span className="public-brand-mark">S</span><span>sendroom<span className="brand-period">.</span></span></a><p>For informational purposes only. Not investment advice or a recommendation to trade.</p><a href="#signup">Subscribe ↑</a></footer>
    <section className="public-legal" aria-labelledby="legal-title">
      <h2 id="legal-title">Terms, disclaimer &amp; privacy</h2>
      <div className="legal-grid">
        <p><strong>Information only.</strong> The newsletter is provided for general informational and educational purposes. It is not financial, investment, trading, tax, or legal advice, nor a recommendation to buy or sell any asset. Always make your own decisions and consult a qualified professional where appropriate.</p>
        <p><strong>No guarantees.</strong> Content may be based on sources believed to be reliable, but Sendroom makes no warranty as to its accuracy, completeness, timeliness, or availability and has no obligation to update previously published content. Markets involve risk; you are solely responsible for decisions made in reliance on information in the newsletter.</p>
        <p><strong>Service terms.</strong> To the maximum extent permitted by applicable law, Sendroom disclaims liability for losses arising from use of, or reliance on, the newsletter. Sendroom may revise, suspend, or discontinue the newsletter or these terms at any time. Continued subscription after a change constitutes acceptance of the updated terms.</p>
        <p><strong>Your subscription &amp; data.</strong> By subscribing, you agree to receive periodic email updates about crypto, forex, and finance. Your name and email are used to operate the newsletter, are not sold, and may be processed by service providers needed to deliver the service or when required by law. To request removal from the mailing list, email <a href="mailto:support@kryex.xyz">support@kryex.xyz</a>.</p>
      </div>
      <p className="legal-updated">These terms are provided for general information and do not replace legal advice. Last updated: October 2026.</p>
    </section>
  </main>;
}
