export function getInitialTheme() {
  try {
    const saved = localStorage.getItem("ds_theme");
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    // The toggle still works when browser storage is unavailable.
  }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem("ds_theme", theme);
  } catch {
    // Keep the selected theme for this visit even without persistent storage.
  }
}
