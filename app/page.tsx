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
      if (!response.ok) throw new Error(result.error || "Không thể đăng ký lúc này.");
      setSuccess(true);
      setName("");
      setEmail("");
      setConsent(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Có lỗi xảy ra. Vui lòng thử lại.");
    } finally {
      setBusy(false);
    }
  }

  return <main className="public-site">
    <header className="public-header">
      <a className="public-brand" href="/" aria-label="Sendroom, trang chủ"><span className="public-brand-mark">S</span><span>sendroom<span className="brand-period">.</span></span></a>
      <nav className="public-nav" aria-label="Điều hướng chính"><a href="#topics">Chủ đề</a><a href="#about">Về bản tin</a></nav>
      <a className="public-admin-link" href="/login">Đăng nhập quản trị <span aria-hidden="true">↗</span></a>
    </header>

    <section className="public-hero" aria-labelledby="hero-title">
      <div className="hero-copy">
        <div className="public-kicker"><span className="kicker-dot" /> BẢN TIN TÀI CHÍNH ĐỊNH KỲ</div>
        <h1 id="hero-title">Thị trường chuyển động. <span>Luôn cập nhật.</span></h1>
        <p className="hero-description">Nhận những ghi chú ngắn gọn về crypto, forex và tài chính — giúp bạn theo dõi điều đáng chú ý mà không bị ngợp trong dòng tin mỗi ngày.</p>
        <div className="topic-chips" id="topics" aria-label="Các chủ đề"><span><i className="topic-icon crypto-icon">₿</i> Crypto</span><span><i className="topic-icon forex-icon">↗</i> Forex</span><span><i className="topic-icon finance-icon">◫</i> Finance</span></div>
        <div className="hero-footnote"><span className="sparkle">✳</span><span>Thông tin chọn lọc, trình bày rõ ràng, gửi thẳng tới hộp thư của bạn.</span></div>
      </div>

      <div className="signup-card" id="signup">
        <div className="card-topline"><span className="card-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6.5h16v11H4z"/><path d="m4.5 7 7.5 6 7.5-6"/></svg></span><span className="card-frequency">MIỄN PHÍ · ĐỊNH KỲ</span></div>
        <h2>Gửi tôi bản tin</h2><p className="signup-intro">Đăng ký để nhận các cập nhật mới nhất qua email.</p>
        <form className="signup-form" onSubmit={submit}>
          <div className="form-field"><label htmlFor="newsletter-name">Tên của bạn</label><input id="newsletter-name" name="name" type="text" autoComplete="name" maxLength={120} placeholder="Ví dụ: Minh Anh" required value={name} onChange={(event) => setName(event.target.value)} /></div>
          <div className="form-field"><label htmlFor="newsletter-email">Địa chỉ email</label><input id="newsletter-email" name="email" type="email" autoComplete="email" maxLength={254} placeholder="ban@email.com" required value={email} onChange={(event) => setEmail(event.target.value)} /></div>
          <div className="newsletter-honeypot" aria-hidden="true"><label htmlFor="newsletter-website">Website</label><input id="newsletter-website" name="website" type="text" tabIndex={-1} autoComplete="off" value={website} onChange={(event) => setWebsite(event.target.value)} /></div>
          <label className="consent-row"><input type="checkbox" required checked={consent} onChange={(event) => setConsent(event.target.checked)} /><span>Tôi đồng ý nhận email bản tin về crypto, forex và tài chính.</span></label>
          <button className="signup-submit" type="submit" disabled={busy}>{busy ? <><span className="button-spinner" /> Đang đăng ký…</> : <>Đăng ký nhận tin <span aria-hidden="true">→</span></>}</button>
          {error && <p className="form-feedback form-error" role="alert">{error}</p>}
          {success && <p className="form-feedback form-success" role="status">Bạn đã đăng ký thành công. Hẹn gặp bạn trong bản tin tiếp theo.</p>}
        </form>
        <div className="privacy-note"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.8 13 4v3.6c0 3.1-2.2 5.4-5 6.6-2.8-1.2-5-3.5-5-6.6V4l5-2.2Z"/><path d="m5.7 7.8 1.5 1.5 3.2-3.2"/></svg><span>Chỉ dùng email để gửi bản tin. Không chia sẻ thông tin của bạn.</span></div>
      </div>
      <div className="hero-orb orb-one" aria-hidden="true" /><div className="hero-orb orb-two" aria-hidden="true" />
    </section>

    <section className="public-value" id="about" aria-label="Điều bạn sẽ nhận được">
      <div className="value-heading"><span className="section-overline">MỘT BẢN TIN, BA GÓC NHÌN</span><h2>Ít nhiễu hơn. Nắm bắt tốt hơn.</h2></div>
      <div className="value-grid">
        <article className="value-item"><span className="value-number">01</span><h3>Crypto</h3><p>Diễn biến nổi bật, xu hướng và những câu chuyện đáng theo dõi trong thị trường tài sản số.</p></article>
        <article className="value-item"><span className="value-number">02</span><h3>Forex</h3><p>Điểm tin về các cặp tiền tệ, biến động và bối cảnh kinh tế có thể tác động đến thị trường.</p></article>
        <article className="value-item"><span className="value-number">03</span><h3>Tài chính</h3><p>Các chủ đề kinh tế và tài chính được tóm lược ngắn gọn, dễ đọc và dễ theo dõi.</p></article>
      </div>
    </section>

    <footer className="public-footer"><a className="public-brand footer-brand" href="/"><span className="public-brand-mark">S</span><span>sendroom<span className="brand-period">.</span></span></a><p>Nội dung chỉ nhằm mục đích thông tin, không phải lời khuyên đầu tư hay khuyến nghị giao dịch.</p><a href="#signup">Đăng ký nhận tin ↑</a></footer>
  </main>;
}
