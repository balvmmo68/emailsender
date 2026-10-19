"use client";

import { FormEvent, useEffect, useState } from "react";

type KeyInfo = { provider: string; env: string; configured: boolean; providerLimit: string; freeDaily: string; freeMonthly: string };
type Settings = { delaySeconds: number; dailyLimit: number; providerLimits: Record<string, string> };

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings>({ delaySeconds: 10, dailyLimit: 100, providerLimits: {} });
  const [keys, setKeys] = useState<KeyInfo[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/settings").then(async (res) => {
      if (!res.ok) throw new Error("Không thể tải cấu hình");
      const data = await res.json();
      setSettings(data.settings);
      setKeys(data.keys);
    }).catch((err: Error) => setError(err.message));
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");
    const res = await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(settings) });
    const data = await res.json();
    if (!res.ok) { setError(data.error || "Không thể lưu cấu hình"); return; }
    setKeys(keys.map((key) => ({ ...key, providerLimit: settings.providerLimits[key.env] || "Chưa xác định — nhập hạn mức thủ công" })));
    setMessage("Đã lưu cấu hình gửi email.");
  }

  function updateLimit(env: string, value: string) {
    setSettings({ ...settings, providerLimits: { ...settings.providerLimits, [env]: value } });
  }

  return <>
    <div className="eyebrow">System settings</div>
    <h1 className="title">Cấu hình gửi email</h1>
    <p className="sub">Thiết lập tốc độ gửi, hạn mức/ngày và hạn mức riêng của từng nhà cung cấp.</p>
    {message && <div className="notice">{message}</div>}
    {error && <div className="notice error">{error}</div>}
    <form className="panel" onSubmit={save}>
      <h2>Giới hạn gửi</h2>
      <div className="grid">
        <div className="field"><label htmlFor="delaySeconds">Khoảng cách giữa 2 email (giây)</label><input className="input" id="delaySeconds" type="number" min="1" max="86400" value={settings.delaySeconds} onChange={(e) => setSettings({ ...settings, delaySeconds: Number(e.target.value) })} /><small>Giúp giảm nguy cơ bị giới hạn tốc độ bởi nhà cung cấp.</small></div>
        <div className="field"><label htmlFor="dailyLimit">Tối đa email được gửi trong ngày</label><input className="input" id="dailyLimit" type="number" min="1" max="1000000" value={settings.dailyLimit} onChange={(e) => setSettings({ ...settings, dailyLimit: Number(e.target.value) })} /><small>Đây là hạn mức bảo vệ ở cấp ứng dụng.</small></div>
      </div>
      <div className="actions"><button className="button" type="submit">Lưu cấu hình</button></div>
    </form>
    <section className="panel">
      <h2>API key đang được cấu hình</h2>
      <div className="notice">Chỉ hiển thị tên biến và trạng thái. Giá trị API key không bao giờ được trả về trình duyệt. Hạn mức free là thông tin tham khảo; hãy kiểm tra điều khoản và dashboard thực tế của từng nhà cung cấp trước khi gửi.</div>
      <div className="tablewrap"><table className="table"><thead><tr><th>Nhà cung cấp</th><th>Biến môi trường</th><th>Trạng thái</th><th>Free/ngày</th><th>Free/tháng</th><th>Hạn mức tùy chỉnh</th></tr></thead><tbody>{keys.map((key) => <tr key={key.env}><td>{key.provider}</td><td><code>{key.env}</code></td><td><span className="pill">{key.configured ? "Đã cấu hình" : "Chưa cấu hình"}</span></td><td>{key.freeDaily}</td><td>{key.freeMonthly}</td><td><input className="input" aria-label={`Hạn mức ${key.provider}`} value={settings.providerLimits[key.env] ?? key.providerLimit} onChange={(e) => updateLimit(key.env, e.target.value)} placeholder="Ví dụ: 100 email/ngày" /></td></tr>)}</tbody></table></div>
      <div className="actions"><button className="button" type="button" onClick={() => document.querySelector<HTMLFormElement>("form")?.requestSubmit()}>Lưu hạn mức nhà cung cấp</button></div>
    </section>
  </>;
}
