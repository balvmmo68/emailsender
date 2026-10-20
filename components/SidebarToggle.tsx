"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

const STORAGE_KEY = "sendroom.sidebar-collapsed";

export default function SidebarToggle() {
  const [collapsed, setCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const media = window.matchMedia("(max-width: 600px)");
    const syncViewport = () => {
      const mobile = media.matches;
      const nextCollapsed = mobile || window.localStorage.getItem(STORAGE_KEY) === "true";
      setIsMobile(mobile);
      setCollapsed(nextCollapsed);
      document.body.classList.toggle("sidebar-collapsed", nextCollapsed);
    };
    syncViewport();
    media.addEventListener("change", syncViewport);
    return () => media.removeEventListener("change", syncViewport);
  }, []);

  useEffect(() => {
    if (isMobile) {
      setCollapsed(true);
      document.body.classList.add("sidebar-collapsed");
    }
  }, [pathname, isMobile]);

  function toggleSidebar() {
    const next = !collapsed;
    setCollapsed(next);
    document.body.classList.toggle("sidebar-collapsed", next);
    if (!isMobile) window.localStorage.setItem(STORAGE_KEY, String(next));
  }

  function closeMobileMenu() {
    setCollapsed(true);
    document.body.classList.add("sidebar-collapsed");
  }

  return <>
    {isMobile && !collapsed && <button className="sidebar-backdrop" type="button" aria-label="Đóng menu" onClick={closeMobileMenu} />}
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
        {isMobile ? (collapsed ? <path d="M4 7h16M4 12h16M4 17h16" /> : <path d="m6 6 12 12M18 6 6 18" />) : collapsed ? (
          <><path d="M9 6l6 6-6 6" /><path d="M4 4v16" /></>
        ) : (
          <><path d="M15 6l-6 6 6 6" /><path d="M20 4v16" /></>
        )}
      </svg>
    </button>
  </>;
}
