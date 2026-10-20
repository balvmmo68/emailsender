"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import RefreshButton from "@/components/RefreshButton";

type CampaignRow = {
  id: string;
  name: string;
  subject: string;
  recipientCount: number;
  sendStatus: string;
  createdAt: number;
};
type CampaignListResponse = { campaigns: CampaignRow[]; page: number; pageSize: number; total: number; totalPages: number };
const numberFormat = new Intl.NumberFormat("vi-VN");
const CAMPAIGN_CACHE_PREFIX = "sender:campaign-list:";

function clearCampaignCache() {
  try {
    sessionStorage.removeItem("sender:campaign-dashboard");
    for (let index = sessionStorage.length - 1; index >= 0; index -= 1) {
      const key = sessionStorage.key(index);
      if (key?.startsWith(CAMPAIGN_CACHE_PREFIX)) sessionStorage.removeItem(key);
    }
  } catch { /* Session storage may be unavailable in restricted browsers. */ }
}

export default function NewCampaign() {
  const [activeTab, setActiveTab] = useState<"create" | "list">("create");
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [html, setHtml] = useState("<p>Xin chào {{name}},</p>\n<p>Nội dung email của bạn.</p>");
  const [text, setText] = useState("Xin chào {{name}},\n\nNội dung email của bạn.");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [listData, setListData] = useState<CampaignListResponse | null>(null);
  const [listLoading, setListLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [listError, setListError] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const manualRefresh = useRef(false);

  useEffect(() => {
    if (activeTab !== "list") return;
    const controller = new AbortController();
    const params = new URLSearchParams({ search, page: String(page) });
    const cacheKey = `${CAMPAIGN_CACHE_PREFIX}${JSON.stringify([search, page])}`;
    const bypassCache = manualRefresh.current;
    manualRefresh.current = false;
    if (!bypassCache) {
      try {
        const cached = sessionStorage.getItem(cacheKey);
        if (cached) {
          setListData(JSON.parse(cached) as CampaignListResponse);
          setListError("");
          setListLoading(false);
          return () => controller.abort();
        }
      } catch { /* Ignore invalid or unavailable browser cache. */ }
    }
    const timer = setTimeout(async () => {
      setListLoading(true);
      setListError("");
      try {
        const response = await fetch(`/api/campaigns?${params}`, { signal: controller.signal, cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Không thể tải danh sách campaigns.");
        try { sessionStorage.setItem(cacheKey, JSON.stringify(data)); } catch { /* Cache is optional. */ }
        setListData(data as CampaignListResponse);
      } catch (error) {
        if (!controller.signal.aborted) setListError(error instanceof Error ? error.message : "Không thể tải danh sách campaigns.");
      } finally {
        if (!controller.signal.aborted) setListLoading(false);
        if (!controller.signal.aborted) setRefreshing(false);
      }
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [activeTab, search, page, refreshKey]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMsg("");
    const formData = new FormData();
    formData.set("name", name);
    formData.set("subject", subject);
    formData.set("html", html);
    formData.set("text", text);
    if (file) formData.set("file", file);
    try {
      const response = await fetch("/api/campaigns", { method: "POST", body: formData });
      const data = await response.json();
      if (response.ok) { clearCampaignCache(); window.location.href = `/admin/campaigns/${data.id}`; return; }
      setMsg(data.error || "Có lỗi xảy ra khi tạo campaign.");
    } catch {
      setMsg("Không thể kết nối máy chủ để tạo campaign.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteCampaign(campaign: CampaignRow) {
    if (!window.confirm(`Xóa campaign “${campaign.name}” cùng ${numberFormat.format(campaign.recipientCount)} recipient? Thao tác này không thể hoàn tác.`)) return;
    setDeletingId(campaign.id);
    setListError("");
    try {
      const response = await fetch(`/api/campaigns/${campaign.id}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Không thể xóa campaign.");
      clearCampaignCache();
      if (listData?.campaigns.length === 1 && page > 1) setPage(page - 1);
      else setRefreshKey((current) => current + 1);
    } catch (error) {
      setListError(error instanceof Error ? error.message : "Không thể xóa campaign.");
    } finally {
      setDeletingId(null);
    }
  }

  function refreshCampaignList() {
    manualRefresh.current = true;
    setRefreshing(true);
    setRefreshKey((current) => current + 1);
  }

  return <>
    <div className="eyebrow">Campaign workspace</div>
    <h1 className="title">Quản lý campaigns</h1>
    <p className="sub">Tạo campaign mới hoặc tìm, xem và xóa các campaign đã lưu trong Turso.</p>
    <div className="settings-tabs" role="tablist" aria-label="Campaign navigation">
      <button className={`settings-tab ${activeTab === "create" ? "active" : ""}`} type="button" role="tab" aria-selected={activeTab === "create"} onClick={() => setActiveTab("create")}>Tạo campaign</button>
      <button className={`settings-tab ${activeTab === "list" ? "active" : ""}`} type="button" role="tab" aria-selected={activeTab === "list"} onClick={() => setActiveTab("list")}>Danh sách campaigns</button>
    </div>

    {activeTab === "create" ? <>
      <p className="sub">Upload CSV với cột <code>email</code>, tùy chọn <code>name</code> và các biến khác.</p>
      <form onSubmit={submit}>
        <section className="panel"><h2>1. Thông tin</h2><div className="grid">
          <div className="field"><label htmlFor="campaign-name">Tên campaign</label><input id="campaign-name" className="input" required value={name} onChange={(event) => setName(event.target.value)} placeholder="Ra mắt sản phẩm tháng 10" /></div>
          <div className="field"><label htmlFor="campaign-subject">Subject</label><input id="campaign-subject" className="input" required value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Xin chào {{name}}" /></div>
        </div></section>
        <section className="panel"><h2>2. Upload CSV</h2><div className="fileinput"><input type="file" accept=".csv,text/csv" required onChange={(event) => setFile(event.target.files?.[0] || null)} /><p className="sub" style={{ marginTop: 10, marginBottom: 0 }}>CSV tối đa 5MB. Hệ thống tự nhận diện cột email.</p></div></section>
        <section className="panel"><h2>3. Soạn nội dung</h2><div className="split">
          <div className="field"><label htmlFor="campaign-html">HTML</label><textarea id="campaign-html" className="textarea mono" value={html} onChange={(event) => setHtml(event.target.value)} /></div>
          <div className="field"><label htmlFor="campaign-text">Plain text</label><textarea id="campaign-text" className="textarea" value={text} onChange={(event) => setText(event.target.value)} /></div>
        </div><p className="sub" style={{ marginTop: 12, marginBottom: 0 }}>Biến hỗ trợ ví dụ: <code>{"{{name}}"}</code>, <code>{"{{email}}"}</code>, hoặc tên cột CSV khác.</p></section>
        {msg && <div className="notice error">{msg}</div>}
        <div className="actions"><button className="button" disabled={busy}>{busy ? "Đang tạo…" : "Tạo campaign"}</button><a className="button secondary" href="/admin">Hủy</a></div>
      </form>
    </> : <section className="panel">
      <div className="toolbar" style={{ alignItems: "end", flexWrap: "wrap" }}>
        <div><h2>Danh sách campaigns</h2><p className="sub">Tìm theo tên hoặc subject. Dữ liệu được tải trực tiếp từ Turso.</p></div>
        <div className="logs-toolbar-actions"><div className="field" style={{ width: "min(100%, 360px)" }}><label htmlFor="campaign-search">Tìm kiếm</label><input id="campaign-search" className="input" type="search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Nhập tên hoặc subject campaign…" /></div><RefreshButton label="campaigns" refreshing={refreshing || listLoading} onClick={refreshCampaignList} /></div>
      </div>
      {listError && <div className="notice error">{listError}</div>}
      <div className="tablewrap"><table className="table">
        <thead><tr><th>Tên</th><th>Subject</th><th>Recipients</th><th>Trạng thái</th><th>Ngày tạo</th><th>Thao tác</th></tr></thead>
        <tbody>
          {listLoading ? <tr><td colSpan={6}>Đang tải từ Turso…</td></tr> : listData?.campaigns.length ? listData.campaigns.map((campaign) => <tr key={campaign.id}>
            <td><a href={`/admin/campaigns/${campaign.id}`}><b>{campaign.name}</b></a></td><td>{campaign.subject}</td><td><span className="pill">{numberFormat.format(campaign.recipientCount)}</span></td>
            <td><span className={`pill ${campaign.sendStatus === "sending" ? "pill-danger" : ""}`}>{campaign.sendStatus === "sending" ? "Đang gửi" : campaign.sendStatus === "paused" ? "Tạm dừng" : campaign.sendStatus === "completed" ? "Hoàn tất" : campaign.sendStatus === "stopped" ? "Đã dừng" : "Bản nháp"}</span></td>
            <td>{new Date(campaign.createdAt).toLocaleString("vi-VN")}</td>
            <td><div className="actions" style={{ margin: 0, flexWrap: "nowrap" }}><a className="button secondary" href={`/admin/campaigns/${campaign.id}`}>Mở</a><button className="button danger" type="button" disabled={deletingId === campaign.id || campaign.sendStatus === "sending"} title={campaign.sendStatus === "sending" ? "Không thể xóa campaign đang gửi" : undefined} onClick={() => deleteCampaign(campaign)}>{deletingId === campaign.id ? "Đang xóa…" : "Xóa"}</button></div></td>
          </tr>) : <tr><td colSpan={6}>{search ? "Không tìm thấy campaign phù hợp." : "Chưa có campaign nào."}</td></tr>}
        </tbody>
      </table></div>
      {listData && <div className="pagination"><span>{numberFormat.format(listData.total)} campaigns · Trang {listData.page} / {listData.totalPages}</span><div className="pagination-actions">
        <button className="button secondary" type="button" disabled={listData.page <= 1 || listLoading} onClick={() => setPage((current) => Math.max(1, current - 1))}>← Trước</button>
        <button className="button secondary" type="button" disabled={listData.page >= listData.totalPages || listLoading} onClick={() => setPage((current) => current + 1)}>Sau →</button>
      </div></div>}
    </section>}
  </>;
}
