"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "sendroom.sidebar-collapsed";

export default function SidebarToggle() {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY) === "true";
    setCollapsed(saved);
    document.body.classList.toggle("sidebar-collapsed", saved);
  }, []);

  function toggleSidebar() {
    const next = !collapsed;
    setCollapsed(next);
    document.body.classList.toggle("sidebar-collapsed", next);
    window.localStorage.setItem(STORAGE_KEY, String(next));
  }

  return (
    <button
      className="sidebar-toggle"
      type="button"
      onClick={toggleSidebar}
      aria-label={collapsed ? "Mở sidebar" : "Đóng sidebar"}
      aria-expanded={!collapsed}
      aria-controls="main-sidebar"
      title={collapsed ? "Mở sidebar" : "Đóng sidebar"}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        {collapsed ? (
          <>
            <path d="M9 6l6 6-6 6" />
            <path d="M4 4v16" />
          </>
        ) : (
          <>
            <path d="M15 6l-6 6 6 6" />
            <path d="M20 4v16" />
          </>
        )}
      </svg>
    </button>
  );
}
