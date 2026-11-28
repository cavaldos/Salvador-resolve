try {
  const stored = localStorage.getItem("cutnora_theme");
  const isDark = stored === "dark" || (stored !== "light" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = isDark ? "dark" : "light";
  document.documentElement.classList.toggle("dark", isDark);
  document.querySelector('meta[name="theme-color"]').content = isDark ? "#0d0d0d" : "#fafafa";
} catch {
  // The default theme still works when WebView storage is unavailable.
}
