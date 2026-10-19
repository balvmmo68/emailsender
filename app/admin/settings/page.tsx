"use client";

import { FormEvent, useEffect, useState } from "react";

type ProviderConfig = { delaySeconds: number; dailyLimit: number; providerLimit: string };
type KeyInfo = { provider: string; url: string; env: string; configured: boolean; freeDaily: string; freeMonthly: string; config: ProviderConfig; usedToday: number; rotationThreshold: number };
type Settings = { activeProvider: string; providerConfigs: Record<string, ProviderConfig> };

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings>({ activeProvider: "RESEND_API_KEY", providerConfigs: {} });
  const [keys, setKeys] = useState<KeyInfo[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [testing, setTesting] = useState("");
  const [testRecipient, setTestRecipient] = useState("");
  const [sending, setSending] = useState("");

  useEffect(() => {
    fetch("/api/settings").then(async (res) => {
      if (!res.ok) throw new Error("Không thể tải cấu hình");
      const data = await res.json();
      setSettings(data.settings);
      setKeys(data.keys);
    }).catch((err: Error) => setError(err.message));
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setMessage(""); setError("");
    const res = await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(settings) });
    const data = await res.json();
    if (!res.ok) { setError(data.error || "Không thể lưu cấu hình"); return; }
    setMessage("Đã lưu cấu hình riêng cho từng dịch vụ.");
  }

  function updateConfig(env: string, patch: Partial<ProviderConfig>) {
    setSettings({ ...settings, providerConfigs: { ...settings.providerConfigs, [env]: { ...settings.providerConfigs[env], ...patch } } });
  }

  async function testApi(env: string) {
    setTesting(env); setMessage(""); setError("");
    const response = await fetch("/api/settings/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ env }) });
    const data = await response.json();
    if (response.ok) setMessage(data.message); else setError(data.error || "Kiểm tra API thất bại");
    setTesting("");
  }

  async function sendProviderTest(env: string) {
    if (!testRecipient) { setError("Nhập email nhận test trước khi gửi."); return; }
    setSending(env); setMessage(""); setError("");
    const response = await fetch("/api/settings/send-test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ env, to: testRecipient }) });
    const data = await response.json();
    if (response.ok) setMessage(`Đã gửi email test qua ${env} tới ${data.to}. Message ID: ${data.id || "ok"}`); else setError(data.error || "Gửi email test thất bại");
    setSending("");
  }

  return <>
    <div className="eyebrow">System settings</div>
    <h1 className="title">Cấu hình gửi email theo dịch vụ</h1>
    <p className="sub">Mỗi API provider có bộ cấu hình riêng, không dùng chung khoảng cách gửi hoặc hạn mức/ngày.</p>
    {message && <div className="notice">{message}</div>}
    {error && <div className="notice error">{error}</div>}
    <form className="panel" onSubmit={save}>
      <h2>Cấu hình từng dịch vụ</h2>
      <div className="notice">Giá trị API key không bao giờ được trả về trình duyệt. Mỗi lần gửi sẽ chọn provider còn dưới 90% hạn mức/ngày, ưu tiên provider có tỷ lệ sử dụng thấp hơn, rồi thử provider kế tiếp nếu gửi thất bại.</div>
      <div className="field" style={{ maxWidth: 420, marginBottom: 18 }}><label htmlFor="testRecipient">Email nhận test</label><input className="input" id="testRecipient" type="email" required value={testRecipient} onChange={(e) => setTestRecipient(e.target.value)} placeholder="you@example.com" /><small>Email này sẽ nhận nội dung test khi bấm nút gửi ở từng provider.</small></div>
      <div className="tablewrap"><table className="table"><thead><tr><th>Nhà cung cấp</th><th>API key</th><th>Free/ngày</th><th>Free/tháng</th><th>Khoảng cách (giây)</th><th>Tối đa/ngày</th><th>Đã dùng / ngưỡng xoay</th><th>Hạn mức nhà cung cấp</th><th>Test API</th><th>Gửi email test</th></tr></thead><tbody>{keys.map((key) => { const config = settings.providerConfigs[key.env] || key.config; return <tr key={key.env}><td><a href={key.url} target="_blank" rel="noreferrer" title={`Mở website ${key.provider}`}><b>{key.provider}</b></a><br /><span className={`pill ${!key.configured ? "pill-danger" : ""}`}>{key.configured ? "Đã cấu hình" : "Chưa cấu hình"}</span></td><td><code>{key.env}</code></td><td>{key.freeDaily}</td><td>{key.freeMonthly}</td><td><input className="input" type="number" min="1" max="86400" aria-label={`Khoảng cách ${key.provider}`} value={config.delaySeconds} onChange={(e) => updateConfig(key.env, { delaySeconds: Number(e.target.value) })} /></td><td><input className="input" type="number" min="1" max="1000000" aria-label={`Hạn mức ngày ${key.provider}`} value={config.dailyLimit} onChange={(e) => updateConfig(key.env, { dailyLimit: Number(e.target.value) })} /></td><td>{key.usedToday} / {key.rotationThreshold} ({Math.round((key.usedToday / Math.max(config.dailyLimit, 1)) * 100)}%)</td><td><input className="input" aria-label={`Hạn mức nhà cung cấp ${key.provider}`} value={config.providerLimit} onChange={(e) => updateConfig(key.env, { providerLimit: e.target.value })} placeholder="Ví dụ: 100/ngày" /></td><td><button className="button secondary" type="button" disabled={!key.configured || testing === key.env} onClick={() => testApi(key.env)}>{testing === key.env ? "Đang test…" : "Test API"}</button></td><td><button className="button secondary" type="button" disabled={!key.configured || !testRecipient || sending === key.env} onClick={() => sendProviderTest(key.env)}>{sending === key.env ? "Đang gửi…" : "Gửi test"}</button></td></tr>; })}</tbody></table></div>
      <div className="actions"><button className="button" type="submit">Lưu tất cả cấu hình provider</button></div>
    </form>
  </>;
}
