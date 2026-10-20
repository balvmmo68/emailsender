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
type SavedEmailList = { id: string; subject: string; emailCount: number };
const numberFormat = new Intl.NumberFormat("vi-VN");
function normalizeHtmlSource(source: string) {
  return source.trim().replace(/^```(?:html)?[ \t]*\r?\n?/i, "").replace(/\r?\n?```[ \t]*$/, "");
}

function htmlToPlainText(source: string) {
  const document = new DOMParser().parseFromString(normalizeHtmlSource(source), "text/html");
  document.querySelectorAll("script, style, noscript, template, head").forEach((node) => node.remove());
  const blockTags = new Set(["ADDRESS", "ARTICLE", "ASIDE", "BLOCKQUOTE", "DIV", "FOOTER", "H1", "H2", "H3", "H4", "H5", "H6", "HEADER", "HR", "MAIN", "NAV", "P", "SECTION", "TABLE", "TR"]);
  const extract = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent || "";
    if (node.nodeType !== Node.ELEMENT_NODE) return "";
    const element = node as HTMLElement;
    const tag = element.tagName;
    if (tag === "BR" || tag === "HR") return "\n";
    if (tag === "IMG") {
      const image = element as HTMLImageElement;
      const label = image.alt || "Hình ảnh";
      return `[Hình ảnh: ${label}${image.src ? ` — ${image.src}` : ""}]`;
    }
    const content = Array.from(element.childNodes, extract).join("");
    if (tag === "LI") return `• ${content.trim()}\n`;
    if (tag === "TD" || tag === "TH") return `${content.trim()} | `;
    return blockTags.has(tag) ? `${content.trim()}\n\n` : content;
  };
  return extract(document.body).replace(/\u00a0/g, " ").split("\n").map((line) => line.replace(/[ \t]+/g, " ").trim()).filter(Boolean).join("\n").trim();
}
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
  const [previewMessage, setPreviewMessage] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewExpanded, setPreviewExpanded] = useState(false);
  const [previewTab, setPreviewTab] = useState<"html" | "text">("html");
  const [emailLists, setEmailLists] = useState<SavedEmailList[]>([]);
  const [selectedEmailListId, setSelectedEmailListId] = useState("");
  const [emailListsLoading, setEmailListsLoading] = useState(true);
  const [emailListsError, setEmailListsError] = useState("");
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
    if (new URLSearchParams(window.location.search).get("tab") === "list") setActiveTab("list");
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/email-lists?forSelect=1", { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Không thể tải chủ đề email.");
        setEmailLists(data.lists as SavedEmailList[]);
      })
      .catch((error) => { if (!controller.signal.aborted) setEmailListsError(error instanceof Error ? error.message : "Không thể tải chủ đề email."); })
      .finally(() => { if (!controller.signal.aborted) setEmailListsLoading(false); });
    return () => controller.abort();
  }, []);

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

  useEffect(() => {
    if (!previewOpen) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPreviewOpen(false);
        setPreviewExpanded(false);
      }
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [previewOpen]);

  function openPreview() {
    const plainText = htmlToPlainText(html);
    setText(plainText);
    setPreviewMessage(plainText ? "Đã cập nhật Plain text từ HTML; xem HTML kèm hình ảnh trong cửa sổ Preview." : "HTML chưa có phần văn bản; có thể xem hình ảnh trong cửa sổ Preview.");
    setPreviewTab("html");
    setPreviewExpanded(false);
    setPreviewOpen(true);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMsg("");
    const formData = new FormData();
    formData.set("name", name);
    formData.set("subject", subject);
    formData.set("html", html);
    formData.set("text", text);
    formData.set("listId", selectedEmailListId);
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
      <p className="sub">Chọn một chủ đề danh sách đã lưu trong mục Email để sử dụng địa chỉ của danh sách đó.</p>
      <form onSubmit={submit}>
        <section className="panel"><h2>1. Thông tin</h2><div className="grid">
          <div className="field"><label htmlFor="campaign-name">Tên campaign</label><input id="campaign-name" className="input" required value={name} onChange={(event) => setName(event.target.value)} placeholder="Ra mắt sản phẩm tháng 10" /></div>
          <div className="field"><label htmlFor="campaign-subject">Subject</label><input id="campaign-subject" className="input" required value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Xin chào {{name}}" /></div>
        </div></section>
        <section className="panel"><h2>2. Chọn danh sách email</h2><div className="field"><label htmlFor="saved-email-list">Chủ đề danh sách</label><select id="saved-email-list" className="input" required value={selectedEmailListId} onChange={(event) => setSelectedEmailListId(event.target.value)} disabled={emailListsLoading || emailLists.length === 0}><option value="">{emailListsLoading ? "Đang tải danh sách…" : emailLists.length ? "Chọn chủ đề email" : "Chưa có danh sách email"}</option>{emailLists.map((list) => <option key={list.id} value={list.id} disabled={list.emailCount === 0}>{list.subject} — {numberFormat.format(list.emailCount)} email</option>)}</select><p className="sub" style={{ margin: 0 }}>Campaign sẽ dùng bản sao email từ chủ đề được chọn. Danh sách gốc trong Email không bị thay đổi.</p>{emailListsError && <div className="notice error">{emailListsError}</div>}{!emailListsLoading && !emailLists.length && <div className="notice">Tạo danh sách trước tại <a href="/admin/email"><b>Email</b></a>.</div>}</div></section>
        <section className="panel"><h2>3. Soạn nội dung</h2><div className="split">
          <div className="field"><div className="campaign-html-heading"><label htmlFor="campaign-html">HTML</label><button className="button secondary" type="button" onClick={openPreview}>Preview</button></div><textarea id="campaign-html" className="textarea mono" value={html} onChange={(event) => { setHtml(event.target.value); setPreviewMessage(""); }} /></div>
          <div className="field"><label htmlFor="campaign-text">Plain text</label><textarea id="campaign-text" className="textarea" value={text} onChange={(event) => setText(event.target.value)} /></div>
        </div>{previewMessage && <p className="campaign-preview-message" role="status">{previewMessage}</p>}<p className="sub" style={{ marginTop: 12, marginBottom: 0 }}>Biến hỗ trợ ví dụ: <code>{"{{name}}"}</code>, <code>{"{{email}}"}</code>, hoặc tên cột CSV khác.</p></section>
        {msg && <div className="notice error">{msg}</div>}
        <div className="actions"><button className="button" disabled={busy}>{busy ? "Đang tạo…" : "Tạo campaign"}</button><a className="button secondary" href="/admin">Hủy</a></div>
      </form>
      {previewOpen && <div className="campaign-preview-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) { setPreviewOpen(false); setPreviewExpanded(false); } }}>
        <section className={`campaign-preview-modal ${previewExpanded ? "expanded" : ""}`} role="dialog" aria-modal="true" aria-labelledby="campaign-preview-title" onMouseDown={(event) => event.stopPropagation()}>
          <header className="campaign-preview-header"><div><span className="eyebrow">Campaign</span><h2 id="campaign-preview-title">Xem trước email</h2></div><div className="campaign-preview-actions"><button className="button secondary" type="button" onClick={() => setPreviewExpanded((value) => !value)}>{previewExpanded ? "Thu nhỏ" : "Phóng to"}</button><button className="button secondary" type="button" onClick={() => { setPreviewOpen(false); setPreviewExpanded(false); }}>Đóng</button></div></header>
          <div className="campaign-preview-tabs" role="tablist" aria-label="Chế độ xem trước"><button className={`settings-tab ${previewTab === "html" ? "active" : ""}`} type="button" role="tab" aria-selected={previewTab === "html"} onClick={() => setPreviewTab("html")}>HTML + hình ảnh</button><button className={`settings-tab ${previewTab === "text" ? "active" : ""}`} type="button" role="tab" aria-selected={previewTab === "text"} onClick={() => setPreviewTab("text")}>Plain text</button></div>
          {previewTab === "html" ? <iframe className="campaign-preview-iframe" title="Xem trước nội dung HTML của email" sandbox="" srcDoc={normalizeHtmlSource(html)} /> : <pre className="campaign-preview-plain">{text || "Không có nội dung Plain text."}</pre>}
          <p className="campaign-preview-hint">Ảnh được hiển thị trong tab HTML. Plain text chỉ hiển thị mô tả ảnh (alt text) và đường dẫn ảnh.</p>
        </section>
      </div>}
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
