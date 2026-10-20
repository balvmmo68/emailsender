"use client";

import { useEffect, useRef, useState } from "react";

type SendStatus = "draft" | "sending" | "paused" | "stopped" | "completed";
type UnknownRecipient = { id: string; email: string; providerEnv: string | null };
const providerLabels: Record<string, string> = { RESEND_API_KEY: "Resend", BREVO_API_KEY: "Brevo", MAILJET_API_KEY: "Mailjet", MAILTRAP_API_TOKEN: "Mailtrap", MAILGUN_API_KEY: "Mailgun", POSTMARK_SERVER_TOKEN: "Postmark", MAILERSEND_API_TOKEN: "MailerSend", SMTP2GO_API_KEY: "SMTP2GO", MAILOFLY_API_KEY: "Mailofly", AGENTMAIL_API_KEY: "AgentMail" };

export default function CampaignSendControls({ campaignId, initialStatus, initialCursor, total }: { campaignId: string; initialStatus: SendStatus; initialCursor: number; total: number }) {
  const [status, setStatus] = useState<SendStatus>(initialStatus);
  const [cursor, setCursor] = useState(initialCursor);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [unknownRecipient, setUnknownRecipient] = useState<UnknownRecipient | null>(null);
  const [resolvingUnknown, setResolvingUnknown] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const running = useRef(false);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); running.current = false; }, []);

  async function call(action: "start" | "pause" | "resume" | "stop" | "tick") {
    const response = await fetch(`/api/campaigns/${campaignId}/send`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
    const data = await response.json();
    setUnknownRecipient(data.unknownRecipient || null);
    if (data.status) setStatus(data.status);
    if (typeof data.cursor === "number") setCursor(data.cursor);
    setError(data.error || "");
    if (!response.ok) throw new Error(data.error || "Không thể điều khiển gửi campaign");
    setStatus(data.status); setCursor(data.cursor || 0);
    return data as { status: SendStatus; cursor: number; provider?: string; recipient?: string; busyRecipient?: string; delayMs?: number; done?: boolean; providerSwitch?: { from: string | null; to: string; remainingMs: number; failureCount?: number; failureDetail?: string }; providerFailure?: { provider: string; count: number; threshold: number; recipient: string; detail?: string } };
  }

  async function resolveUnknown(resolution: "sent" | "retry") {
    if (!unknownRecipient || resolvingUnknown) return;
    const warning = resolution === "sent"
      ? `Xác nhận ${unknownRecipient.email} đã được gửi thành công? Chỉ chọn nếu bạn đã đối soát với provider.`
      : `Thử gửi lại ${unknownRecipient.email}? Nếu provider đã nhận lần gửi trước, người nhận có thể nhận email trùng.`;
    if (!window.confirm(warning)) return;
    setResolvingUnknown(true);
    setError("");
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resolve-unknown", resolution }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Không thể đối soát recipient.");
      setStatus(data.status);
      if (typeof data.cursor === "number") setCursor(data.cursor);
      setUnknownRecipient(null);
      setError("");
      setMessage(resolution === "sent"
        ? `Đã đánh dấu ${data.resolvedRecipient || unknownRecipient.email} là đã gửi và bỏ qua khi tiếp tục.`
        : `${data.resolvedRecipient || unknownRecipient.email} đã được đưa về trạng thái chờ gửi lại. Bấm “Gửi tiếp” để gửi qua provider đã chọn.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể đối soát recipient.");
    } finally {
      setResolvingUnknown(false);
    }
  }

  async function processQueue() {
    if (!running.current) return;
    try {
      const data = await call("tick");
      if (data.providerSwitch) setMessage(data.providerSwitch.failureCount
        ? `${providerLabels[data.providerSwitch.from || ""] || data.providerSwitch.from} lỗi ${data.providerSwitch.failureCount} recipient liên tiếp. Lỗi gần nhất: ${data.providerSwitch.failureDetail || "không có chi tiết"}. Tạm nghỉ ${Math.ceil(data.providerSwitch.remainingMs / 1000)} giây rồi chuyển sang ${providerLabels[data.providerSwitch.to] || data.providerSwitch.to}; nhóm lỗi sẽ được thử lại trước.`
        : `Tạm nghỉ ${Math.ceil(data.providerSwitch.remainingMs / 1000)} giây trước khi chuyển sang ${providerLabels[data.providerSwitch.to] || data.providerSwitch.to}.`);
      else if (data.busyRecipient) setMessage(`Recipient ${data.busyRecipient} đang được xử lý ở một tab khác; sẽ kiểm tra lại tự động.`);
      else if (data.providerFailure) setMessage(`${providerLabels[data.providerFailure.provider] || data.providerFailure.provider} bị từ chối recipient ${data.providerFailure.recipient} (${data.providerFailure.count}/${data.providerFailure.threshold}). Lỗi: ${data.providerFailure.detail || "không có chi tiết"}. Campaign tiếp tục theo chính sách failover.`);
      else if (data.provider && data.recipient) setMessage(`Đã gửi ${data.recipient} qua ${providerLabels[data.provider] || data.provider}.`);
      if (data.status === "sending" && !data.done) timer.current = setTimeout(processQueue, Math.max(data.delayMs || 1000, 1000));
      else running.current = false;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gửi campaign thất bại");
      running.current = false;
    }
  }

  async function start(action: "start" | "resume") {
    setError(""); setMessage(""); running.current = true;
    try { const data = await call(action); if (data.delayMs) timer.current = setTimeout(processQueue, Math.max(data.delayMs, 1000)); else processQueue(); } catch (err) { running.current = false; setError(err instanceof Error ? err.message : "Không thể bắt đầu gửi"); }
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

  useEffect(() => {
    if (initialStatus === "sending" && !running.current) {
      running.current = true;
      void processQueue();
    }
  }, []);

  const percent = total ? Math.min(100, Math.round((cursor / total) * 100)) : 0;
  return <section className="panel send-controls">
    <div className="send-controls-header"><div><h2>Gửi campaign</h2><p className="sub">Gửi tuần tự theo khoảng cách đã cấu hình. Khi provider được chọn thủ công, campaign không tự failover sang provider khác.</p></div><span className={`pill send-status-${status}`}>{status === "sending" ? "Đang gửi" : status === "paused" ? "Tạm dừng" : status === "stopped" ? "Đã dừng" : status === "completed" ? "Hoàn tất" : "Sẵn sàng"}</span></div>
    <div className="send-progress"><div className="send-progress-bar" style={{ width: `${percent}%` }} /><span>{cursor} / {total} recipient ({percent}%)</span></div>
    <div className="actions">{status === "sending" ? <button className="button secondary" type="button" onClick={pause}>Tạm dừng</button> : status === "paused" ? <button className="button" type="button" onClick={() => start("resume")}>Gửi tiếp</button> : status === "completed" ? null : <button className="button" type="button" onClick={() => start("start")}>Bắt đầu gửi</button>}{status !== "stopped" && status !== "completed" && <button className="button danger" type="button" onClick={stop}>Dừng</button>}</div>
    {message && <div className="notice" style={{ marginTop: 14 }}>{message}</div>}
    {error && <div className="notice error" style={{ marginTop: 14 }}>{error}</div>}
    {unknownRecipient && <div className="unknown-recipient-panel">
      <b>Recipient cần đối soát: {unknownRecipient.email}</b>
      <p>Kết quả gửi chưa xác định{unknownRecipient.providerEnv ? ` từ ${providerLabels[unknownRecipient.providerEnv] || unknownRecipient.providerEnv}` : ""}. Hãy kiểm tra lịch sử gửi của provider trước khi chọn. “Đã gửi” sẽ bỏ qua recipient; “Gửi lại” có thể tạo email trùng nếu provider đã nhận lần trước.</p>
      <div className="actions">
        <button className="button secondary" type="button" disabled={resolvingUnknown} onClick={() => void resolveUnknown("sent")}>{resolvingUnknown ? "Đang xử lý…" : "Đã gửi — bỏ qua"}</button>
        <button className="button danger" type="button" disabled={resolvingUnknown} onClick={() => void resolveUnknown("retry")}>{resolvingUnknown ? "Đang xử lý…" : "Chưa gửi — thử lại"}</button>
      </div>
    </div>}
  </section>;
}
