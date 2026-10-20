"use client";

import { useEffect, useState } from "react";

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

  async function load() {
    const response = await fetch("/api/campaigns");
    const data = await response.json();
    if (!response.ok) { setError(data.error || "Không thể tải danh sách campaign"); return; }
    setCampaigns(data.campaigns);
  }

  useEffect(() => { load().finally(() => setLoading(false)); }, []);

  async function refresh() {
    setRefreshing(true); setError("");
    await load();
    setRefreshing(false);
  }

  return <section className="panel campaign-list-panel"><div className="toolbar"><div><h2>Campaign đã tạo</h2><p className="sub">Danh sách 50 campaign mới nhất.</p></div><button className="button secondary refresh-button" type="button" onClick={refresh} disabled={refreshing} aria-label="Làm mới campaigns" title="Làm mới campaigns"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 0 0-14.7-4L4 9" /><path d="M4 4v5h5" /><path d="M4 13a8 8 0 0 0 14.7 4L20 15" /><path d="M20 20v-5h-5" /></svg>{refreshing ? "Đang tải…" : "Refresh"}</button></div>{error && <div className="notice error">{error}</div>}<div className="tablewrap"><table className="table"><thead><tr><th>Tên</th><th>Subject</th><th>Recipients</th><th>Trạng thái</th><th>Ngày tạo</th></tr></thead><tbody>{loading ? <tr><td colSpan={5}>Đang tải campaigns…</td></tr> : campaigns.length ? campaigns.map((campaign) => <tr key={campaign.id}><td><a href={`/admin/campaigns/${campaign.id}`}><b>{campaign.name}</b></a></td><td>{campaign.subject}</td><td><span className="pill">{campaign.recipientCount}</span></td><td><span className={`pill send-status-${campaign.sendStatus}`}>{statusLabel(campaign.sendStatus)}</span></td><td>{new Date(campaign.createdAt).toLocaleString("vi-VN")}</td></tr>) : <tr><td colSpan={5}>Chưa có campaign.</td></tr>}</tbody></table></div></section>;
}
