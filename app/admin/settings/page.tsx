"use client";

import { FormEvent, useEffect, useState } from "react";

type ProviderConfig = { delaySeconds: number; dailyLimit: number; providerLimit: string };
type KeyInfo = { provider: string; env: string; configured: boolean; freeDaily: string; freeMonthly: string; config: ProviderConfig };
type Settings = { activeProvider: string; providerConfigs: Record<string, ProviderConfig> };

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings>({ activeProvider: "RESEND_API_KEY", providerConfigs: {} });
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
    event.preventDefault(); setMessage(""); setError("");
    const res = await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(settings) });
    const data = await res.json();
    if (!res.ok) { setError(data.error || "Không thể lưu cấu hình"); return; }
    setMessage("Đã lưu cấu hình riêng cho từng dịch vụ.");
  }

  function updateConfig(env: string, patch: Partial<ProviderConfig>) {
    setSettings({ ...settings, providerConfigs: { ...settings.providerConfigs, [env]: { ...settings.providerConfigs[env], ...patch } } });
  }

  return <>
    <div className="eyebrow">System settings</div>
    <h1 className="title">Cấu hình gửi email theo dịch vụ</h1>
    <p className="sub">Mỗi API provider có bộ cấu hình riêng, không dùng chung khoảng cách gửi hoặc hạn mức/ngày.</p>
    {message && <div className="notice">{message}</div>}
    {error && <div className="notice error">{error}</div>}
    <form className="panel" onSubmit={save}>
      <h2>Cấu hình từng dịch vụ</h2>
      <div className="notice">Giá trị API key không bao giờ được trả về trình duyệt. Các dịch vụ bên dưới đã có cấu hình riêng; logic gửi thực tế hiện vẫn dùng Resend cho đến khi tích hợp adapter tương ứng.</div>
      <div className="tablewrap"><table className="table"><thead><tr><th>Nhà cung cấp</th><th>API key</th><th>Free/ngày</th><th>Free/tháng</th><th>Khoảng cách (giây)</th><th>Tối đa/ngày</th><th>Hạn mức nhà cung cấp</th></tr></thead><tbody>{keys.map((key) => { const config = settings.providerConfigs[key.env] || key.config; return <tr key={key.env}><td><b>{key.provider}</b><br /><span className="pill">{key.configured ? "Đã cấu hình" : "Chưa cấu hình"}</span></td><td><code>{key.env}</code></td><td>{key.freeDaily}</td><td>{key.freeMonthly}</td><td><input className="input" type="number" min="1" max="86400" aria-label={`Khoảng cách ${key.provider}`} value={config.delaySeconds} onChange={(e) => updateConfig(key.env, { delaySeconds: Number(e.target.value) })} /></td><td><input className="input" type="number" min="1" max="1000000" aria-label={`Hạn mức ngày ${key.provider}`} value={config.dailyLimit} onChange={(e) => updateConfig(key.env, { dailyLimit: Number(e.target.value) })} /></td><td><input className="input" aria-label={`Hạn mức nhà cung cấp ${key.provider}`} value={config.providerLimit} onChange={(e) => updateConfig(key.env, { providerLimit: e.target.value })} placeholder="Ví dụ: 100/ngày" /></td></tr>; })}</tbody></table></div>
      <div className="actions"><button className="button" type="submit">Lưu tất cả cấu hình provider</button></div>
    </form>
  </>;
}
