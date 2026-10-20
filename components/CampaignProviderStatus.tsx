"use client";

import { useEffect, useState } from "react";

type ProviderStats = { env: string; name: string; dailyLimit: number; allowance: number; usedToday: number; remaining: number; campaignSent: number };
type ProviderStatus = {
  status: string;
  cursor: number;
  total: number;
  currentProviderEnv: string | null;
  disabledCurrentProviderEnv: string | null;
  selectedProviderEnv: string | null;
  pendingProviderEnv: string | null;
  providerSwitchAfter: number | null;
  providerFailureEnv: string | null;
  providerFailureCount: number;
  dailyLimit: number;
  dailyAllowance: number;
  dailyUsed: number;
  dailyRemaining: number;
  providers: ProviderStats[];
};
const numberFormat = new Intl.NumberFormat("vi-VN");

export default function CampaignProviderStatus({ campaignId }: { campaignId: string }) {
  const [data, setData] = useState<ProviderStatus | null>(null);
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());
  const [savingProvider, setSavingProvider] = useState(false);
  const [providerMessage, setProviderMessage] = useState("");

  useEffect(() => {
    let mounted = true;
    const refresh = async () => {
      try {
        const response = await fetch(`/api/campaigns/${campaignId}/send`, { cache: "no-store" });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Không tải được hạn mức provider.");
        if (mounted) { setData(body as ProviderStatus); setError(""); }
      } catch (err) {
        if (mounted) setError(err instanceof Error ? err.message : "Không tải được hạn mức provider.");
      }
    };
    const onSettingsChanged = (event: StorageEvent) => {
      if (event.key === "sender:provider-settings-updated") void refresh();
    };
    void refresh();
    window.addEventListener("storage", onSettingsChanged);
    const refreshTimer = window.setInterval(refresh, 5000);
    const clockTimer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => { mounted = false; window.removeEventListener("storage", onSettingsChanged); window.clearInterval(refreshTimer); window.clearInterval(clockTimer); };
  }, [campaignId]);

  async function selectProvider(providerEnv: string | null) {
    if (!data || savingProvider) return;
    setSavingProvider(true);
    setProviderMessage("");
    setError("");
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "select-provider", providerEnv }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Không thể lưu provider đã chọn.");
      setData((current) => current ? { ...current, selectedProviderEnv: body.selectedProviderEnv ?? null } : current);
      setProviderMessage(providerEnv ? "Đã lưu provider. Campaign chỉ gửi qua provider này; không tự chuyển sang provider khác." : "Đã bật chế độ tự động chọn provider.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể lưu provider đã chọn.");
    } finally {
      setSavingProvider(false);
    }
  }

  if (error && !data) return <section className="panel"><h2>Hạn mức email/ngày</h2><div className="notice error">{error}</div></section>;
  if (!data) return <section className="panel"><h2>Hạn mức email/ngày</h2><p className="sub">Đang tải quota và provider…</p></section>;

  const currentProvider = data.providers.find((provider) => provider.env === data.currentProviderEnv);
  const selectedProvider = data.providers.find((provider) => provider.env === data.selectedProviderEnv);
  const pendingProvider = data.providers.find((provider) => provider.env === data.pendingProviderEnv);
  const secondsRemaining = data.providerSwitchAfter ? Math.max(0, Math.ceil((data.providerSwitchAfter - now) / 1000)) : 0;
  const canChangeProvider = data.status !== "sending";

  return <section className="panel campaign-provider-panel">
    <div className="campaign-provider-heading"><div><h2>Hạn mức email/ngày</h2><p className="sub">Cập nhật tự động mỗi 5 giây; số liệu dùng đúng hạn mức provider đã cấu hình.</p></div><span className="campaign-provider-live">Live</span></div>
    <div className="metricrow campaign-quota-metrics">
      <div className="metric"><span className="eyebrow">Hạn mức cấu hình/ngày</span><b>{numberFormat.format(data.dailyLimit)}</b></div>
      <div className="metric"><span className="eyebrow">Đã dùng hôm nay</span><b>{numberFormat.format(data.dailyUsed)}</b></div>
      <div className="metric"><span className="eyebrow">Quota còn khả dụng</span><b>{numberFormat.format(data.dailyRemaining)}</b></div>
    </div>
    <div className="campaign-current-provider">
      <span className="eyebrow">API provider đang chạy</span>
      <b>{currentProvider?.name || (data.disabledCurrentProviderEnv ? `${data.disabledCurrentProviderEnv} đã tắt` : "Chưa gửi email")}</b>
      {currentProvider && <span>{numberFormat.format(currentProvider.campaignSent)} email đã gửi trong campaign này · còn {numberFormat.format(currentProvider.remaining)} quota hôm nay</span>}
      {!currentProvider && data.disabledCurrentProviderEnv && <span>Provider đã dùng trước đó hiện bị tắt hoặc không khả dụng.</span>}
      <div className="campaign-provider-selection" role="radiogroup" aria-label="Chọn API provider cho campaign">
        <p className="sub">Chọn một provider để chỉ gửi qua API đó. Nếu provider hết quota hoặc không khả dụng, campaign sẽ dừng thay vì tự chuyển provider.</p>
        <label className="campaign-provider-option">
          <input type="radio" name={`provider-${campaignId}`} value="auto" checked={!data.selectedProviderEnv} disabled={!canChangeProvider || savingProvider} onChange={() => void selectProvider(null)} />
          <span>Tự động chọn provider khả dụng</span>
        </label>
        {data.providers.map((provider) => <label className="campaign-provider-option" key={provider.env}>
          <input type="radio" name={`provider-${campaignId}`} value={provider.env} checked={data.selectedProviderEnv === provider.env} disabled={!canChangeProvider || savingProvider} onChange={() => void selectProvider(provider.env)} />
          <span>{provider.name}{provider.env === data.currentProviderEnv ? " · đang chạy" : ""}</span>
        </label>)}
        {data.selectedProviderEnv && !selectedProvider && <div className="notice error">Provider đã chọn ({data.selectedProviderEnv}) hiện chưa được cấu hình hoặc đã bị tắt. Hãy bật lại provider hoặc chọn provider khác trước khi gửi.</div>}
        {!canChangeProvider && <small>Tạm dừng campaign trước khi thay đổi provider.</small>}
        {savingProvider && <small>Đang lưu lựa chọn…</small>}
        {providerMessage && <small role="status">{providerMessage}</small>}
      </div>
    </div>
    {pendingProvider && <div className="notice campaign-provider-switch" role="status">Đang nghỉ {numberFormat.format(secondsRemaining)} giây trước khi chuyển sang {pendingProvider.name}.</div>}
    {data.providerFailureCount > 0 && <div className="notice campaign-provider-streak" role="status">{data.selectedProviderEnv ? `${data.providers.find((provider) => provider.env === data.providerFailureEnv)?.name || data.providerFailureEnv} đang có ${data.providerFailureCount}/4 recipient lỗi liên tiếp. Chế độ chọn thủ công không tự failover; campaign sẽ giữ recipient lại nếu tiếp tục lỗi.` : data.providerFailureCount >= 4 ? `${data.providers.find((provider) => provider.env === data.providerFailureEnv)?.name || data.providerFailureEnv} đã lỗi 4 recipient liên tiếp; campaign đang giữ các recipient để thử lại khi có provider khác khả dụng.` : `${data.providers.find((provider) => provider.env === data.providerFailureEnv)?.name || data.providerFailureEnv} đang có ${data.providerFailureCount}/4 recipient lỗi liên tiếp; nếu recipient tiếp theo cũng bị từ chối, hệ thống sẽ chờ 60 giây rồi đổi provider và thử lại nhóm lỗi.`}</div>}
    <div className="campaign-provider-grid">
      {data.providers.map((provider) => <div className={`campaign-provider-card ${provider.env === data.currentProviderEnv ? "is-current" : ""}`} key={provider.env}>
        <div className="campaign-provider-card-title"><b>{provider.name}</b>{provider.env === data.currentProviderEnv && <span className="pill">Đang chạy</span>}{provider.env === data.pendingProviderEnv && <span className="pill send-status-paused">Sắp chuyển</span>}{provider.env === data.selectedProviderEnv && <span className="pill">Đã chọn thủ công</span>}</div>
        <p>Campaign: <b>{numberFormat.format(provider.campaignSent)}</b> đã gửi</p>
        <p>Hôm nay: {numberFormat.format(provider.usedToday)} / {numberFormat.format(provider.allowance)} · còn <b>{numberFormat.format(provider.remaining)}</b></p>
        <small>Hạn mức cấu hình: {numberFormat.format(provider.dailyLimit)}/ngày</small>
      </div>)}
      {!data.providers.length && <p className="sub">Chưa có API provider nào được cấu hình đầy đủ.</p>}
    </div>
    {error && <p className="campaign-provider-error">{error}</p>}
  </section>;
}
