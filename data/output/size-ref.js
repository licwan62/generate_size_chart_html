(function () {
  const config = window.SIZE_REF_VIEWER;
  const app = document.getElementById("app");

  if (!config || !app) {
    return;
  }

  const state = {
    headers: [],
    rows: [],
    query: "",
    status: "loading",
    message: "正在读取尺码参考..."
  };
  let sidebarCollapsed = false;

  function render() {
    app.innerHTML = `
      <main class="viewer-main viewer-shell${sidebarCollapsed ? " is-sidebar-collapsed" : ""}">
        <aside class="viewer-side" aria-label="Page outline">
          <div class="sidebar-head">
            <button class="sidebar-toggle" type="button" aria-label="${sidebarCollapsed ? "展开侧栏" : "收起侧栏"}" aria-expanded="${sidebarCollapsed ? "false" : "true"}">
              <span>${sidebarCollapsed ? "›" : "‹"}</span>
            </button>
            <div class="sidebar-brand">
              <div class="root-label">二级页面</div>
              <div class="current-path">data/ref</div>
            </div>
          </div>
          <nav class="sidebar-nav" aria-label="Pages">
            <a href="index.html" title="首页"><span class="nav-icon">首</span><span class="nav-label">首页</span></a>
            <a href="size-charts.html" title="Size Chart"><span class="nav-icon">S</span><span class="nav-label">Size Chart</span></a>
            <a class="is-active" href="size-ref.html" title="尺码参考"><span class="nav-icon">参</span><span class="nav-label">尺码参考</span></a>
            <a href="cars-data.html" title="车型三维"><span class="nav-icon">车</span><span class="nav-label">车型三维</span></a>
            <a href="size-chart.html" title="尺码配对"><span class="nav-icon">尺</span><span class="nav-label">尺码配对</span></a>
          </nav>
          <div class="sidebar-divider"></div>
          <div class="sidebar-context">
            <div class="root-label">Current</div>
            <div class="current-path">${escapeHtml(config.title)}</div>
            <p class="sidebar-description">查看通用尺码对应的分类、CAB 和长宽高参考。</p>
          </div>
        </aside>
        <div class="viewer-content">
          <section class="search-panel" aria-label="Size reference">
            <div class="global-search">
              <label>
                <span>GLOBAL</span>
                <input class="global-search-input" type="search" value="${escapeHtml(state.query)}" placeholder="搜索型号、分类、CAB、通用尺码..." autocomplete="off" ${state.status === "loading" ? "disabled" : ""}>
              </label>
              <button class="search-reset" type="button">Reset</button>
            </div>
            <div class="search-summary" role="status"></div>
            <div class="search-results"></div>
          </section>
        </div>
      </main>
    `;
    bind();
    updateResults();
  }

  function bind() {
    app.querySelector(".sidebar-toggle").addEventListener("click", () => {
      sidebarCollapsed = !sidebarCollapsed;
      render();
    });

    const input = app.querySelector(".global-search-input");
    if (input) {
      input.addEventListener("input", (event) => {
        state.query = event.target.value;
        updateResults();
      });
    }

    const resetButton = app.querySelector(".search-reset");
    if (resetButton) {
      resetButton.addEventListener("click", () => {
        state.query = "";
        const currentInput = app.querySelector(".global-search-input");
        if (currentInput) {
          currentInput.value = "";
        }
        updateResults();
      });
    }
  }

  async function load() {
    render();
    try {
      const response = await fetch(config.sourcePath, { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`Cannot load ${config.sourcePath}`);
      }
      const parsed = parseTsv(await response.text());
      state.headers = parsed.headers;
      state.rows = parsed.rows;
      state.status = "ready";
      state.message = `全量尺码参考：已索引 ${formatCount(state.rows.length)} 条记录。`;
    } catch (error) {
      state.status = "error";
      state.message = "无法读取尺码参考。";
    }
    render();
  }

  function updateResults() {
    const summary = app.querySelector(".search-summary");
    const results = app.querySelector(".search-results");
    if (!summary || !results) return;
    if (state.status !== "ready") {
      summary.textContent = state.message;
      results.innerHTML = "";
      return;
    }
    const rows = getMatches();
    summary.textContent = state.query.trim()
      ? `匹配结果：${formatCount(rows.length)} 条记录。`
      : state.message;
    results.innerHTML = renderTable(rows);
  }

  function getMatches() {
    const tokens = searchTokens(state.query);
    if (!tokens.length) return state.rows;
    return state.rows.filter((row) => {
      const text = normalizeSearchText(Object.values(row).join(" "));
      return tokens.every((token) => text.includes(token));
    });
  }

  function renderTable(rows) {
    if (!rows.length) {
      return '<div class="empty-results">未找到匹配记录。</div>';
    }
    return `
      <div class="results-table-wrap size-ref-wrap">
        <table class="results-table size-ref-table">
          <thead>
            <tr>${state.headers.map((header) => `<th class="${dimensionHeaderClass(header)}"><span class="th-label">${escapeHtml(header)}</span></th>`).join("")}</tr>
          </thead>
          <tbody>
            ${rows.map((row) => `<tr>${state.headers.map((header) => cellMarkup(row[header], header)).join("")}</tr>`).join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function cellMarkup(value, header) {
    if (["长_in", "宽_in", "高_in"].includes(header)) {
      return `<td class="dimension-cell"><strong>${escapeHtml(value || "-")}</strong></td>`;
    }
    if (header === "型号") {
      return `<td class="size-ref-code"><strong>${escapeHtml(value || "-")}</strong></td>`;
    }
    if (header === "通用尺码") {
      return `<td class="size-cell size-ref-common-cell" style="${escapeHtml(sizeCellStyle(value))}"><strong>${escapeHtml(value || "-")}</strong></td>`;
    }
    return `<td>${escapeHtml(value || "")}</td>`;
  }

  function sizeCellStyle(value) {
    const color = sizeColor(value);
    return color ? `--size-bg: ${color.background}; --size-fg: ${color.text};` : "";
  }

  function sizeColor(value) {
    const text = cleanField(value).toUpperCase();
    const family = (text.match(/[A-Z]/) || [""])[0];
    const number = Number((text.match(/\d+/) || ["0"])[0]);
    if (!family || !number) return null;
    const bases = {
      A: "#1777c8",
      C: "#d62828",
      H: "#00a6a6",
      S: "#f28c28",
      T: "#6b7280",
      OTHER: "#6b7280"
    };
    const base = bases[family] || bases.OTHER;
    const depth = Math.max(0, Math.min(1, (number - 1) / 6));
    const background = mixHex("#ffffff", base, 0.72 + depth * 0.28);
    return { background, text: "#ffffff" };
  }

  function mixHex(left, right, ratio) {
    const a = hexToRgb(left);
    const b = hexToRgb(right);
    const mixed = a.map((value, index) => Math.round(value + (b[index] - value) * ratio));
    return `rgb(${mixed[0]}, ${mixed[1]}, ${mixed[2]})`;
  }

  function hexToRgb(hex) {
    const value = hex.replace("#", "");
    return [0, 2, 4].map((index) => parseInt(value.slice(index, index + 2), 16));
  }

  function dimensionHeaderClass(header) {
    return ["长_in", "宽_in", "高_in"].includes(header) ? "dimension-heading" : "";
  }

  function parseTsv(text) {
    const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
    const headers = lines.shift().split("\t").map((header) => header.trim());
    return {
      headers,
      rows: lines.map((line) => {
        const cells = line.split("\t");
        const row = {};
        headers.forEach((header, index) => {
          row[header] = cleanField(cells[index]);
        });
        return row;
      })
    };
  }

  function searchTokens(value) {
    return normalizeSearchText(value).split(/\s+/).filter(Boolean);
  }

  function normalizeSearchText(value) {
    return cleanField(value).toLowerCase();
  }

  function cleanField(value) {
    return String(value ?? "").trim();
  }

  function formatCount(value) {
    return new Intl.NumberFormat("en-US").format(value);
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[char]));
  }

  load();
})();
