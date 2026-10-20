"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const RESEND_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const dateTimeFormat = new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" });

export default function CampaignResendButton({ campaignId, campaignName, completedAt, lastResentAt }: {
  campaignId: string;
  campaignName: string;
  completedAt: number;
  lastResentAt: number | null;
}) {
  const router = useRouter();
  const [now, setNow] = useState(Date.now());
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const availableAt = Math.max(completedAt, lastResentAt || 0) + RESEND_COOLDOWN_MS;
  const remaining = Math.max(0, availableAt - now);
  const hours = Math.floor(remaining / 3_600_000);
  const minutes = Math.floor((remaining % 3_600_000) / 60_000);
  const seconds = Math.floor((remaining % 60_000) / 1000);

  async function createResend() {
    if (remaining > 0 || creating) return;
    if (!window.confirm(`Tạo một campaign mới từ “${campaignName}” với cùng nội dung và toàn bộ recipient? Campaign mới sẽ ở trạng thái nháp; bạn cần kiểm tra và bấm gửi riêng.`)) return;
    setCreating(true);
    setError("");
    try {
      const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/resend`, { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Không thể tạo campaign gửi lại.");
      router.push(`/admin/campaigns/${result.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể tạo campaign gửi lại.");
    } finally {
      setCreating(false);
    }
  }

  return <section className="panel campaign-resend-panel">
    <div>
      <h2>Gửi lại campaign</h2>
      {remaining > 0
        ? <p className="sub">Có thể tạo bản gửi lại sau: <b>{hours} giờ {minutes} phút {seconds} giây</b> · {dateTimeFormat.format(new Date(availableAt))}</p>
        : <p className="sub">Đã qua thời gian chờ 24 giờ. Có thể tạo một bản campaign mới với cùng nội dung và recipient.</p>}
      <small>Bản gốc và lịch sử gửi được giữ nguyên. Campaign mới ở trạng thái nháp và không tự gửi.</small>
    </div>
    <button className="button" type="button" disabled={remaining > 0 || creating} onClick={() => void createResend()}>{creating ? "Đang tạo…" : "Tạo campaign gửi lại"}</button>
    {error && <div className="notice error campaign-resend-error">{error}</div>}
  </section>;
}
