"use client";

import { useEffect, useRef, useState } from "react";

type SendStatus = "draft" | "sending" | "paused" | "stopped" | "completed";

export default function CampaignSendControls({ campaignId, initialStatus, initialCursor, total }: { campaignId: string; initialStatus: SendStatus; initialCursor: number; total: number }) {
  const [status, setStatus] = useState<SendStatus>(initialStatus);
  const [cursor, setCursor] = useState(initialCursor);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const running = useRef(false);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); running.current = false; }, []);

  async function call(action: "start" | "pause" | "resume" | "stop" | "tick") {
    const response = await fetch(`/api/campaigns/${campaignId}/send`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Không thể điều khiển gửi campaign");
    setStatus(data.status); setCursor(data.cursor || 0); setError(data.error || "");
    return data as { status: SendStatus; cursor: number; provider?: string; recipient?: string; delayMs?: number; done?: boolean };
  }

  async function processQueue() {
    if (!running.current) return;
    try {
      const data = await call("tick");
      if (data.provider && data.recipient) setMessage(`Đã gửi ${data.recipient} qua ${data.provider}.`);
      if (data.status === "sending" && !data.done) timer.current = setTimeout(processQueue, Math.max(data.delayMs || 1000, 1000));
      else running.current = false;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gửi campaign thất bại");
      running.current = false;
    }
  }

  async function start(action: "start" | "resume") {
    setError(""); setMessage(""); running.current = true;
    try { await call(action); processQueue(); } catch (err) { running.current = false; setError(err instanceof Error ? err.message : "Không thể bắt đầu gửi"); }
  }

  async function pause() {
    running.current = false;
    if (timer.current) clearTimeout(timer.current);
    try { await call("pause"); setMessage("Đã tạm dừng. Có thể bấm Gửi tiếp để tiếp tục từ vị trí hiện tại."); } catch (err) { setError(err instanceof Error ? err.message : "Không thể tạm dừng"); }
  }

  async function stop() {
    running.current = false;
    if (timer.current) clearTimeout(timer.current);
    try { await call("stop"); setMessage("Đã dừng campaign."); } catch (err) { setError(err instanceof Error ? err.message : "Không thể dừng campaign"); }
  }

  const percent = total ? Math.min(100, Math.round((cursor / total) * 100)) : 0;
  return <section className="panel send-controls"><div className="send-controls-header"><div><h2>Gửi campaign</h2><p className="sub">Gửi tuần tự theo khoảng cách đã cấu hình, có thể tạm dừng và tiếp tục từ recipient hiện tại.</p></div><span className={`pill send-status-${status}`}>{status === "sending" ? "Đang gửi" : status === "paused" ? "Tạm dừng" : status === "stopped" ? "Đã dừng" : status === "completed" ? "Hoàn tất" : "Sẵn sàng"}</span></div><div className="send-progress"><div className="send-progress-bar" style={{ width: `${percent}%` }} /><span>{cursor} / {total} recipient ({percent}%)</span></div><div className="actions">{status === "sending" ? <button className="button secondary" type="button" onClick={pause}>Tạm dừng</button> : status === "paused" ? <button className="button" type="button" onClick={() => start("resume")}>Gửi tiếp</button> : status === "completed" ? null : <button className="button" type="button" onClick={() => start("start")}>Bắt đầu gửi</button>}{status !== "stopped" && status !== "completed" && <button className="button danger" type="button" onClick={stop}>Dừng</button>}</div>{message && <div className="notice" style={{ marginTop: 14 }}>{message}</div>}{error && <div className="notice error" style={{ marginTop: 14 }}>{error}</div>}</section>;
}
