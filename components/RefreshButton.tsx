"use client";

export default function RefreshButton({ label, refreshing, onClick }: { label: string; refreshing: boolean; onClick: () => void }) {
  return <button className="button secondary refresh-button" type="button" onClick={onClick} disabled={refreshing} aria-label={`Làm mới ${label}`} title={`Làm mới ${label}`}>
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 0 0-14.7-4L4 9" /><path d="M4 4v5h5" /><path d="M4 13a8 8 0 0 0 14.7 4L20 15" /><path d="M20 20v-5h-5" /></svg>
    {refreshing ? "Đang tải…" : "Refresh"}
  </button>;
}
