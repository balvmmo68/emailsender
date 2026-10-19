"use client";

import { FormEvent, useEffect, useState } from "react";
import ProviderLogsPanel from "@/components/ProviderLogsPanel";

type ProviderConfig = { delaySeconds: number; dailyLimit: number; providerLimit: string };
type KeyInfo = { provider: string; url: string; env: string; configured: boolean; freeDaily: string; freeMonthly: string; config: ProviderConfig; usedToday: number; rotationThreshold: number };
type Settings = { activeProvider: string; testRecipient: string; providerConfigs: Record<string, ProviderConfig> };

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings>({ activeProvider: "RESEND_API_KEY", testRecipient: "", providerConfigs: {} });
  const [keys, setKeys] = useState<KeyInfo[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<KeyInfo | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [testing, setTesting] = useState("");
  const [sending, setSending] = useState("");
  const [activeTab, setActiveTab] = useState<"settings" | "logs">("settings");

  useEffect(() => {
    fetch("/api/settings").then(async (res) => {
      if (!res.ok) throw new Error("Không thể tải cấu hình");
      const data = await res.json(); setSettings(data.settings); setKeys(data.keys);
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
    if (!settings.testRecipient) { setError("Nhập email nhận test và lưu cấu hình trước khi gửi."); return; }
    setSending(env); setMessage(""); setError("");
    const response = await fetch("/api/settings/send-test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ env, to: settings.testRecipient }) });
    const data = await response.json();
    if (response.ok) setMessage(`Đã gửi email test qua ${env} tới ${data.to}. Message ID: ${data.id || "ok"}`); else setError(data.error || "Gửi email test thất bại");
    setSending("");
  }

  return <>
    <div className="eyebrow">System settings</div><h1 className="title">Cấu hình gửi email theo dịch vụ</h1><p className="sub">Mỗi API provider có bộ cấu hình riêng, không dùng chung khoảng cách gửi hoặc hạn mức/ngày.</p>
    <div className="settings-tabs" role="tablist" aria-label="Settings navigation"><button className={`settings-tab ${activeTab === "settings" ? "active" : ""}`} type="button" role="tab" aria-selected={activeTab === "settings"} onClick={() => setActiveTab("settings")}>Cấu hình provider</button><button className={`settings-tab ${activeTab === "logs" ? "active" : ""}`} type="button" role="tab" aria-selected={activeTab === "logs"} onClick={() => setActiveTab("logs")}>Logs lỗi</button></div>
    {activeTab === "logs" ? <ProviderLogsPanel /> : <>
      {message && <div className="notice">{message}</div>}{error && <div className="notice error">{error}</div>}
      <form className="panel settings-panel" onSubmit={save}>
        <h2>Cấu hình từng dịch vụ</h2><div className="notice">Bảng chính chỉ hiển thị thông tin thao tác nhanh. Bấm “Cài đặt” trong từng provider để xem hạn mức free, usage và chỉnh delay/hạn mức riêng.</div>
        <div className="field settings-test-recipient"><label htmlFor="testRecipient">Email nhận test</label><input className="input" id="testRecipient" type="email" value={settings.testRecipient} onChange={(e) => setSettings({ ...settings, testRecipient: e.target.value })} placeholder="you@example.com" /><small>Nhập email rồi bấm “Lưu tất cả cấu hình provider”.</small></div>
        <div className="tablewrap settings-tablewrap"><table className="table settings-table"><thead><tr><th>Nhà cung cấp</th><th>API key</th><th>Test API</th><th>Gửi email test</th></tr></thead><tbody>{keys.map((key) => <tr key={key.env}>
          <td data-label="Nhà cung cấp"><a href={key.url} target="_blank" rel="noreferrer" title={`Mở website ${key.provider}`}><b>{key.provider}</b></a><br /><span className={`pill ${!key.configured ? "pill-danger" : ""}`}>{key.configured ? "Đã cấu hình" : "Chưa cấu hình"}</span><button className="provider-settings-link" type="button" onClick={() => setSelectedProvider(key)}>Cài đặt</button></td>
          <td data-label="API key"><code>{key.env}</code></td>
          <td data-label="Test API"><button className="button secondary" type="button" disabled={!key.configured || testing === key.env} onClick={() => testApi(key.env)}>{testing === key.env ? "Đang test…" : "Test API"}</button></td>
          <td data-label="Gửi email test"><button className="button secondary" type="button" disabled={!key.configured || !settings.testRecipient || sending === key.env} onClick={() => sendProviderTest(key.env)}>{sending === key.env ? "Đang gửi…" : "Gửi test"}</button></td>
        </tr>)}</tbody></table></div>
        <div className="actions"><button className="button" type="submit">Lưu tất cả cấu hình provider</button></div>
      </form>
      {selectedProvider && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedProvider(null); }}><section className="provider-modal" role="dialog" aria-modal="true" aria-labelledby="provider-modal-title"><div className="provider-modal-header"><div><div className="eyebrow">Provider settings</div><h2 id="provider-modal-title">{selectedProvider.provider}</h2></div><button className="modal-close" type="button" aria-label="Đóng popup" onClick={() => setSelectedProvider(null)}>×</button></div><div className="provider-meta"><span>Free/ngày: <b>{selectedProvider.freeDaily}</b></span><span>Free/tháng: <b>{selectedProvider.freeMonthly}</b></span><span>Đã dùng hôm nay: <b>{selectedProvider.usedToday}</b></span><span>Ngưỡng xoay 90%: <b>{selectedProvider.rotationThreshold}</b></span></div><div className="grid"><div className="field"><label>Khoảng cách giữa 2 email (giây)</label><input className="input" type="number" min="1" max="86400" value={(settings.providerConfigs[selectedProvider.env] || selectedProvider.config).delaySeconds} onChange={(e) => updateConfig(selectedProvider.env, { delaySeconds: Number(e.target.value) })} /></div><div className="field"><label>Tối đa email/ngày</label><input className="input" type="number" min="1" max="1000000" value={(settings.providerConfigs[selectedProvider.env] || selectedProvider.config).dailyLimit} onChange={(e) => updateConfig(selectedProvider.env, { dailyLimit: Number(e.target.value) })} /></div></div><div className="field" style={{ marginTop: 16 }}><label>Hạn mức nhà cung cấp tùy chỉnh</label><input className="input" value={(settings.providerConfigs[selectedProvider.env] || selectedProvider.config).providerLimit} onChange={(e) => updateConfig(selectedProvider.env, { providerLimit: e.target.value })} placeholder="Ví dụ: 100 email/ngày" /></div><div className="actions"><button className="button" type="button" onClick={() => setSelectedProvider(null)}>Xong</button><button className="button secondary" type="button" onClick={() => { setSelectedProvider(null); document.querySelector<HTMLFormElement>(".settings-panel")?.requestSubmit(); }}>Lưu và đóng</button></div></section></div>}
    </>}
  </>;
}
