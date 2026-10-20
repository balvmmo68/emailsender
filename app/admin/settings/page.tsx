"use client";

import { FormEvent, useEffect, useState } from "react";
import ProviderLogsPanel from "@/components/ProviderLogsPanel";
import RefreshButton from "@/components/RefreshButton";

type ProviderConfig = { delaySeconds: number; dailyLimit: number; providerLimit: string; enabled: boolean };
type KeyInfo = { provider: string; url: string; env: string; configured: boolean; missingVariables?: string[]; freeDaily: string; freeMonthly: string; config: ProviderConfig; usedToday: number; rotationThreshold: number };
type Settings = { activeProvider: string; testRecipient: string; providerConfigs: Record<string, ProviderConfig> };

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings>({ activeProvider: "RESEND_API_KEY", testRecipient: "", providerConfigs: {} });
  const [keys, setKeys] = useState<KeyInfo[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<KeyInfo | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [testing, setTesting] = useState("");
  const [sending, setSending] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<"settings" | "logs">("settings");

  async function loadSettings(forceRefresh = false) {
    if (!forceRefresh) {
      try {
        const cached = sessionStorage.getItem("sender:settings");
        if (cached) {
          const data = JSON.parse(cached);
          setSettings(data.settings);
          setKeys(data.keys);
          return;
        }
      } catch { /* Ignore invalid or unavailable browser cache. */ }
    }
    setRefreshing(true);
    setError("");
    try {
      const response = await fetch("/api/settings", { cache: "no-store" });
      if (!response.ok) throw new Error("Không thể tải cấu hình");
      const data = await response.json();
      setSettings(data.settings);
      setKeys(data.keys);
      try { sessionStorage.setItem("sender:settings", JSON.stringify(data)); } catch { /* Cache is optional. */ }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể tải cấu hình");
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => { void loadSettings(); }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setMessage(""); setError("");
    const res = await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(settings) });
    const data = await res.json();
    if (!res.ok) { setError(data.error || "Không thể lưu cấu hình"); return; }
    try { sessionStorage.setItem("sender:settings", JSON.stringify({ settings, keys })); } catch { /* Cache is optional. */ }
    setMessage("Đã lưu cấu hình và trạng thái bật/tắt cho từng provider.");
  }

  function updateConfig(env: string, patch: Partial<ProviderConfig>) {
    setSettings({ ...settings, providerConfigs: { ...settings.providerConfigs, [env]: { ...settings.providerConfigs[env], ...patch } } });
  }

  function providerEnabled(env: string) {
    return settings.providerConfigs[env]?.enabled !== false;
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
    {activeTab === "settings" && <div className="toolbar"><span className="sub" style={{ margin: 0 }}>Dữ liệu được giữ trong phiên; nhấn refresh để lấy cấu hình mới nhất.</span><RefreshButton label="cấu hình Settings" refreshing={refreshing} onClick={() => void loadSettings(true)} /></div>}
    {activeTab === "logs" ? <ProviderLogsPanel /> : <>
      {message && <div className="notice">{message}</div>}{error && <div className="notice error">{error}</div>}
      <form className="panel settings-panel" onSubmit={save}>
        <h2>Cấu hình từng dịch vụ</h2><div className="notice">Bật/tắt API provider tại từng dòng. Provider bị tắt sẽ không được chọn để gửi campaign hoặc email test. Bấm “Lưu tất cả cấu hình provider” để áp dụng thay đổi. Bấm “Cài đặt” để chỉnh delay/hạn mức riêng.</div>
        <div className="field settings-test-recipient"><label htmlFor="testRecipient">Email nhận test</label><input className="input" id="testRecipient" type="email" value={settings.testRecipient} onChange={(e) => setSettings({ ...settings, testRecipient: e.target.value })} placeholder="you@example.com" /><small>Nhập email rồi bấm “Lưu tất cả cấu hình provider”.</small></div>
        <div className="tablewrap settings-tablewrap"><table className="table settings-table"><thead><tr><th>Nhà cung cấp</th><th>API key</th><th>Trạng thái API</th><th>Test API</th><th>Gửi email test</th></tr></thead><tbody>{keys.map((key) => <tr key={key.env}>
          <td data-label="Nhà cung cấp"><a href={key.url} target="_blank" rel="noreferrer" title={`Mở website ${key.provider}`}><b>{key.provider}</b></a><br /><span className={`pill ${!key.configured ? "pill-danger" : ""}`}>{key.configured ? "Đã cấu hình" : key.missingVariables?.length ? `Thiếu ${key.missingVariables.join(", ")}` : "Chưa cấu hình"}</span><button className="provider-settings-link" type="button" onClick={() => setSelectedProvider(key)}>Cài đặt</button></td>
          <td data-label="API key"><code>{key.env}</code></td>
          <td data-label="Trạng thái API"><button className={`provider-toggle ${providerEnabled(key.env) ? "is-enabled" : "is-disabled"}`} type="button" role="switch" aria-checked={providerEnabled(key.env)} aria-label={`${providerEnabled(key.env) ? "Tắt" : "Bật"} ${key.provider}`} onClick={() => updateConfig(key.env, { enabled: !providerEnabled(key.env) })}><span className="provider-toggle-track"><span className="provider-toggle-thumb" /></span><span>{providerEnabled(key.env) ? "Bật" : "Tắt"}</span></button></td>
          <td data-label="Test API"><button className="button secondary" type="button" disabled={!key.configured || testing === key.env} onClick={() => testApi(key.env)}>{testing === key.env ? "Đang test…" : "Test API"}</button></td>
          <td data-label="Gửi email test"><button className="button secondary" type="button" disabled={!key.configured || !providerEnabled(key.env) || !settings.testRecipient || sending === key.env} onClick={() => sendProviderTest(key.env)}>{sending === key.env ? "Đang gửi…" : "Gửi test"}</button></td>
        </tr>)}</tbody></table></div>
        <div className="actions"><button className="button" type="submit">Lưu tất cả cấu hình provider</button></div>
      </form>
      {selectedProvider && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedProvider(null); }}><section className="provider-modal" role="dialog" aria-modal="true" aria-labelledby="provider-modal-title"><div className="provider-modal-header"><div><div className="eyebrow">Provider settings</div><h2 id="provider-modal-title">{selectedProvider.provider}</h2></div><button className="modal-close" type="button" aria-label="Đóng popup" onClick={() => setSelectedProvider(null)}>×</button></div><div className="provider-meta"><span>Free/ngày: <b>{selectedProvider.freeDaily}</b></span><span>Free/tháng: <b>{selectedProvider.freeMonthly}</b></span><span>Đã dùng hôm nay: <b>{selectedProvider.usedToday}</b></span><span>Ngưỡng xoay theo cấu hình: <b>{selectedProvider.rotationThreshold}</b></span></div><div className="grid"><div className="field"><label>Khoảng cách giữa 2 email (giây)</label><input className="input" type="number" min="1" max="86400" value={(settings.providerConfigs[selectedProvider.env] || selectedProvider.config).delaySeconds} onChange={(e) => updateConfig(selectedProvider.env, { delaySeconds: Number(e.target.value) })} /></div><div className="field"><label>Tối đa email/ngày</label><input className="input" type="number" min="1" max="1000000" value={(settings.providerConfigs[selectedProvider.env] || selectedProvider.config).dailyLimit} onChange={(e) => updateConfig(selectedProvider.env, { dailyLimit: Number(e.target.value) })} /></div></div><div className="field" style={{ marginTop: 16 }}><label>Hạn mức nhà cung cấp tùy chỉnh</label><input className="input" value={(settings.providerConfigs[selectedProvider.env] || selectedProvider.config).providerLimit} onChange={(e) => updateConfig(selectedProvider.env, { providerLimit: e.target.value })} placeholder="Ví dụ: 100 email/ngày" /></div><div className="actions"><button className="button" type="button" onClick={() => setSelectedProvider(null)}>Xong</button><button className="button secondary" type="button" onClick={() => { setSelectedProvider(null); document.querySelector<HTMLFormElement>(".settings-panel")?.requestSubmit(); }}>Lưu và đóng</button></div></section></div>}
    </>}
  </>;
}
