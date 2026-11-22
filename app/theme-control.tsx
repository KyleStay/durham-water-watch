"use client";

import { useSyncExternalStore } from "react";

const preferenceKey = "durham-water-theme";
const changeEvent = "durham-water-theme-change";

function subscribe(onChange: () => void) {
  window.addEventListener(changeEvent, onChange);
  return () => window.removeEventListener(changeEvent, onChange);
}

function preference() {
  const theme = document.documentElement.dataset.theme;
  return theme === "light" || theme === "dark" ? theme : "system";
}

export default function ThemeControl({ lang }: { lang: "en" | "es" }) {
  const theme = useSyncExternalStore(subscribe, preference, () => "system");
  const en = lang === "en";

  return (
    <select className="theme-control" aria-label={en ? "Color theme" : "Tema de color"} value={theme} onChange={(event) => {
      const value = event.target.value;
      if (value === "system") delete document.documentElement.dataset.theme;
      else document.documentElement.dataset.theme = value;
      try { localStorage.setItem(preferenceKey, value); } catch {}
      window.dispatchEvent(new Event(changeEvent));
    }}>
      <option value="system">{en ? "System theme" : "Tema del sistema"}</option>
      <option value="light">{en ? "Light theme" : "Tema claro"}</option>
      <option value="dark">{en ? "Dark theme" : "Tema oscuro"}</option>
    </select>
  );
}
