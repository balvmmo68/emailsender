"use client";

import { useState } from "react";
import CampaignListPanel from "@/components/CampaignListPanel";

export default function NewCampaign() {
  const [activeTab, setActiveTab] = useState<"new" | "list">("new");
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [html, setHtml] = useState("<p>Xin chào {{name}},</p>\n<p>Nội dung email của bạn.</p>");
  const [text, setText] = useState("Xin chào {{name}},\n\nNội dung email của bạn.");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setMsg("");
    const fd = new FormData(); fd.set("name", name); fd.set("subject", subject); fd.set("html", html); fd.set("text", text); if (file) fd.set("file", file);
    const res = await fetch("/api/campaigns", { method: "POST", body: fd });
    const data = await res.json();
    if (res.ok) location.href = `/admin/campaigns/${data.id}`; else setMsg(data.error || "Có lỗi xảy ra");
    setBusy(false);
  }

  return <><div className="eyebrow">New campaign</div><h1 className="title">Campaigns</h1><p className="sub">Tạo campaign mới hoặc xem lại các campaign đã tạo.</p><div className="settings-tabs campaign-tabs" role="tablist" aria-label="Campaign navigation"><button className={`settings-tab ${activeTab === "new" ? "active" : ""}`} type="button" role="tab" aria-selected={activeTab === "new"} onClick={() => setActiveTab("new")}>Tạo campaign</button><button className={`settings-tab ${activeTab === "list" ? "active" : ""}`} type="button" role="tab" aria-selected={activeTab === "list"} onClick={() => setActiveTab("list")}>Danh sách campaigns</button></div>{activeTab === "list" ? <CampaignListPanel /> : <form onSubmit={submit}><section className="panel"><h2>1. Thông tin</h2><div className="grid"><div className="field"><label>Tên campaign</label><input className="input" required value={name} onChange={e => setName(e.target.value)} placeholder="Ra mắt sản phẩm tháng 10" /></div><div className="field"><label>Subject</label><input className="input" required value={subject} onChange={e => setSubject(e.target.value)} placeholder="Xin chào {{name}}" /></div></div></section><section className="panel"><h2>2. Upload CSV</h2><div className="fileinput"><input type="file" accept=".csv,text/csv" required onChange={e => setFile(e.target.files?.[0] || null)} /><p className="sub" style={{ marginTop: 10, marginBottom: 0 }}>CSV tối đa 5MB. Hệ thống tự nhận diện cột email.</p></div></section><section className="panel"><h2>3. Soạn nội dung</h2><div className="split"><div className="field"><label>HTML</label><textarea className="textarea mono" value={html} onChange={e => setHtml(e.target.value)} /></div><div className="field"><label>Plain text</label><textarea className="textarea" value={text} onChange={e => setText(e.target.value)} /></div></div><p className="sub" style={{ marginTop: 12, marginBottom: 0 }}>Biến hỗ trợ ví dụ: <code>{"{{name}}"}</code>, <code>{"{{email}}"}</code>, hoặc tên cột CSV khác.</p></section>{msg && <div className="notice error">{msg}</div>}<div className="actions"><button className="button" disabled={busy}>{busy ? "Đang tạo…" : "Tạo campaign"}</button><a className="button secondary" href="/admin">Hủy</a></div></form>}</>;
}
