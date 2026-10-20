"use client";

import { useEffect, useState } from "react";

type ProviderStats = { env: string; name: string; dailyLimit: number; allowance: number; usedToday: number; remaining: number; campaignSent: number };
type ProviderStatus = {
  status: string;
  cursor: number;
  total: number;
  currentProviderEnv: string | null;
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
    void refresh();
    const refreshTimer = window.setInterval(refresh, 5000);
    const clockTimer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => { mounted = false; window.clearInterval(refreshTimer); window.clearInterval(clockTimer); };
  }, [campaignId]);

  if (error && !data) return <section className="panel"><h2>Hạn mức email/ngày</h2><div className="notice error">{error}</div></section>;
  if (!data) return <section className="panel"><h2>Hạn mức email/ngày</h2><p className="sub">Đang tải quota và provider…</p></section>;

  const currentProvider = data.providers.find((provider) => provider.env === data.currentProviderEnv);
  const pendingProvider = data.providers.find((provider) => provider.env === data.pendingProviderEnv);
  const secondsRemaining = data.providerSwitchAfter ? Math.max(0, Math.ceil((data.providerSwitchAfter - now) / 1000)) : 0;

  return <section className="panel campaign-provider-panel">
    <div className="campaign-provider-heading"><div><h2>Hạn mức email/ngày</h2><p className="sub">Cập nhật tự động mỗi 5 giây; số liệu dùng đúng hạn mức provider đã cấu hình.</p></div><span className="campaign-provider-live">Live</span></div>
    <div className="metricrow campaign-quota-metrics">
      <div className="metric"><span className="eyebrow">Hạn mức cấu hình/ngày</span><b>{numberFormat.format(data.dailyLimit)}</b></div>
      <div className="metric"><span className="eyebrow">Đã dùng hôm nay</span><b>{numberFormat.format(data.dailyUsed)}</b></div>
      <div className="metric"><span className="eyebrow">Quota còn khả dụng</span><b>{numberFormat.format(data.dailyRemaining)}</b></div>
    </div>
    <div className="campaign-current-provider">
      <span className="eyebrow">API provider đang chạy</span>
      <b>{currentProvider?.name || "Chưa gửi email"}</b>
      {currentProvider && <span>{numberFormat.format(currentProvider.campaignSent)} email đã gửi trong campaign này · còn {numberFormat.format(currentProvider.remaining)} quota hôm nay</span>}
    </div>
    {pendingProvider && <div className="notice campaign-provider-switch" role="status">Đang nghỉ {numberFormat.format(secondsRemaining)} giây trước khi chuyển sang {pendingProvider.name}.</div>}
    {data.providerFailureCount > 0 && <div className="notice campaign-provider-streak" role="status">{data.providerFailureCount >= 4 ? `${data.providers.find((provider) => provider.env === data.providerFailureEnv)?.name || data.providerFailureEnv} đã lỗi 4 recipient liên tiếp; campaign đang giữ các recipient để thử lại khi có provider khác khả dụng.` : `${data.providers.find((provider) => provider.env === data.providerFailureEnv)?.name || data.providerFailureEnv} đang có ${data.providerFailureCount}/4 recipient lỗi liên tiếp; nếu recipient tiếp theo cũng bị từ chối, hệ thống sẽ chờ 60 giây rồi đổi provider và thử lại nhóm lỗi.`}</div>}
    <div className="campaign-provider-grid">
      {data.providers.map((provider) => <div className={`campaign-provider-card ${provider.env === data.currentProviderEnv ? "is-current" : ""}`} key={provider.env}>
        <div className="campaign-provider-card-title"><b>{provider.name}</b>{provider.env === data.currentProviderEnv && <span className="pill">Đang chạy</span>}{provider.env === data.pendingProviderEnv && <span className="pill send-status-paused">Sắp chuyển</span>}</div>
        <p>Campaign: <b>{numberFormat.format(provider.campaignSent)}</b> đã gửi</p>
        <p>Hôm nay: {numberFormat.format(provider.usedToday)} / {numberFormat.format(provider.allowance)} · còn <b>{numberFormat.format(provider.remaining)}</b></p>
        <small>Hạn mức cấu hình: {numberFormat.format(provider.dailyLimit)}/ngày</small>
      </div>)}
      {!data.providers.length && <p className="sub">Chưa có API provider nào được cấu hình đầy đủ.</p>}
    </div>
    {error && <p className="campaign-provider-error">Không làm mới được dữ liệu: {error}</p>}
  </section>;
}
