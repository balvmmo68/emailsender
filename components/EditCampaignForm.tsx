"use client";

import { useState } from "react";

export default function EditCampaignForm({ campaign }: { campaign: { id: string; name: string; subject: string; htmlContent: string; textContent: string } }) {
  const [form, setForm] = useState({ name: campaign.name, subject: campaign.subject, html: campaign.htmlContent, text: campaign.textContent });
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setMessage("");
    const response = await fetch(`/api/campaigns/${campaign.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    const data = await response.json();
    setMessage(response.ok ? "Đã lưu thay đổi." : data.error || "Không thể cập nhật campaign.");
    setBusy(false);
  }

  async function remove() {
    if (!window.confirm("Xóa campaign này và toàn bộ danh sách email đã import? Hành động này không thể hoàn tác.")) return;
    setBusy(true);
    const response = await fetch(`/api/campaigns/${campaign.id}`, { method: "DELETE" });
    if (response.ok) window.location.href = "/admin";
    else { const data = await response.json(); setMessage(data.error || "Không thể xóa campaign."); setBusy(false); }
  }

  return <section className="panel"><h2>Quản lý campaign</h2><form onSubmit={save}><div className="grid"><div className="field"><label>Tên campaign</label><input className="input" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div><div className="field"><label>Subject</label><input className="input" required value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} /></div></div><div className="split" style={{ marginTop: 18 }}><div className="field"><label>HTML</label><textarea className="textarea mono" value={form.html} onChange={e => setForm({ ...form, html: e.target.value })} /></div><div className="field"><label>Plain text</label><textarea className="textarea" value={form.text} onChange={e => setForm({ ...form, text: e.target.value })} /></div></div><div className="actions"><button className="button" disabled={busy}>{busy ? "Đang xử lý…" : "Lưu thay đổi"}</button><button className="button danger" type="button" disabled={busy} onClick={remove}>Xóa campaign</button></div></form>{message && <div className="notice" style={{ marginTop: 14 }}>{message}</div>}</section>;
}
