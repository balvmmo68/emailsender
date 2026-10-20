"use client";

import { useEffect, useState, type FormEvent } from "react";

type EmailListSummary = { id: string; subject: string; createdAt: number; emailCount: number };
type EmailContact = { id: string; email: string; name: string | null; createdAt: number };
type Paged<T> = { page: number; pageSize: number; total: number; totalPages: number };
type ListResponse = Paged<EmailListSummary> & { lists: EmailListSummary[] };
type ContactResponse = Paged<EmailContact> & { list: { id: string; subject: string; createdAt: number }; contacts: EmailContact[] };
const numberFormat = new Intl.NumberFormat("vi-VN");

export default function EmailPage() {
  const [selectedList, setSelectedList] = useState<EmailListSummary | null>(null);
  const [subject, setSubject] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileKey, setFileKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [listsData, setListsData] = useState<ListResponse | null>(null);
  const [contactsData, setContactsData] = useState<ContactResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ search, page: String(page) });
    if (selectedList) params.set("listId", selectedList.id);
    const timer = setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(`/api/email-lists?${params}`, { signal: controller.signal, cache: "no-store" });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Không thể tải dữ liệu email.");
        if (selectedList) setContactsData(result as ContactResponse);
        else setListsData(result as ListResponse);
      } catch (err) {
        if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Không thể tải dữ liệu email.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 200);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [selectedList, search, page, refreshKey]);

  async function importCsv(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) { setError("Vui lòng chọn file CSV."); return; }
    setSaving(true);
    setNotice("");
    setError("");
    const form = new FormData();
    form.set("subject", subject);
    form.set("file", file);
    try {
      const response = await fetch("/api/email-lists", { method: "POST", body: form });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Không thể lưu email.");
      setNotice(`Đã nhập ${numberFormat.format(result.imported)} email vào chủ đề “${subject}”.`);
      setSubject("");
      setFile(null);
      setFileKey((current) => current + 1);
      setSearch("");
      setPage(1);
      setSelectedList(null);
      setRefreshKey((current) => current + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể nhập file CSV.");
    } finally {
      setSaving(false);
    }
  }

  function openList(list: EmailListSummary) {
    setNotice("");
    setSelectedList(list);
    setSearch("");
    setPage(1);
    setContactsData(null);
  }

  async function deleteList(list: EmailListSummary) {
    if (!window.confirm(`Xóa chủ đề “${list.subject}” cùng ${numberFormat.format(list.emailCount)} email bên trong? Thao tác này không thể hoàn tác.`)) return;
    setDeletingId(list.id);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/email-lists/${list.id}`, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Không thể xóa chủ đề.");
      setNotice(`Đã xóa chủ đề “${list.subject}” và email bên trong.`);
      if (listsData?.lists.length === 1 && page > 1) setPage((current) => current - 1);
      else setRefreshKey((current) => current + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể xóa chủ đề.");
    } finally {
      setDeletingId(null);
    }
  }

  async function deleteEmail(contact: EmailContact) {
    if (!window.confirm(`Xóa địa chỉ ${contact.email} khỏi chủ đề “${selectedList?.subject || ""}”?`)) return;
    setDeletingId(contact.id);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/email-lists/contacts/${contact.id}`, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Không thể xóa email.");
      setNotice(`Đã xóa ${contact.email}.`);
      if (contactsData?.contacts.length === 1 && page > 1) setPage((current) => current - 1);
      else setRefreshKey((current) => current + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể xóa email.");
    } finally {
      setDeletingId(null);
    }
  }

  return <>
    <div className="eyebrow">Email</div>
    <h1 className="title">Quản lý email</h1>
    <p className="sub">Tạo chủ đề danh sách và lưu địa chỉ từ CSV vào Turso. Trang này chỉ quản lý email, không tạo campaign.</p>

    {!selectedList ? <>
      <section className="panel">
        <h2>Tạo chủ đề danh sách</h2>
        <p className="sub">Mỗi lần tải CSV sẽ tạo một chủ đề riêng. CSV cần có cột <code>email</code>; cột <code>name</code> là tùy chọn.</p>
        <form onSubmit={importCsv}>
          <div className="grid">
            <div className="field"><label htmlFor="email-subject">Chủ đề danh sách</label><input id="email-subject" className="input" required maxLength={120} value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Ví dụ: Khách hàng tháng 10" /></div>
            <div className="field"><label htmlFor="email-csv">File CSV</label><input key={fileKey} id="email-csv" className="input" type="file" accept=".csv,text/csv" required onChange={(event) => setFile(event.target.files?.[0] || null)} /><span className="sub" style={{ margin: 0 }}>Tối đa 5MB, nhiều nhất 10.000 email hợp lệ.</span></div>
          </div>
          <div className="actions"><button className="button" type="submit" disabled={saving}>{saving ? "Đang lưu vào Turso…" : "Tải danh sách email lên"}</button></div>
        </form>
        {notice && <div className="notice" style={{ marginTop: 14 }}>{notice}</div>}
        {error && <div className="notice error" style={{ marginTop: 14 }}>{error}</div>}
      </section>

      <section className="panel">
        <div className="toolbar" style={{ alignItems: "end", flexWrap: "wrap" }}>
          <div><h2>Chủ đề danh sách</h2><p className="sub">Chọn một chủ đề để xem toàn bộ email trong danh sách.</p></div>
          <div className="field" style={{ width: "min(100%, 360px)" }}><label htmlFor="list-search">Tìm chủ đề</label><input id="list-search" className="input" type="search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Nhập tên chủ đề…" /></div>
        </div>
        {error && <div className="notice error" style={{ marginBottom: 14 }}>{error}</div>}
        <div className="tablewrap"><table className="table email-list-summary">
          <thead><tr><th>Chủ đề danh sách</th><th>Tổng email</th><th>Thao tác</th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={3}>Đang tải danh sách từ Turso…</td></tr> : listsData?.lists.length ? listsData.lists.map((list) => <tr key={list.id}>
              <td><button className="email-topic-link" type="button" onClick={() => openList(list)}>{list.subject}</button></td>
              <td><span className="pill">{numberFormat.format(list.emailCount)}</span></td>
              <td><button className="button danger" type="button" disabled={deletingId === list.id} onClick={() => deleteList(list)}>{deletingId === list.id ? "Đang xóa…" : "Xóa chủ đề"}</button></td>
            </tr>) : <tr><td colSpan={3}>{search ? "Không tìm thấy chủ đề phù hợp." : "Chưa có chủ đề danh sách nào."}</td></tr>}
          </tbody>
        </table></div>
        {listsData && <div className="pagination"><span>{numberFormat.format(listsData.total)} chủ đề · Trang {listsData.page} / {listsData.totalPages}</span><div className="pagination-actions">
          <button className="button secondary" type="button" disabled={listsData.page <= 1 || loading} onClick={() => setPage((current) => Math.max(1, current - 1))}>← Trước</button>
          <button className="button secondary" type="button" disabled={listsData.page >= listsData.totalPages || loading} onClick={() => setPage((current) => current + 1)}>Sau →</button>
        </div></div>}
      </section>
    </> : <section className="panel">
      <div className="toolbar" style={{ alignItems: "end", flexWrap: "wrap" }}>
        <div><button className="button secondary" type="button" onClick={() => { setSelectedList(null); setSearch(""); setPage(1); setNotice(""); }}>← Tất cả chủ đề</button><h2 style={{ marginTop: 16 }}>{selectedList.subject}</h2><p className="sub">{numberFormat.format(contactsData?.total ?? selectedList.emailCount)} email trong danh sách này.</p></div>
        <div className="field" style={{ width: "min(100%, 360px)" }}><label htmlFor="contact-search">Tìm email trong chủ đề</label><input id="contact-search" className="input" type="search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Email hoặc tên…" /></div>
      </div>
      {notice && <div className="notice" style={{ marginBottom: 14 }}>{notice}</div>}
      {error && <div className="notice error" style={{ marginBottom: 14 }}>{error}</div>}
      <div className="tablewrap"><table className="table">
        <thead><tr><th>Email</th><th>Tên</th><th>Ngày thêm</th><th>Thao tác</th></tr></thead>
        <tbody>
          {loading ? <tr><td colSpan={4}>Đang tải email từ Turso…</td></tr> : contactsData?.contacts.length ? contactsData.contacts.map((contact) => <tr key={contact.id}>
            <td>{contact.email}</td><td>{contact.name || "—"}</td><td>{new Date(contact.createdAt).toLocaleString("vi-VN")}</td>
            <td><button className="button danger" type="button" disabled={deletingId === contact.id} onClick={() => deleteEmail(contact)}>{deletingId === contact.id ? "Đang xóa…" : "Xóa"}</button></td>
          </tr>) : <tr><td colSpan={4}>{search ? "Không tìm thấy email phù hợp." : "Chủ đề này chưa có email."}</td></tr>}
        </tbody>
      </table></div>
      {contactsData && <div className="pagination"><span>{numberFormat.format(contactsData.total)} email · Trang {contactsData.page} / {contactsData.totalPages}</span><div className="pagination-actions">
        <button className="button secondary" type="button" disabled={contactsData.page <= 1 || loading} onClick={() => setPage((current) => Math.max(1, current - 1))}>← Trước</button>
        <button className="button secondary" type="button" disabled={contactsData.page >= contactsData.totalPages || loading} onClick={() => setPage((current) => current + 1)}>Sau →</button>
      </div></div>}
    </section>}
  </>;
}
