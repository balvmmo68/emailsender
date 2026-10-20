"use client";

import { useEffect, useState } from "react";

type Log = { id: string; providerEnv: string; operation: string; recipient: string | null; errorMessage: string; createdAt: number };
const LOG_CACHE_PREFIX = "sender:provider-logs:";

function clearLogCache() {
  try {
    for (let index = sessionStorage.length - 1; index >= 0; index -= 1) {
      const key = sessionStorage.key(index);
      if (key?.startsWith(LOG_CACHE_PREFIX)) sessionStorage.removeItem(key);
    }
  } catch { /* Session storage may be unavailable in restricted browsers. */ }
}

export default function ProviderLogsPanel() {
  const [logs, setLogs] = useState<Log[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  async function load(nextPage = page, forceRefresh = false) {
    const cacheKey = `${LOG_CACHE_PREFIX}${nextPage}`;
    if (!forceRefresh) {
      try {
        const cached = sessionStorage.getItem(cacheKey);
        if (cached) {
          const data = JSON.parse(cached);
          setLogs(data.logs); setPage(data.page); setTotalPages(data.totalPages); setTotal(data.total);
          return;
        }
      } catch { /* Ignore invalid or unavailable browser cache. */ }
    }
    const response = await fetch(`/api/logs?page=${nextPage}`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) { setError(data.error || "Không thể tải logs"); return; }
    setLogs(data.logs); setPage(data.page); setTotalPages(data.totalPages); setTotal(data.total);
    try { sessionStorage.setItem(cacheKey, JSON.stringify(data)); } catch { /* Cache is optional. */ }
  }

  useEffect(() => { load(1); }, []);

  async function refreshLogs() {
    setRefreshing(true); setError("");
    await load(page, true);
    setMessage("Đã cập nhật logs mới nhất.");
    setRefreshing(false);
  }

  async function copyError(value: string) {
    await navigator.clipboard.writeText(value);
    setMessage("Đã copy nội dung lỗi.");
  }

  async function remove(id?: string) {
    if (!window.confirm(id ? "Xóa log lỗi này?" : "Xóa toàn bộ log lỗi?")) return;
    const response = await fetch("/api/logs", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify(id ? { id } : { all: true }) });
    const data = await response.json();
    if (!response.ok) { setError(data.error || "Không thể xóa log"); return; }
    setMessage(id ? "Đã xóa log." : "Đã xóa toàn bộ logs.");
    clearLogCache();
    load(id && logs.length === 1 && page > 1 ? page - 1 : page);
  }

  return <section className="panel logs-panel"><div className="toolbar"><div><h2>Provider logs</h2><p className="sub">Lịch sử lỗi khi Test API và gửi email test theo từng provider.</p></div><div className="logs-toolbar-actions"><button className="button secondary refresh-button" type="button" onClick={refreshLogs} disabled={refreshing} aria-label="Làm mới logs" title="Làm mới logs"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 0 0-14.7-4L4 9" /><path d="M4 4v5h5" /><path d="M4 13a8 8 0 0 0 14.7 4L20 15" /><path d="M20 20v-5h-5" /></svg>{refreshing ? "Đang tải…" : "Refresh"}</button><button className="button danger" type="button" disabled={!total} onClick={() => remove()}>Xóa toàn bộ logs</button></div></div>{message && <div className="notice">{message}</div>}{error && <div className="notice error">{error}</div>}<div className="logs-summary"><h2>Logs lỗi ({total})</h2><span>Trang {page} / {totalPages}</span></div><div className="tablewrap"><table className="table logs-table"><thead><tr><th>Thời gian</th><th>Provider</th><th>Thao tác</th><th>Email nhận</th><th>Lỗi</th><th>Thao tác</th></tr></thead><tbody>{logs.length ? logs.map((log) => <tr key={log.id}><td>{new Date(log.createdAt).toLocaleString("vi-VN")}</td><td><code>{log.providerEnv}</code></td><td>{log.operation}</td><td>{log.recipient || "—"}</td><td><span className="log-error">{log.errorMessage}</span></td><td><div className="log-actions"><button className="button secondary" type="button" onClick={() => copyError(log.errorMessage)}>Copy lỗi</button><button className="button danger" type="button" onClick={() => remove(log.id)}>Xóa</button></div></td></tr>) : <tr><td colSpan={6}>Chưa có log lỗi nào.</td></tr>}</tbody></table></div><div className="pagination"><span>Hiển thị tối đa 20 logs mỗi trang</span><div className="pagination-actions"><button className="button secondary" type="button" disabled={page <= 1} onClick={() => load(page - 1)}>← Trước</button><button className="button secondary" type="button" disabled={page >= totalPages} onClick={() => load(page + 1)}>Sau →</button></div></div></section>;
}
