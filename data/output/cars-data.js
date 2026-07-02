(function () {
  const config = window.CARS_DATA_VIEWER;
  const app = document.getElementById("app");

  if (!config || !app) {
    return;
  }

  const defaultViewConfig = {
    table_fields: [
      { source: "品牌", label: "MAKE", width: "126px" },
      { source: "前台车型", label: "MODEL", width: "150px" },
      { source: "主车型", label: "MAIN MODEL", visible: false, width: "170px" },
      { source: "代际", label: "GEN", width: "90px" },
      { source: "年份区间", label: "YEAR", width: "132px" },
      { source: "结构", label: "CONST", width: "132px" },
      { source: "版本", label: "VERSION", width: "150px" },
      { source: "分类", label: "CATEGORY", width: "110px" },
      { source: "驾驶室类型", label: "CAB", width: "120px" },
      { source: "货斗长度_ft", label: "BED", width: "118px" }
    ],
    dimensions: {
      imperial: {
        label: "英寸",
        fields: [
          { source: "length_in", label: "LENGTH (IN)", width: "118px" },
          { source: "width_in", label: "WIDTH (IN)", width: "112px" },
          { source: "height_in", label: "HEIGHT (IN)", width: "112px" }
        ]
      },
      metric: {
        label: "厘米",
        fields: [
          { source: "length_cm", label: "LENGTH (CM)", width: "118px" },
          { source: "width_cm", label: "WIDTH (CM)", width: "112px" },
          { source: "height_cm", label: "HEIGHT (CM)", width: "112px" }
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
    query: initialQuery(),
    brand: "",
    model: "",
    year: "",
    type: "",
    structure: "",
    gen: "",
    version: "",
    pickupFilters: {},
    dimensionFilters: {},
    openFilter: "",
    unit: "imperial",
    tableFont: "lg",
    sortField: "",
    sortDirection: "asc",
    columnWidths: {},
    fieldOrder: [],
    status: "loading",
    message: "Loading records..."
  };
  let sidebarCollapsed = false;
  let settingsOpen = false;
  const renderLimit = 500;
  const blankFilterValue = "__blank__";
  const hiddenByDefault = new Set(["开始年", "子车系"]);
  const dimensionSources = new Set([
    ...defaultViewConfig.dimensions.imperial.fields.map((field) => field.source),
    ...defaultViewConfig.dimensions.metric.fields.map((field) => field.source)
  ]);

  function initialQuery() {
    return new URLSearchParams(window.location.search).get("q") || "";
  }

  function render() {
    app.innerHTML = `
      <main class="viewer-main viewer-shell table-font-${state.tableFont}${sidebarCollapsed ? " is-sidebar-collapsed" : ""}">
        <aside class="viewer-side" aria-label="Page outline">
          <div class="sidebar-head">
            <button class="sidebar-toggle" type="button" aria-label="${sidebarCollapsed ? "展开侧栏" : "收起侧栏"}" aria-expanded="${sidebarCollapsed ? "false" : "true"}">
              <span>${sidebarCollapsed ? "›" : "‹"}</span>
            </button>
            <div class="sidebar-brand">
              <div class="root-label">二级页面</div>
              <div class="current-path">data/source</div>
            </div>
          </div>
          <nav class="sidebar-nav" aria-label="Pages">
            <a href="index.html" title="首页"><span class="nav-icon">首</span><span class="nav-label">首页</span></a>
            <a href="size-charts.html" title="Size Chart"><span class="nav-icon">S</span><span class="nav-label">Size Chart</span></a>
            <a href="size-ref.html" title="尺码参考"><span class="nav-icon">参</span><span class="nav-label">尺码参考</span></a>
            <a class="is-active" href="cars-data.html" title="车型三维"><span class="nav-icon">车</span><span class="nav-label">车型三维</span></a>
            <a href="size-chart.html" title="尺码配对"><span class="nav-icon">尺</span><span class="nav-label">尺码配对</span></a>
          </nav>
          <div class="sidebar-divider"></div>
          <div class="sidebar-context">
            <div class="root-label">Current</div>
            <div class="current-path">${escapeHtml(config.title)}</div>
            <p class="sidebar-description">按车型字段查找对应长宽高，并可跳转到尺码配对。</p>
          </div>
          <div class="sidebar-tools">
            ${carsControlsMarkup()}
          </div>
        </aside>
        <div class="viewer-content">
        <section class="search-panel" aria-label="Car data search">
          <div class="global-search">
            <label>
              <span>GLOBAL</span>
              <input class="global-search-input" type="search" value="${escapeHtml(state.query)}" placeholder="Search make, model, year, category, dimensions..." autocomplete="off" ${state.status === "loading" ? "disabled" : ""}>
            </label>
            <button class="search-reset" type="button">Reset</button>
          </div>
          <div class="search-summary" role="status"></div>
          <div class="search-results"></div>
        </section>
        ${carsSettingsModalMarkup()}
        </div>
      </main>
    `;

    bind();
    updateControls();
    updateResults();
  }

  function carsFilterControlsMarkup() {
    return `
      <div class="sidebar-filter-title">字段筛选</div>
      <div class="sidebar-filter-list">
        ${filterMarkup("分类", "type", "All types")}
        ${filterMarkup("品牌", "brand", "All brands")}
        ${filterMarkup("前台车型", "model", "All models")}
        ${filterMarkup("年份", "year", "All years")}
        ${filterMarkup("CONSTRUCT", "structure", "All constructs")}
      </div>
      <div class="sidebar-filter-list pickup-sidebar-filters${isPickupSelected() ? "" : " is-hidden"}">
        ${state.viewConfig.pickup_filters.map((field) => filterMarkup(field.label, `pickup:${field.source}`, `All ${field.label}`)).join("")}
      </div>
    `;
  }

  function carsControlsMarkup() {
    return `
          <div class="display-controls sidebar-controls">
            <button class="settings-launch" type="button" data-open-settings>表格设置</button>
            ${tableFontControlsMarkup(state.tableFont)}
            <div class="unit-toggle" role="group" aria-label="Dimension unit">
              <button type="button" class="${state.unit === "imperial" ? "is-active" : ""}" data-unit="imperial">${escapeHtml(state.viewConfig.dimensions.imperial.label)}</button>
              <button type="button" class="${state.unit === "metric" ? "is-active" : ""}" data-unit="metric">${escapeHtml(state.viewConfig.dimensions.metric.label)}</button>
            </div>
          </div>
    `;
  }

  function carsSettingsModalMarkup() {
    return `
      <div class="settings-overlay${settingsOpen ? " is-open" : ""}" data-settings-overlay>
        <section class="settings-dialog" role="dialog" aria-modal="true" aria-label="表格设置">
          <div class="settings-dialog-header">
            <div>
              <h3>表格设置</h3>
              <p>显示字段和排序</p>
            </div>
            <button type="button" class="settings-close" data-close-settings aria-label="关闭">×</button>
          </div>
          <div class="settings-dialog-body">
            <section class="settings-block">
              <h4>显示字段</h4>
              <div class="field-menu-panel settings-field-list">
                <div class="field-menu-heading">
                  <span>字段</span>
                  <span>顺序</span>
                </div>
                ${displayFieldOptions().map((field) => `
                  <div class="field-option">
                    <label>
                      <input type="checkbox" data-field-toggle value="${escapeHtml(field.source)}" ${state.visibleFields.has(field.source) ? "checked" : ""}>
                      <span>${escapeHtml(field.label)}</span>
                    </label>
                    <div class="field-order-actions">
                      <button type="button" data-move-field="${escapeHtml(field.source)}" data-move-direction="-1" title="上移">↑</button>
                      <button type="button" data-move-field="${escapeHtml(field.source)}" data-move-direction="1" title="下移">↓</button>
                    </div>
                  </div>
                `).join("")}
              </div>
            </section>
            <section class="settings-block">
              <h4>排序</h4>
              <div class="settings-sort-row">
                <label class="sort-control">
                  <span>排序字段</span>
                  <select class="search-select" data-sort-field ${state.status === "loading" ? "disabled" : ""}>
                    <option value="">默认顺序</option>
                  </select>
                </label>
                <button class="sort-direction" type="button" data-sort-direction title="切换排序方向">${state.sortDirection === "asc" ? "↑" : "↓"}</button>
              </div>
            </section>
          </div>
        </section>
      </div>
    `;
  }

  function tableFontControlsMarkup(current) {
    return `
      <details class="font-menu">
        <summary>字体</summary>
        <div class="font-menu-panel" role="group" aria-label="表格字体大小">
          ${["sm", "md", "lg"].map((size) => `<button type="button" class="${current === size ? "is-active" : ""}" data-table-font="${size}">${fontSizeLabel(size)}</button>`).join("")}
        </div>
      </details>
    `;
  }

  function fontSizeLabel(size) {
    return ({ sm: "紧凑", md: "标准", lg: "偏大" })[size] || size;
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
    app.querySelector(".sidebar-toggle").addEventListener("click", () => {
      sidebarCollapsed = !sidebarCollapsed;
      render();
    });

    app.querySelectorAll("[data-open-settings]").forEach((button) => {
      button.addEventListener("click", () => {
        settingsOpen = true;
        render();
      });
    });

    app.querySelectorAll("[data-table-font]").forEach((button) => {
      button.addEventListener("click", () => {
        state.tableFont = button.dataset.tableFont;
        render();
      });
    });

    app.querySelectorAll("[data-close-settings]").forEach((button) => {
      button.addEventListener("click", () => {
        settingsOpen = false;
        render();
      });
    });

    app.querySelectorAll("[data-settings-overlay]").forEach((overlay) => {
      overlay.addEventListener("click", (event) => {
        if (event.target === overlay) {
          settingsOpen = false;
          render();
        }
      });
    });

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
        } else if (key === "gen") {
          state.gen = select.value;
        } else if (key === "version") {
          state.version = select.value;
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
        state.dimensionFilters = {};
        updateResults();
        updateUnitButtons();
      });
    });

    app.querySelectorAll("[data-field-toggle]").forEach((checkbox) => {
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) {
          state.visibleFields.add(checkbox.value);
        } else {
          state.visibleFields.delete(checkbox.value);
        }
        updateResults();
      });
    });

    app.querySelectorAll("[data-move-field]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.preventDefault();
        moveField(button.dataset.moveField, Number(button.dataset.moveDirection));
        render();
      });
    });

    const sortField = app.querySelector("[data-sort-field]");
    if (sortField) {
      sortField.addEventListener("change", (event) => {
        state.sortField = event.target.value;
        updateResults();
      });
    }

    const sortDirection = app.querySelector("[data-sort-direction]");
    if (sortDirection) {
      sortDirection.addEventListener("click", () => {
        state.sortDirection = state.sortDirection === "asc" ? "desc" : "asc";
        sortDirection.textContent = state.sortDirection === "asc" ? "↑" : "↓";
        updateResults();
      });
    }

    app.querySelector(".search-reset").addEventListener("click", () => {
      state.query = "";
      state.brand = "";
      state.model = "";
      state.year = "";
      state.type = "";
      state.structure = "";
      state.gen = "";
      state.version = "";
      state.pickupFilters = {};
      state.dimensionFilters = {};
      state.openFilter = "";
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
      }
      const parsed = parseTsv(await dataResponse.text());
      state.headers = parsed.headers;
      initializeFieldState();
      state.rows = parsed.rows.map((row) => {
        const years = expandYears(row["年份区间"] || row["开始年"]);
        return {
          values: row,
          years,
          searchText: `${Object.values(row).join(" ")} ${years.join(" ")}`
        };
      });
      state.status = "ready";
      state.message = `全量车型数据：已索引 ${formatCount(state.rows.length)} 条记录。`;
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
    fillFilter("gen", "All gens", unique(modelRows.map((row) => row.values["代际"])), state.gen);
    fillFilter("structure", "All constructs", unique(modelRows.flatMap(structureAtoms)), state.structure);
    const structureRows = modelRows.filter((row) => !state.structure || structureAtoms(row).includes(state.structure));
    fillFilter("version", "All versions", uniqueWithBlank(structureRows.map((row) => row.values["版本"])), state.version);

    if (isPickupSelected()) {
      state.viewConfig.pickup_filters.forEach((field) => {
        fillFilter(`pickup:${field.source}`, `All ${field.label}`, unique(modelRows.flatMap((row) => fieldAtoms(row.values[field.source]))), state.pickupFilters[field.source] || "");
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
    const hasFilter = state.query.trim() || state.brand || state.model || state.year || state.type || state.structure || state.gen || state.version || Object.values(state.pickupFilters).some(Boolean) || hasDimensionFilters();
    const sortedRows = sortRows(matches);
    const visibleRows = sortedRows.slice(0, renderLimit);
    const cappedText = sortedRows.length > visibleRows.length ? `，当前显示前 ${formatCount(visibleRows.length)} 条。` : "。";
    summary.textContent = hasFilter
      ? `匹配结果：${formatCount(matches.length)} 条记录${cappedText}`
      : `全量车型数据：已索引 ${formatCount(matches.length)} 条记录，当前显示前 ${formatCount(visibleRows.length)} 条。`;
    results.innerHTML = renderTable(visibleRows);
    bindColumnResizers();
    bindLinkedRows();
    bindHeaderFilterPopovers();
    updateControls();
    bindTableFilters();
    bindDimensionRangeFilters();
  }

  function bindTableFilters() {
    app.querySelectorAll("[data-filter]").forEach((select) => {
      if (select.dataset.bound === "true") return;
      select.dataset.bound = "true";
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
        } else if (key === "structure") {
          state.structure = select.value;
        } else if (key === "gen") {
          state.gen = select.value;
        } else if (key === "version") {
          state.version = select.value;
        } else if (key.startsWith("pickup:")) {
          state.pickupFilters[key.slice("pickup:".length)] = select.value;
        }
        updateControls();
        updateResults();
      });
    });
  }

  function bindDimensionRangeFilters() {
    app.querySelectorAll("[data-range-filter]").forEach((container) => {
      if (container.dataset.bound === "true") return;
      container.dataset.bound = "true";
      container.querySelectorAll("input").forEach((input) => {
        input.addEventListener("input", () => {
          syncRangeInputs(container, input.dataset.rangeRole, input.value);
        });
        input.addEventListener("change", () => {
          syncRangeInputs(container, input.dataset.rangeRole, input.value);
          updateDimensionRange(container, input.dataset.rangeRole, input.value);
        });
      });
    });
  }

  function syncRangeInputs(container, role, value) {
    container.querySelectorAll(`[data-range-role="${cssEscape(role)}"]`).forEach((input) => {
      input.value = value;
    });
  }

  function updateDimensionRange(container, changedRole, changedValue) {
    const field = container.dataset.rangeFilter;
    const extent = {
      min: Number(container.dataset.rangeMin),
      max: Number(container.dataset.rangeMax)
    };
    const minInputs = container.querySelectorAll('[data-range-role="min"]');
    const maxInputs = container.querySelectorAll('[data-range-role="max"]');
    let min = Number(changedRole === "min" ? changedValue : minInputs[0]?.value);
    let max = Number(changedRole === "max" ? changedValue : maxInputs[0]?.value);
    if (!Number.isFinite(min)) min = extent.min;
    if (!Number.isFinite(max)) max = extent.max;
    min = clampNumber(min, extent.min, extent.max);
    max = clampNumber(max, extent.min, extent.max);
    if (min > max) {
      if (changedRole === "min") {
        max = min;
      } else {
        min = max;
      }
    }
    if (min <= extent.min && max >= extent.max) {
      delete state.dimensionFilters[field];
    } else {
      state.dimensionFilters[field] = { min, max };
    }
    updateResults();
  }

  function bindLinkedRows() {
    app.querySelectorAll(".linked-result-row").forEach((row) => {
      row.addEventListener("click", (event) => {
        if (event.target.closest("a, button, input, select, .col-resizer")) return;
        const href = row.dataset.rowLink;
        if (href) {
          window.location.href = href;
        }
      });
    });
  }

  function getMatches() {
    const query = parseSearchQuery(state.query);
    return state.rows.filter((row) => {
      if (state.type && row.values[state.viewConfig.type_field] !== state.type) return false;
      if (state.brand && row.values["品牌"] !== state.brand) return false;
      if (state.model && row.values["前台车型"] !== state.model) return false;
      if (state.year && !row.years.includes(Number(state.year))) return false;
      if (query.years.length && !queryYearsMatch(row, query.years)) return false;
      if (state.gen && row.values["代际"] !== state.gen) return false;
      if (state.structure && !structureAtoms(row).includes(state.structure)) return false;
      if (state.version === blankFilterValue && cleanField(row.values["版本"])) return false;
      if (state.version && state.version !== blankFilterValue && row.values["版本"] !== state.version) return false;
      for (const [field, value] of Object.entries(state.pickupFilters)) {
        if (value && !fieldAtoms(row.values[field]).includes(value)) return false;
      }
      for (const [field, range] of Object.entries(state.dimensionFilters)) {
        if (!range || !isRangeActive(field, range)) continue;
        const value = Number(row.values[field]);
        if (!Number.isFinite(value) || value < range.min || value > range.max) return false;
      }
      return !query.tokens.length || query.tokens.every((token) => normalizeSearchText(row.searchText).includes(token));
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
            ${columns.map((column) => {
              const width = state.columnWidths[column.source] || column.width;
              return `<col data-col-source="${escapeHtml(column.source)}"${width ? ` style="width: ${escapeHtml(width)}"` : ""}>`;
            }).join("")}
          </colgroup>
          <thead>
            <tr>
              ${columns.map((column) => `
                <th class="${column.dimension ? "dimension-heading dimension-sticky" : ""}${state.openFilter === column.source ? " is-filter-open" : ""}" data-col-source="${escapeHtml(column.source)}"${dimensionStickyStyle(columns, column)}>
                  ${headerLabelMarkup(column)}
                  ${carsHeaderFilterMarkup(column)}
                  <span class="col-resizer" data-col-source="${escapeHtml(column.source)}" title="拖动调整列宽" aria-hidden="true"></span>
                </th>
              `).join("")}
            </tr>
          </thead>
          <tbody>
            ${rows.map((row) => `
              <tr class="linked-result-row" data-row-link="${escapeHtml(carsToSizeLink(row))}" title="点击后到尺码配对搜索这行车型">${columns.map((column) => cellMarkup(row.values[column.source], column, columns)).join("")}</tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function carsHeaderFilterMarkup(column) {
    if (state.openFilter !== column.source) return "";
    if (column.dimension) {
      return `<div class="header-filter-popover header-filter-popover-wide">${dimensionRangeFilterMarkup(column)}</div>`;
    }
    const field = columnFilterKey(column);
    if (!field) return "";
    return `
      <div class="header-filter-popover">
        <select class="header-filter-select" data-filter="${escapeHtml(field)}" title="筛选 ${escapeHtml(column.label)}" ${state.status === "loading" ? "disabled" : ""}>
          <option value="">All</option>
        </select>
      </div>
    `;
  }

  function headerLabelMarkup(column) {
    const filterable = column.dimension || columnFilterKey(column);
    if (!filterable) {
      return `<span class="th-label">${escapeHtml(column.label)}</span>`;
    }
    return `
      <button class="th-label th-filter-trigger${isColumnFilterActive(column) ? " is-filtered" : ""}" type="button" data-open-filter="${escapeHtml(column.source)}" title="筛选 ${escapeHtml(column.label)}">
        ${escapeHtml(column.label)}
      </button>
    `;
  }

  function columnFilterKey(column) {
    const mapping = {
      [state.viewConfig.type_field]: "type",
      "品牌": "brand",
      "前台车型": "model",
      "代际": "gen",
      "年份区间": "year",
      "结构": "structure",
      "版本": "version",
      "驾驶室类型": "pickup:驾驶室类型",
      "货斗长度_ft": "pickup:货斗长度_ft"
    };
    return mapping[column.source] || "";
  }

  function isColumnFilterActive(column) {
    if (column.dimension) {
      return isRangeActive(column.source, state.dimensionFilters[column.source]);
    }
    const key = columnFilterKey(column);
    if (!key) return false;
    if (key.startsWith("pickup:")) {
      return Boolean(state.pickupFilters[key.slice("pickup:".length)]);
    }
    return Boolean(state[key]);
  }

  function bindHeaderFilterPopovers() {
    app.querySelectorAll("[data-open-filter]").forEach((button) => {
      if (button.dataset.bound === "true") return;
      button.dataset.bound = "true";
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        state.openFilter = state.openFilter === button.dataset.openFilter ? "" : button.dataset.openFilter;
        updateResults();
      });
    });
    app.querySelectorAll("th.is-filter-open").forEach((cell) => {
      if (cell.dataset.hoverBound === "true") return;
      cell.dataset.hoverBound = "true";
      cell.addEventListener("mouseleave", () => {
        if (cell.contains(document.activeElement)) return;
        state.openFilter = "";
        updateResults();
      });
      cell.addEventListener("focusout", () => {
        window.setTimeout(() => {
          if (cell.matches(":hover") || cell.contains(document.activeElement)) return;
          state.openFilter = "";
          updateResults();
        }, 0);
      });
    });
  }

  function dimensionRangeFilterMarkup(column) {
    const extent = dimensionExtent(column.source);
    if (!extent) return "";
    const range = state.dimensionFilters[column.source] || extent;
    const min = clampNumber(range.min, extent.min, extent.max);
    const max = clampNumber(range.max, extent.min, extent.max);
    return `
      <div class="header-range-filter" data-range-filter="${escapeHtml(column.source)}" data-range-min="${extent.min}" data-range-max="${extent.max}">
        <div class="range-inputs">
          <input type="number" data-range-role="min" min="${extent.min}" max="${extent.max}" step="0.1" value="${formatRangeValue(min)}" title="最小值">
          <input type="number" data-range-role="max" min="${extent.min}" max="${extent.max}" step="0.1" value="${formatRangeValue(max)}" title="最大值">
        </div>
        <div class="range-sliders">
          <input type="range" data-range-role="min" min="${extent.min}" max="${extent.max}" step="0.1" value="${formatRangeValue(min)}">
          <input type="range" data-range-role="max" min="${extent.min}" max="${extent.max}" step="0.1" value="${formatRangeValue(max)}">
        </div>
      </div>
    `;
  }

  function cellMarkup(value, column, columns) {
    const formatted = formatValue(value, column);
    if (!column.dimension) {
      return `<td>${escapeHtml(formatted)}</td>`;
    }
    return `<td class="dimension-cell dimension-sticky"${dimensionStickyStyle(columns, column)}><strong>${escapeHtml(formatted || "-")}</strong></td>`;
  }

  function dimensionStickyStyle(columns, column) {
    if (!column.dimension) return "";
    const dimensionColumns = columns.filter((item) => item.dimension);
    const index = dimensionColumns.findIndex((item) => item.source === column.source);
    if (index < 0) return "";
    const right = dimensionColumns.slice(index + 1).reduce((sum, item) => sum + columnWidthNumber(item), 0);
    return ` style="right: ${right}px"`;
  }

  function columnWidthNumber(column) {
    const width = state.columnWidths[column.source] || column.width || "112px";
    const parsed = Number.parseFloat(width);
    return Number.isFinite(parsed) ? parsed : 112;
  }

  function carsToSizeLink(row) {
    return `size-chart.html?q=${encodeURIComponent(carsLinkQuery(row))}`;
  }

  function carsLinkQuery(row) {
    const values = row.values;
    return uniqueInOrder([
      values["品牌"],
      values["前台车型"],
      linkYear(values["年份区间"] || values["开始年"], state.year),
      values["结构"],
      values["版本"],
      values["驾驶室类型"],
      values["货斗长度_ft"]
    ].map(cleanField)).join(" ");
  }

  function linkYear(yearText, selectedYear) {
    return selectedYear || cleanField(yearText);
  }

  function bindColumnResizers() {
    const table = app.querySelector(".car-data-table");
    if (!table) return;
    table.querySelectorAll(".col-resizer").forEach((handle) => {
      handle.addEventListener("pointerdown", (event) => {
        const source = handle.dataset.colSource;
        const col = table.querySelector(`col[data-col-source="${cssEscape(source)}"]`);
        if (!col) return;
        event.preventDefault();
        const startX = event.clientX;
        const startWidth = col.getBoundingClientRect().width || 96;
        document.body.classList.add("is-resizing-column");

        const onPointerMove = (moveEvent) => {
          const width = Math.max(56, Math.round(startWidth + moveEvent.clientX - startX));
          state.columnWidths[source] = `${width}px`;
          col.style.width = state.columnWidths[source];
        };

        const stopResize = () => {
          document.body.classList.remove("is-resizing-column");
          document.removeEventListener("pointermove", onPointerMove);
          document.removeEventListener("pointerup", stopResize);
          document.removeEventListener("pointercancel", stopResize);
          updateResults();
        };

        document.addEventListener("pointermove", onPointerMove);
        document.addEventListener("pointerup", stopResize);
        document.addEventListener("pointercancel", stopResize);
      });
    });
  }

  function tableColumns() {
    const columns = displayFieldOptions()
      .filter((field) => state.visibleFields.has(field.source))
      .filter((field) => state.headers.includes(field.source))
      .filter((field) => isPickupSelected() || !isPickupField(field.source));
    return [...columns.filter((field) => !field.dimension), ...columns.filter((field) => field.dimension)];
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

  function dimensionExtent(source) {
    const values = state.rows
      .map((row) => Number(row.values[source]))
      .filter((value) => Number.isFinite(value));
    if (!values.length) return null;
    return {
      min: Math.floor(Math.min(...values) * 10) / 10,
      max: Math.ceil(Math.max(...values) * 10) / 10
    };
  }

  function hasDimensionFilters() {
    return Object.entries(state.dimensionFilters).some(([field, range]) => isRangeActive(field, range));
  }

  function isRangeActive(field, range) {
    const extent = dimensionExtent(field);
    if (!extent || !range) return false;
    return range.min > extent.min || range.max < extent.max;
  }

  function clampNumber(value, min, max) {
    return Math.min(max, Math.max(min, Number(value)));
  }

  function formatRangeValue(value) {
    return Number(value).toFixed(1);
  }

  function formatCount(value) {
    return new Intl.NumberFormat("en-US").format(value);
  }

  function dimensionThemeClass() {
    const theme = state.unit === "metric" ? "yellow" : "blue";
    return `dimension-theme-${theme}`;
  }

  function displayFieldOptions() {
    const fields = allDisplayFields();
    return sortFields(fields).filter((field) => state.headers.length === 0 || state.headers.includes(field.source));
  }

  function allDisplayFields() {
    const configuredSources = new Set();
    const tableFields = state.viewConfig.table_fields.map((field) => {
      configuredSources.add(field.source);
      return { ...field, dimension: false, numeric: false };
    });
    const currentDimensions = (state.viewConfig.dimensions[state.unit] || state.viewConfig.dimensions.imperial).fields
      .map((field) => ({ ...field, numeric: true, dimension: true }));
    const activeDimensionSources = new Set(currentDimensions.map((field) => field.source));
    const allDimensionSources = new Set([
      ...Object.values(state.viewConfig.dimensions).flatMap((dimension) => (dimension.fields || []).map((field) => field.source)),
      ...dimensionSources
    ]);
    const extraFields = state.headers
      .filter((header) => !configuredSources.has(header) && !allDimensionSources.has(header) && !activeDimensionSources.has(header))
      .map((source) => ({
        source,
        label: source,
        visible: !hiddenByDefault.has(source),
        dimension: false,
        numeric: false
      }));
    return [...tableFields, ...extraFields, ...currentDimensions];
  }

  function sortFields(fields) {
    const order = new Map(state.fieldOrder.map((source, index) => [source, index]));
    return [...fields].sort((left, right) => {
      const leftIndex = order.has(left.source) ? order.get(left.source) : Number.MAX_SAFE_INTEGER;
      const rightIndex = order.has(right.source) ? order.get(right.source) : Number.MAX_SAFE_INTEGER;
      return leftIndex - rightIndex;
    });
  }

  function initializeFieldState() {
    const configuredSources = new Set(state.viewConfig.table_fields.map((field) => field.source));
    const allDimensionSources = new Set(Object.values(state.viewConfig.dimensions).flatMap((dimension) => (dimension.fields || []).map((field) => field.source)));
    const extraFields = state.headers
      .filter((header) => !configuredSources.has(header) && !allDimensionSources.has(header))
      .map((source) => ({ source, label: source, visible: !hiddenByDefault.has(source) }));
    const dimensionFields = Object.values(state.viewConfig.dimensions).flatMap((dimension) => dimension.fields || []);
    const fields = [...state.viewConfig.table_fields, ...extraFields, ...dimensionFields];
    state.fieldOrder = fields.map((field) => field.source);
    state.visibleFields = new Set(fields.filter((field) => field.visible !== false && !hiddenByDefault.has(field.source)).map((field) => field.source));
  }

  function moveField(source, direction) {
    const ordered = displayFieldOptions().map((field) => field.source);
    const index = ordered.indexOf(source);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= ordered.length) return;
    const [item] = ordered.splice(index, 1);
    ordered.splice(nextIndex, 0, item);
    const orderedSet = new Set(ordered);
    state.fieldOrder = [...ordered, ...state.fieldOrder.filter((field) => !orderedSet.has(field))];
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
    select.innerHTML = `<option value="">${escapeHtml(label)}</option>${options.map((option) => {
      const value = option === blankFilterValue ? blankFilterValue : option;
      const text = option === blankFilterValue ? "(空)" : option;
      return `<option value="${escapeHtml(value)}"${value === selectedValue ? " selected" : ""}>${escapeHtml(text)}</option>`;
    }).join("")}`;
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

  function uniqueWithBlank(values) {
    const hasBlank = values.some((value) => !cleanField(value));
    const options = unique(values);
    return hasBlank ? [blankFilterValue, ...options] : options;
  }

  function uniqueInOrder(values) {
    const result = [];
    values.filter(Boolean).forEach((value) => {
      if (!result.includes(value)) {
        result.push(value);
      }
    });
    return result;
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

  function structureAtoms(row) {
    const value = cleanField(row.values["结构"]);
    return fieldAtoms(value);
  }

  function fieldAtoms(value) {
    const text = cleanField(value);
    if (!text) return [];
    return Array.from(new Set(text.split(/\s*(?:\/|,|;|\||\+|&)\s*/).map(cleanField).filter(Boolean)));
  }

  function parseSearchQuery(value) {
    let text = String(value || "");
    const years = new Set();
    text = text.replace(/\b(19\d{2}|20\d{2})\s*[-–]\s*(19\d{2}|20\d{2})\b/g, (match, startText, endText) => {
      const start = Number(startText);
      const end = Number(endText);
      if (end >= start && end - start <= 150) {
        for (let year = start; year <= end; year += 1) years.add(year);
      } else {
        years.add(start);
        years.add(end);
      }
      return " ";
    });
    text = text.replace(/\b(19\d{2}|20\d{2})\b/g, (match) => {
      years.add(Number(match));
      return " ";
    });
    return {
      tokens: searchTokens(text),
      years: Array.from(years)
    };
  }

  function queryYearsMatch(row, years) {
    if (!years.length) return true;
    const rowYears = row.years && row.years.length ? row.years : expandYears(row.values["年份区间"] || row.values["开始年"]);
    return years.some((year) => rowYears.includes(year));
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
