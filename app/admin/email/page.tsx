"use client";

import { useEffect, useState, type FormEvent } from "react";

type EmailContact = { id: string; listId: string; email: string; name: string | null; subject: string; createdAt: number };
type EmailListResponse = { contacts: EmailContact[]; page: number; pageSize: number; total: number; totalPages: number };
const numberFormat = new Intl.NumberFormat("vi-VN");

export default function EmailPage() {
  const [subject, setSubject] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileKey, setFileKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<EmailListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({ search, page: String(page) });
        const response = await fetch(`/api/email-lists?${params}`, { signal: controller.signal, cache: "no-store" });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Không thể tải email.");
        setData(result as EmailListResponse);
      } catch (err) {
        if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Không thể tải email.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [search, page, refreshKey]);

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
      setNotice(`Đã nhập ${numberFormat.format(result.imported)} email. Chủ đề: ${subject}.`);
      setSubject("");
      setFile(null);
      setFileKey((current) => current + 1);
      setSearch("");
      setPage(1);
      setRefreshKey((current) => current + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể nhập file CSV.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteEmail(contact: EmailContact) {
    if (!window.confirm(`Xóa địa chỉ ${contact.email} khỏi danh sách?`)) return;
    setDeletingId(contact.id);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/email-lists/contacts/${contact.id}`, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Không thể xóa email.");
      setNotice(`Đã xóa ${contact.email}.`);
      if (data?.contacts.length === 1 && page > 1) setPage((current) => current - 1);
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

    <section className="panel">
      <h2>Thêm danh sách email</h2>
      <p className="sub">Mỗi lần tải CSV sẽ tạo một chủ đề danh sách riêng. CSV cần có cột <code>email</code>; cột <code>name</code> là tùy chọn.</p>
      <form onSubmit={importCsv}>
        <div className="grid">
          <div className="field"><label htmlFor="email-subject">Chủ đề danh sách</label><input id="email-subject" className="input" required maxLength={120} value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Ví dụ: Khách hàng tháng 10" /></div>
          <div className="field"><label htmlFor="email-csv">File CSV</label><input key={fileKey} id="email-csv" className="input" type="file" accept=".csv,text/csv" required onChange={(event) => setFile(event.target.files?.[0] || null)} /><span className="sub" style={{ margin: 0 }}>Tối đa 5MB, tối đa 10.000 email hợp lệ mỗi lần tải.</span></div>
        </div>
        <div className="actions"><button className="button" type="submit" disabled={saving}>{saving ? "Đang lưu vào Turso…" : "Tải email lên"}</button></div>
      </form>
      {notice && <div className="notice" style={{ marginTop: 14 }}>{notice}</div>}
      {error && <div className="notice error" style={{ marginTop: 14 }}>{error}</div>}
    </section>

    <section className="panel">
      <div className="toolbar" style={{ alignItems: "end", flexWrap: "wrap" }}>
        <div><h2>Email đã lưu</h2><p className="sub">Tìm theo địa chỉ, tên hoặc chủ đề; quản lý dữ liệu đã nhập trong Turso.</p></div>
        <div className="field" style={{ width: "min(100%, 380px)" }}><label htmlFor="email-search">Tìm kiếm email</label><input id="email-search" className="input" type="search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Email, tên hoặc chủ đề…" /></div>
      </div>
      {error && <div className="notice error" style={{ marginBottom: 14 }}>{error}</div>}
      <div className="tablewrap"><table className="table">
        <thead><tr><th>Email</th><th>Tên</th><th>Chủ đề</th><th>Ngày thêm</th><th>Thao tác</th></tr></thead>
        <tbody>
          {loading ? <tr><td colSpan={5}>Đang tải email từ Turso…</td></tr> : data?.contacts.length ? data.contacts.map((contact) => <tr key={contact.id}>
            <td>{contact.email}</td><td>{contact.name || "—"}</td><td>{contact.subject}</td><td>{new Date(contact.createdAt).toLocaleString("vi-VN")}</td>
            <td><button className="button danger" type="button" disabled={deletingId === contact.id} onClick={() => deleteEmail(contact)}>{deletingId === contact.id ? "Đang xóa…" : "Xóa"}</button></td>
          </tr>) : <tr><td colSpan={5}>{search ? "Không tìm thấy email phù hợp." : "Chưa có email. Hãy tạo chủ đề và tải CSV lên."}</td></tr>}
        </tbody>
      </table></div>
      {data && <div className="pagination"><span>{numberFormat.format(data.total)} email · Trang {data.page} / {data.totalPages}</span><div className="pagination-actions">
        <button className="button secondary" type="button" disabled={data.page <= 1 || loading} onClick={() => setPage((current) => Math.max(1, current - 1))}>← Trước</button>
        <button className="button secondary" type="button" disabled={data.page >= data.totalPages || loading} onClick={() => setPage((current) => current + 1)}>Sau →</button>
      </div></div>}
    </section>
  </>;
}
