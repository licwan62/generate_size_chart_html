(function () {
  const config = window.CARS_DATA_VIEWER;
  const app = document.getElementById("app");

  if (!config || !app) {
    return;
  }

  const defaultViewConfig = {
    table_fields: [
      { source: "品牌", label: "品牌" },
      { source: "前台车型", label: "前台车型" },
      { source: "主车型", label: "主车型", visible: false },
      { source: "代际", label: "代际" },
      { source: "年份区间", label: "年份区间" },
      { source: "结构", label: "结构" },
      { source: "版本", label: "版本" },
      { source: "分类", label: "分类" },
      { source: "驾驶室类型", label: "驾驶室类型" },
      { source: "货斗长度_ft", label: "货斗长度_ft" }
    ],
    dimensions: {
      imperial: {
        label: "英寸",
        fields: [
          { source: "length_in", label: "长(in)" },
          { source: "width_in", label: "宽(in)" },
          { source: "height_in", label: "高(in)" }
        ]
      },
      metric: {
        label: "厘米",
        fields: [
          { source: "length_cm", label: "长(cm)" },
          { source: "width_cm", label: "宽(cm)" },
          { source: "height_cm", label: "高(cm)" }
        ]
      }
    },
    type_field: "分类",
    pickup_type: "皮卡",
    pickup_filters: [
      { source: "驾驶室类型", label: "驾驶室类型" },
      { source: "货斗长度_ft", label: "货斗长度_ft" }
    ]
  };

  const state = {
    headers: [],
    rows: [],
    viewConfig: defaultViewConfig,
    visibleFields: new Set(defaultViewConfig.table_fields.filter((field) => field.visible !== false).map((field) => field.source)),
    query: "",
    brand: "",
    model: "",
    year: "",
    type: "",
    structure: "",
    pickupFilters: {},
    unit: "imperial",
    dimensionTheme: "auto",
    sortField: "",
    sortDirection: "asc",
    status: "loading",
    message: "Loading records..."
  };
  const renderLimit = 500;

  function render() {
    app.innerHTML = `
      <header class="topbar">
        <div class="topbar-inner tool-topbar">
          <a class="back-link" href="index.html">首页</a>
          <div class="current-title">
            <div class="root-label">data/source</div>
            <div class="current-path">${escapeHtml(config.title)}</div>
          </div>
          <a class="open-link" href="${escapeHtml(config.sourcePath)}">打开 TSV</a>
        </div>
      </header>

      <main class="viewer-main">
        <section class="search-panel" aria-label="Car data search">
          <div class="search-header">
            <div>
              <h2>Search Records</h2>
              <p>${escapeHtml(config.sourcePath)}</p>
            </div>
            <button class="search-reset" type="button">Reset</button>
          </div>
          <div class="global-search">
            <label>
              <span>GLOBAL</span>
              <input class="global-search-input" type="search" value="${escapeHtml(state.query)}" placeholder="Search make, model, year, category, dimensions..." autocomplete="off" ${state.status === "loading" ? "disabled" : ""}>
            </label>
          </div>
          <div class="search-controls cars-controls">
            ${filterMarkup("分类", "type", "All types")}
            ${filterMarkup("品牌", "brand", "All brands")}
            ${filterMarkup("前台车型", "model", "All models")}
            ${filterMarkup("年份", "year", "All years")}
            ${filterMarkup("结构", "structure", "All structures")}
          </div>
          <div class="search-controls pickup-controls${isPickupSelected() ? "" : " is-hidden"}">
            ${state.viewConfig.pickup_filters.map((field) => filterMarkup(field.label, `pickup:${field.source}`, `All ${field.label}`)).join("")}
          </div>
          <div class="display-controls">
            <details class="field-menu">
              <summary>显示字段</summary>
              <div class="field-menu-panel">
                ${displayFieldOptions().map((field) => `
                  <label>
                    <input type="checkbox" value="${escapeHtml(field.source)}" ${state.visibleFields.has(field.source) ? "checked" : ""}>
                    <span>${escapeHtml(field.label)}</span>
                  </label>
                `).join("")}
              </div>
            </details>
            <label class="sort-control">
              <span>排序</span>
              <select class="search-select" data-sort-field ${state.status === "loading" ? "disabled" : ""}>
                <option value="">默认顺序</option>
              </select>
            </label>
            <button class="sort-direction" type="button" data-sort-direction title="切换排序方向">${state.sortDirection === "asc" ? "↑" : "↓"}</button>
            <details class="settings-menu">
              <summary>设置</summary>
              <div class="settings-menu-panel">
                <label>
                  <input type="radio" name="dimension-theme" value="auto" ${state.dimensionTheme === "auto" ? "checked" : ""}>
                  <span>自动颜色</span>
                </label>
                <label>
                  <input type="radio" name="dimension-theme" value="blue" ${state.dimensionTheme === "blue" ? "checked" : ""}>
                  <span>蓝色尺寸</span>
                </label>
                <label>
                  <input type="radio" name="dimension-theme" value="yellow" ${state.dimensionTheme === "yellow" ? "checked" : ""}>
                  <span>黄色尺寸</span>
                </label>
              </div>
            </details>
            <div class="unit-toggle" role="group" aria-label="Dimension unit">
              <button type="button" class="${state.unit === "imperial" ? "is-active" : ""}" data-unit="imperial">${escapeHtml(state.viewConfig.dimensions.imperial.label)}</button>
              <button type="button" class="${state.unit === "metric" ? "is-active" : ""}" data-unit="metric">${escapeHtml(state.viewConfig.dimensions.metric.label)}</button>
            </div>
          </div>
          <div class="search-summary" role="status"></div>
          <div class="search-results"></div>
        </section>
      </main>
    `;

    bind();
    updateControls();
    updateResults();
  }

  function filterMarkup(label, key, emptyLabel) {
    return `
      <label>
        <span>${escapeHtml(label)}</span>
        <select class="search-select" data-filter="${escapeHtml(key)}" ${state.status === "loading" ? "disabled" : ""}>
          <option value="">${escapeHtml(emptyLabel)}</option>
        </select>
      </label>
    `;
  }

  function bind() {
    app.querySelector(".global-search-input").addEventListener("input", (event) => {
      state.query = event.target.value;
      updateControls();
      updateResults();
    });

    app.querySelectorAll("[data-filter]").forEach((select) => {
      select.addEventListener("change", () => {
        const key = select.dataset.filter;
        if (key === "brand") {
          state.brand = select.value;
          state.model = "";
        } else if (key === "model") {
          state.model = select.value;
        } else if (key === "year") {
          state.year = select.value;
        } else if (key === "type") {
          state.type = select.value;
          state.pickupFilters = {};
          render();
          return;
        } else if (key === "structure") {
          state.structure = select.value;
        } else if (key.startsWith("pickup:")) {
          state.pickupFilters[key.slice("pickup:".length)] = select.value;
        }
        updateControls();
        updateResults();
      });
    });

    app.querySelectorAll("[data-unit]").forEach((button) => {
      button.addEventListener("click", () => {
        state.unit = button.dataset.unit;
        updateResults();
        updateUnitButtons();
      });
    });

    app.querySelectorAll(".field-menu-panel input").forEach((checkbox) => {
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) {
          state.visibleFields.add(checkbox.value);
        } else {
          state.visibleFields.delete(checkbox.value);
        }
        updateResults();
      });
    });

    app.querySelector("[data-sort-field]").addEventListener("change", (event) => {
      state.sortField = event.target.value;
      updateResults();
    });

    app.querySelector("[data-sort-direction]").addEventListener("click", () => {
      state.sortDirection = state.sortDirection === "asc" ? "desc" : "asc";
      app.querySelector("[data-sort-direction]").textContent = state.sortDirection === "asc" ? "↑" : "↓";
      updateResults();
    });

    app.querySelectorAll("[name='dimension-theme']").forEach((radio) => {
      radio.addEventListener("change", () => {
        state.dimensionTheme = radio.value;
        updateResults();
      });
    });

    app.querySelector(".search-reset").addEventListener("click", () => {
      state.query = "";
      state.brand = "";
      state.model = "";
      state.year = "";
      state.type = "";
      state.structure = "";
      state.pickupFilters = {};
      state.sortField = "";
      state.sortDirection = "asc";
      app.querySelector(".global-search-input").value = "";
      render();
    });
  }

  async function load() {
    render();
    try {
      const [dataResponse, viewResponse] = await Promise.all([
        fetch(config.sourcePath, { cache: "no-store" }),
        fetch(config.viewConfigPath || "data/source/cars-data-view.yaml", { cache: "no-store" })
      ]);
      if (!dataResponse.ok) {
        throw new Error(`Cannot load ${config.sourcePath}`);
      }
      if (viewResponse.ok) {
        state.viewConfig = mergeViewConfig(defaultViewConfig, parseViewYaml(await viewResponse.text()));
        state.visibleFields = new Set(state.viewConfig.table_fields.filter((field) => field.visible !== false).map((field) => field.source));
      }
      const parsed = parseTsv(await dataResponse.text());
      state.headers = parsed.headers;
      state.rows = parsed.rows.map((row) => ({
        values: row,
        years: expandYears(row["年份区间"] || row["开始年"]),
        searchText: Object.values(row).join(" ")
      }));
      state.status = "ready";
      state.message = `${state.rows.length} rows indexed.`;
    } catch (error) {
      state.status = "error";
      state.message = "Unable to load car data.";
    }
    render();
  }

  function updateControls() {
    if (state.status !== "ready") {
      return;
    }
    fillFilter("type", "All types", unique(state.rows.map((row) => row.values[state.viewConfig.type_field])), state.type);
    const typeRows = state.rows.filter((row) => !state.type || row.values[state.viewConfig.type_field] === state.type);
    fillFilter("brand", "All brands", unique(typeRows.map((row) => row.values["品牌"])), state.brand);
    const brandRows = typeRows.filter((row) => !state.brand || row.values["品牌"] === state.brand);
    fillFilter("model", "All models", unique(brandRows.map((row) => row.values["前台车型"])), state.model);
    const modelRows = brandRows.filter((row) => !state.model || row.values["前台车型"] === state.model);
    fillFilter("year", "All years", uniqueYears(modelRows), state.year);
    fillFilter("structure", "All structures", unique(modelRows.map((row) => row.values["结构"])), state.structure);

    if (isPickupSelected()) {
      state.viewConfig.pickup_filters.forEach((field) => {
        fillFilter(`pickup:${field.source}`, `All ${field.label}`, unique(modelRows.map((row) => row.values[field.source])), state.pickupFilters[field.source] || "");
      });
    }
    fillSortOptions();
  }

  function updateResults() {
    const summary = app.querySelector(".search-summary");
    const results = app.querySelector(".search-results");
    if (!summary || !results) {
      return;
    }
    if (state.status !== "ready") {
      summary.textContent = state.message;
      results.innerHTML = "";
      return;
    }
    const matches = getMatches();
    const hasFilter = state.query.trim() || state.brand || state.model || state.year || state.type || state.structure || Object.values(state.pickupFilters).some(Boolean);
    const sortedRows = sortRows(matches);
    const visibleRows = sortedRows.slice(0, renderLimit);
    const cappedText = sortedRows.length > visibleRows.length ? ` Showing first ${visibleRows.length}.` : "";
    summary.textContent = hasFilter
      ? `${matches.length} matching row${matches.length === 1 ? "" : "s"}.${cappedText}`
      : `${matches.length} rows indexed. Showing first ${visibleRows.length}.`;
    results.innerHTML = renderTable(visibleRows);
  }

  function getMatches() {
    const tokens = searchTokens(state.query);
    return state.rows.filter((row) => {
      if (state.type && row.values[state.viewConfig.type_field] !== state.type) return false;
      if (state.brand && row.values["品牌"] !== state.brand) return false;
      if (state.model && row.values["前台车型"] !== state.model) return false;
      if (state.year && !row.years.includes(Number(state.year))) return false;
      if (state.structure && row.values["结构"] !== state.structure) return false;
      for (const [field, value] of Object.entries(state.pickupFilters)) {
        if (value && row.values[field] !== value) return false;
      }
      return !tokens.length || tokens.every((token) => normalizeSearchText(row.searchText).includes(token));
    });
  }

  function renderTable(rows) {
    if (!rows.length) {
      return '<div class="empty-results">No rows match the current selection.</div>';
    }
    const columns = tableColumns();
    return `
      <div class="results-table-wrap car-results-wrap">
        <table class="results-table car-data-table ${dimensionThemeClass()}">
          <colgroup>
            ${columns.map((column) => `<col${column.width ? ` style="width: ${escapeHtml(column.width)}"` : ""}>`).join("")}
          </colgroup>
          <thead>
            <tr>
              ${columns.map((column) => `<th class="${column.dimension ? "dimension-heading" : ""}">${escapeHtml(column.label)}</th>`).join("")}
            </tr>
          </thead>
          <tbody>
            ${rows.map((row) => `
              <tr>${columns.map((column) => cellMarkup(row.values[column.source], column)).join("")}</tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function cellMarkup(value, column) {
    const formatted = formatValue(value, column);
    if (!column.dimension) {
      return `<td>${escapeHtml(formatted)}</td>`;
    }
    return `<td class="dimension-cell"><strong>${escapeHtml(formatted || "-")}</strong></td>`;
  }

  function tableColumns() {
    const base = displayFieldOptions()
      .filter((field) => state.visibleFields.has(field.source))
      .filter((field) => state.headers.includes(field.source))
      .filter((field) => isPickupSelected() || !isPickupField(field.source));
    const dimensions = (state.viewConfig.dimensions[state.unit] || state.viewConfig.dimensions.imperial).fields
      .filter((field) => state.headers.includes(field.source))
      .map((field) => ({ ...field, numeric: true, dimension: true }));
    return [...base, ...dimensions];
  }

  function fillSortOptions() {
    const select = app.querySelector("[data-sort-field]");
    if (!select) return;
    const columns = tableColumns();
    select.innerHTML = `<option value="">默认顺序</option>${columns.map((column) => (
      `<option value="${escapeHtml(column.source)}"${column.source === state.sortField ? " selected" : ""}>${escapeHtml(column.label)}</option>`
    )).join("")}`;
  }

  function sortRows(rows) {
    if (!state.sortField) {
      return rows;
    }
    const direction = state.sortDirection === "desc" ? -1 : 1;
    return [...rows].sort((left, right) => compareValues(left.values[state.sortField], right.values[state.sortField]) * direction);
  }

  function compareValues(left, right) {
    const leftNumber = Number(left);
    const rightNumber = Number(right);
    if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
      return leftNumber - rightNumber;
    }
    return String(left || "").localeCompare(String(right || ""), undefined, { numeric: true });
  }

  function dimensionThemeClass() {
    const theme = state.dimensionTheme === "auto"
      ? (state.unit === "metric" ? "yellow" : "blue")
      : state.dimensionTheme;
    return `dimension-theme-${theme}`;
  }

  function displayFieldOptions() {
    return state.viewConfig.table_fields.filter((field) => state.headers.length === 0 || state.headers.includes(field.source));
  }

  function isPickupField(source) {
    return state.viewConfig.pickup_filters.some((field) => field.source === source);
  }

  function formatValue(value, column) {
    if (!column.numeric || value === "") return value;
    const numeric = Number(value);
    const scale = Number(column.scale || 1);
    return Number.isFinite(numeric) ? (numeric * (Number.isFinite(scale) ? scale : 1)).toFixed(1) : value;
  }

  function fillFilter(key, label, options, selectedValue) {
    const select = app.querySelector(`[data-filter="${cssEscape(key)}"]`);
    if (!select) return;
    select.innerHTML = `<option value="">${label}</option>${options.map((option) => (
      `<option value="${escapeHtml(option)}"${option === selectedValue ? " selected" : ""}>${escapeHtml(option)}</option>`
    )).join("")}`;
  }

  function updateUnitButtons() {
    app.querySelectorAll("[data-unit]").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.unit === state.unit);
    });
  }

  function isPickupSelected() {
    return state.type === state.viewConfig.pickup_type;
  }

  function parseTsv(text) {
    const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
    const headers = lines[0].split("\t").map(cleanField);
    const rows = lines.slice(1).map((line) => {
      const cells = line.split("\t");
      const row = {};
      headers.forEach((header, index) => {
        row[header] = cleanField(cells[index]);
      });
      return row;
    });
    return { headers, rows };
  }

  function parseViewYaml(text) {
    const result = { table_fields: [], pickup_filters: [], dimensions: { imperial: { fields: [] }, metric: { fields: [] } } };
    let section = "";
    let dimension = "";
    let listTarget = null;
    let currentItem = null;
    text.split(/\r?\n/).forEach((rawLine) => {
      const line = rawLine.replace(/\s+#.*$/, "");
      if (!line.trim()) return;
      const trimmed = line.trim();
      const indent = rawLine.search(/\S|$/);
      if (indent === 0 && trimmed.endsWith(":")) {
        section = trimmed.slice(0, -1);
        dimension = "";
        listTarget = Array.isArray(result[section]) ? result[section] : null;
        currentItem = null;
        return;
      }
      if (indent === 2 && section === "dimensions" && trimmed.endsWith(":")) {
        dimension = trimmed.slice(0, -1);
        result.dimensions[dimension] = result.dimensions[dimension] || { fields: [] };
        listTarget = null;
        currentItem = null;
        return;
      }
      if (indent === 4 && section === "dimensions" && dimension && trimmed === "fields:") {
        listTarget = result.dimensions[dimension].fields;
        currentItem = null;
        return;
      }
      if (trimmed.startsWith("- ")) {
        currentItem = {};
        if (listTarget) listTarget.push(currentItem);
        assignYamlValue(currentItem, trimmed.slice(2));
        return;
      }
      if (currentItem && trimmed.includes(":")) {
        assignYamlValue(currentItem, trimmed);
        return;
      }
      if (trimmed.includes(":")) {
        const [key, ...rest] = trimmed.split(":");
        const value = rest.join(":").trim();
        if (section === "dimensions" && dimension) {
          result.dimensions[dimension][key.trim()] = value;
        } else {
          result[key.trim()] = value;
        }
      }
    });
    return result;
  }

  function assignYamlValue(target, text) {
    const [key, ...rest] = text.split(":");
    if (!key || !rest.length) return;
    const value = rest.join(":").trim();
    target[key.trim()] = value === "false" ? false : value === "true" ? true : value;
  }

  function mergeViewConfig(fallback, parsed) {
    return {
      table_fields: normalizeFields(parsed.table_fields?.length ? parsed.table_fields : fallback.table_fields),
      dimensions: {
        imperial: {
          label: parsed.dimensions?.imperial?.label || fallback.dimensions.imperial.label,
          fields: normalizeFields(parsed.dimensions?.imperial?.fields?.length ? parsed.dimensions.imperial.fields : fallback.dimensions.imperial.fields)
        },
        metric: {
          label: parsed.dimensions?.metric?.label || fallback.dimensions.metric.label,
          fields: normalizeFields(parsed.dimensions?.metric?.fields?.length ? parsed.dimensions.metric.fields : fallback.dimensions.metric.fields)
        }
      },
      type_field: parsed.type_field || fallback.type_field,
      pickup_type: parsed.pickup_type || fallback.pickup_type,
      pickup_filters: normalizeFields(parsed.pickup_filters?.length ? parsed.pickup_filters : fallback.pickup_filters)
    };
  }

  function normalizeFields(fields) {
    return fields.map((field) => ({ ...field, visible: field.visible === false ? false : true }));
  }

  function unique(values) {
    return Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }

  function uniqueYears(rows) {
    const years = new Set();
    rows.forEach((row) => row.years.forEach((year) => years.add(year)));
    return Array.from(years).sort((a, b) => a - b).map(String);
  }

  function expandYears(value) {
    const text = String(value || "");
    const rangeMatch = text.match(/\b(19\d{2}|20\d{2})\s*[-–]\s*(19\d{2}|20\d{2})\b/);
    if (rangeMatch) {
      const start = Number(rangeMatch[1]);
      const end = Number(rangeMatch[2]);
      if (end >= start && end - start <= 150) {
        const years = [];
        for (let year = start; year <= end; year += 1) years.push(year);
        return years;
      }
    }
    return Array.from(new Set((text.match(/\b(?:19|20)\d{2}\b/g) || []).map(Number)));
  }

  function searchTokens(value) {
    return normalizeSearchText(value).split(/\s+/).filter(Boolean);
  }

  function normalizeSearchText(value) {
    return String(value || "").toLowerCase().replace(/[-_/|]+/g, " ").replace(/\s+/g, " ").trim();
  }

  function cleanField(value) {
    return String(value || "").replace(/^"|"$/g, "").replace(/\s+/g, " ").trim();
  }

  function cssEscape(value) {
    if (window.CSS && CSS.escape) return CSS.escape(value);
    return String(value).replace(/"/g, '\\"');
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  load();
})();
