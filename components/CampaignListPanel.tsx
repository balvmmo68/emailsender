"use client";

import { useEffect, useState } from "react";
import RefreshButton from "@/components/RefreshButton";

type Campaign = { id: string; name: string; subject: string; recipientCount: number; sendStatus: string; createdAt: number };

function statusLabel(status: string) {
  if (status === "sending") return "Đang gửi";
  if (status === "paused") return "Tạm dừng";
  if (status === "completed") return "Hoàn tất";
  if (status === "stopped") return "Đã dừng";
  return "Sẵn sàng";
}

export default function CampaignListPanel() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  async function load(forceRefresh = false) {
    if (!forceRefresh) {
      try {
        const cached = sessionStorage.getItem("sender:campaign-dashboard");
        if (cached) { setCampaigns(JSON.parse(cached) as Campaign[]); return; }
      } catch { /* Ignore invalid or unavailable browser cache. */ }
    }
    const response = await fetch("/api/campaigns", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) { setError(data.error || "Không thể tải danh sách campaign"); return; }
    setCampaigns(data.campaigns);
    try { sessionStorage.setItem("sender:campaign-dashboard", JSON.stringify(data.campaigns)); } catch { /* Cache is optional. */ }
  }

  useEffect(() => { load().finally(() => setLoading(false)); }, []);

  async function refresh() {
    setRefreshing(true); setError("");
    try { await load(true); } finally { setRefreshing(false); }
  }

  return <section className="panel campaign-list-panel"><div className="toolbar"><div><h2>Campaign đã tạo</h2><p className="sub">Danh sách 50 campaign mới nhất.</p></div><RefreshButton label="campaigns" refreshing={refreshing} onClick={refresh} /></div>{error && <div className="notice error">{error}</div>}<div className="tablewrap"><table className="table"><thead><tr><th>Tên</th><th>Subject</th><th>Recipients</th><th>Trạng thái</th><th>Ngày tạo</th></tr></thead><tbody>{loading ? <tr><td colSpan={5}>Đang tải campaigns…</td></tr> : campaigns.length ? campaigns.map((campaign) => <tr key={campaign.id}><td><a href={`/admin/campaigns/${campaign.id}`}><b>{campaign.name}</b></a></td><td>{campaign.subject}</td><td><span className="pill">{campaign.recipientCount}</span></td><td><span className={`pill send-status-${campaign.sendStatus}`}>{statusLabel(campaign.sendStatus)}</span></td><td>{new Date(campaign.createdAt).toLocaleString("vi-VN")}</td></tr>) : <tr><td colSpan={5}>Chưa có campaign.</td></tr>}</tbody></table></div></section>;
}
