(function () {
  const config = window.SIZE_CHART_VIEWER;
  const app = document.getElementById("app");

  if (!config || !app) {
    return;
  }

  const directories = config.directories || [];
  const pageMode = config.pageMode || "search";
  const defaultViewConfig = {
    filters: {
      construct: { label: "CONSTRUCT", empty_label: "All constructs", source: "CONST", atomize: true },
      cab: { label: "CAB", empty_label: "All cabs", source: "CAB", atomize: true },
      bed: { label: "BED", empty_label: "All beds", source: "BED", atomize: true }
    },
    table_fields: {
      const: { label: "CONST", source: "CONST" },
      cab: { label: "CAB", source: "CAB" },
      bed: { label: "BED", source: "BED" }
    }
  };
  let activeChartSelection = "all";
  let sidebarCollapsed = false;
  let settingsOpen = false;
  let viewConfig = defaultViewConfig;
  const frameStates = new Map();
  const directoryIndexes = new Map();
  const directoryMetadata = new Map();
  const tsvIndexes = new Map();
  const searchState = {
    scopeKey: "",
    records: [],
    columns: [],
    query: "",
    selectedSource: "",
    selectedMake: "",
    selectedModel: "",
    selectedYear: "",
    selectedConstruct: "",
    selectedCab: "",
    selectedBed: "",
    columnWidths: {},
    visibleColumns: null,
    fieldOrder: [],
    sortField: "",
    sortDirection: "asc",
    status: "idle",
    message: ""
  };
  let searchLoadToken = 0;
  let frameSearchTimer = 0;

  function pagePath(directory, file) {
    return `${config.basePath}${directory.name}/${file}`;
  }

  function chartDirectories() {
    if (activeChartSelection === "all") {
      return directories;
    }
    if (activeChartSelection.startsWith("source:")) {
      const source = activeChartSelection.slice("source:".length);
      return directories.filter((directory) => topSource(directory.name) === source);
    }
    if (activeChartSelection.startsWith("dir:")) {
      const name = activeChartSelection.slice("dir:".length);
      return directories.filter((directory) => directory.name === name);
    }
    return directories;
  }

  function chartSelectionLabel() {
    if (activeChartSelection === "all") {
      return "All";
    }
    if (activeChartSelection.startsWith("source:")) {
      return activeChartSelection.slice("source:".length);
    }
    if (activeChartSelection.startsWith("dir:")) {
      return activeChartSelection.slice("dir:".length);
    }
    return config.rootLabel;
  }

  function chartOutlineMarkup() {
    const sources = [];
    directories.forEach((directory) => {
      const source = topSource(directory.name);
      if (source && !sources.includes(source)) {
        sources.push(source);
      }
    });

    return `
      <ol class="chart-outline-list">
        <li>
          <button class="chart-outline-node${activeChartSelection === "all" ? " is-active" : ""}" type="button" data-chart-scope="all">
            <span class="chart-outline-dot"></span>
            <span>All</span>
          </button>
        </li>
        ${sources.map((source) => {
        const children = directories.filter((directory) => topSource(directory.name) === source);
          return `
            <li>
              <button class="chart-outline-node${activeChartSelection === `source:${source}` ? " is-active" : ""}" type="button" data-chart-scope="source:${escapeHtml(source)}">
                <span class="chart-outline-dot"></span>
                <span>${escapeHtml(source)}</span>
              </button>
              <ol class="chart-outline-list chart-outline-children">
                ${children.map((directory) => {
            const value = `dir:${directory.name}`;
                  return `
                    <li>
                      <button class="chart-outline-node chart-outline-leaf${activeChartSelection === value ? " is-active" : ""}" type="button" data-chart-scope="${escapeHtml(value)}">
                        <span class="chart-outline-dot"></span>
                        <span>${escapeHtml(directoryLeaf(directory.name))}</span>
                      </button>
                    </li>
                  `;
                }).join("")}
              </ol>
            </li>
          `;
        }).join("")}
      </ol>
    `;
  }

  function directoryLeaf(directoryName) {
    const parts = String(directoryName || "").split(/[\\/]/);
    return parts[parts.length - 1] || directoryName;
  }

  function chartFileCount(scopeDirectories) {
    return scopeDirectories.reduce((total, directory) => total + directory.files.length, 0);
  }

  function render() {
    const selectedChartDirectories = chartDirectories();
    const selectedChartLabel = chartSelectionLabel();
    const selectedChartFileCount = chartFileCount(selectedChartDirectories);
    const isSearchPage = pageMode !== "charts";
    app.innerHTML = `
      <main class="viewer-main viewer-shell${sidebarCollapsed ? " is-sidebar-collapsed" : ""}">
        <aside class="viewer-side" aria-label="Page outline">
          <div class="sidebar-head">
            <button class="sidebar-toggle" type="button" aria-label="${sidebarCollapsed ? "展开侧栏" : "收起侧栏"}" aria-expanded="${sidebarCollapsed ? "false" : "true"}">
              <span>${sidebarCollapsed ? "›" : "‹"}</span>
            </button>
            <div class="sidebar-brand">
              <div class="root-label">二级页面</div>
              <div class="current-path">${config.rootLabel}</div>
            </div>
          </div>
          <nav class="sidebar-nav" aria-label="Pages">
            <a href="index.html" title="首页"><span class="nav-icon">H</span><span class="nav-label">首页</span></a>
            <a class="${isSearchPage ? "is-active" : ""}" href="size-chart.html" title="查尺码配对"><span class="nav-icon">S</span><span class="nav-label">查尺码配对</span></a>
            <a class="${!isSearchPage ? "is-active" : ""}" href="size-charts.html" title="看尺码表"><span class="nav-icon">P</span><span class="nav-label">看尺码表</span></a>
            <a href="cars-data.html" title="查车型数据"><span class="nav-icon">C</span><span class="nav-label">查车型数据</span></a>
          </nav>
          <div class="sidebar-divider"></div>
          <div class="sidebar-context">
            <div class="root-label">Current</div>
            <div class="current-path">${isSearchPage ? "查尺码配对" : "看尺码表"}</div>
          </div>
          ${isSearchPage ? `
            <div class="sidebar-filters" aria-label="Search filters">
              ${sizeFilterControlsMarkup()}
            </div>
          ` : ""}
          ${!isSearchPage ? `
            <nav class="sidebar-outline" aria-label="Size chart outline">
              <div class="chart-outline" aria-label="Size chart folders">
                ${chartOutlineMarkup()}
              </div>
            </nav>
          ` : ""}
          ${isSearchPage ? `
            <div class="sidebar-tools">
              <button class="settings-launch" type="button" data-open-settings>表格设置</button>
            </div>
          ` : ""}
        </aside>
        <div class="viewer-content">
        ${isSearchPage ? `
        <section class="search-panel" aria-label="Size chart search">
          <div class="search-header">
            <div>
              <h2>Search Size</h2>
              <p>All folders</p>
            </div>
            <button class="search-reset" type="button">Reset</button>
          </div>
          <div class="global-search">
            <label>
              <span>GLOBAL</span>
              <input class="global-search-input" type="search" value="${escapeHtml(searchState.query)}" placeholder="Search nonpick, pick, 宏能图, TM, make, model, type, size, year..." autocomplete="off">
            </label>
          </div>
          <div class="search-summary" role="status"></div>
          <div class="search-results"></div>
        </section>
        ${sizeSettingsModalMarkup()}
        ` : `
        <section class="page-stack size-charts-panel" aria-label="看尺码表">
          <div class="size-charts-header">
            <div>
              <h2>看尺码表</h2>
              <p>${selectedChartLabel} · ${selectedChartFileCount} HTML</p>
            </div>
          </div>
          <div class="page-card-list">
            ${selectedChartDirectories.flatMap((directory) => directory.files.map((file) => `
              <article class="page-card">
                <div class="page-card-header">
                  <div class="page-name">${directory.name}/${file}</div>
                  <a class="open-link" href="${pagePath(directory, file)}">打开</a>
                </div>
                <div class="frame-shell">
                  <iframe class="page-frame" title="${directory.name}/${file}" src="${pagePath(directory, file)}"></iframe>
                </div>
              </article>
            `)).join("")}
          </div>
        </section>
        `}
        </div>
      </main>
    `;

    bind();
    if (isSearchPage) {
      updateSearchControls();
      updateSearchResults();
      loadSearchIndex(currentSearchDirectories());
    } else {
      resizeFrames();
    }
  }

  function sizeFilterControlsMarkup() {
    return `
      <div class="sidebar-filter-title">字段筛选</div>
      <div class="sidebar-filter-list">
        <label>
          <span>SOURCE</span>
          <select class="search-select" data-search-field="source" ${searchState.status === "loading" ? "disabled" : ""}>
            <option value="">All sources</option>
          </select>
        </label>
        <label>
          <span>MAKE</span>
          <select class="search-select" data-search-field="make" ${searchState.status === "loading" ? "disabled" : ""}>
            <option value="">All makes</option>
          </select>
        </label>
        <label>
          <span>MODEL</span>
          <select class="search-select" data-search-field="model" ${searchState.status === "loading" ? "disabled" : ""}>
            <option value="">All models</option>
          </select>
        </label>
        <label>
          <span>YEAR</span>
          <select class="search-select" data-search-field="year" ${searchState.status === "loading" ? "disabled" : ""}>
            <option value="">All years</option>
          </select>
        </label>
        <label>
          <span>${escapeHtml(filterConfig("construct").label)}</span>
          <select class="search-select" data-search-field="construct" ${searchState.status === "loading" ? "disabled" : ""}>
            <option value="">${escapeHtml(filterConfig("construct").empty_label)}</option>
          </select>
        </label>
        <label>
          <span>${escapeHtml(filterConfig("cab").label)}</span>
          <select class="search-select" data-search-field="cab" ${searchState.status === "loading" ? "disabled" : ""}>
            <option value="">${escapeHtml(filterConfig("cab").empty_label)}</option>
          </select>
        </label>
        <label>
          <span>${escapeHtml(filterConfig("bed").label)}</span>
          <select class="search-select" data-search-field="bed" ${searchState.status === "loading" ? "disabled" : ""}>
            <option value="">${escapeHtml(filterConfig("bed").empty_label)}</option>
          </select>
        </label>
      </div>
    `;
  }

  function sizeSettingsModalMarkup() {
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
                ${sizeDisplayFields().map((field) => `
                  <div class="field-option">
                    <label>
                      <input type="checkbox" data-size-field-toggle value="${escapeHtml(field.key)}" ${isSizeColumnVisible(field.key) ? "checked" : ""}>
                      <span>${escapeHtml(field.label)}</span>
                    </label>
                    <div class="field-order-actions">
                      <button type="button" data-size-move-field="${escapeHtml(field.key)}" data-move-direction="-1" title="上移">↑</button>
                      <button type="button" data-size-move-field="${escapeHtml(field.key)}" data-move-direction="1" title="下移">↓</button>
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
                  <select class="search-select" data-size-sort-field ${searchState.status === "loading" ? "disabled" : ""}>
                    <option value="">默认顺序</option>
                    ${sizeDisplayFields().map((field) => `<option value="${escapeHtml(field.key)}"${searchState.sortField === field.key ? " selected" : ""}>${escapeHtml(field.label)}</option>`).join("")}
                  </select>
                </label>
                <button class="sort-direction" type="button" data-size-sort-direction title="切换排序方向">${searchState.sortDirection === "asc" ? "↑" : "↓"}</button>
              </div>
            </section>
          </div>
        </section>
      </div>
    `;
  }

  function bind() {
    const sidebarToggle = app.querySelector(".sidebar-toggle");
    sidebarToggle.addEventListener("click", () => {
      sidebarCollapsed = !sidebarCollapsed;
      render();
    });

    app.querySelectorAll("[data-open-settings]").forEach((button) => {
      button.addEventListener("click", () => {
        settingsOpen = true;
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

    app.querySelectorAll("[data-dir]").forEach((button) => {
      button.addEventListener("click", () => {
        if (directories.some((directory) => directory.name === button.dataset.dir)) {
          activeChartSelection = `dir:${button.dataset.dir}`;
          frameStates.clear();
          render();
          window.scrollTo({ top: 0, behavior: "instant" });
        }
      });
    });

    app.querySelectorAll("[data-chart-scope]").forEach((button) => {
      button.addEventListener("click", () => {
        activeChartSelection = button.dataset.chartScope;
        frameStates.clear();
        render();
      });
    });

    const globalInput = app.querySelector(".global-search-input");
    if (!globalInput) {
      app.querySelectorAll(".page-frame").forEach((frame) => {
        frame.addEventListener("load", () => {
          measureFrame(frame);
          resizeFrames();
        });
      });
      return;
    }
    globalInput.addEventListener("input", () => {
      searchState.query = globalInput.value;
      resetSearchFilters();
      loadSearchIndex(currentSearchDirectories());
    });

    app.querySelectorAll("[data-search-field]").forEach((select) => {
      select.addEventListener("change", () => {
        if (select.dataset.searchField === "source") {
          searchState.selectedSource = select.value;
          searchState.selectedMake = "";
          searchState.selectedModel = "";
          searchState.selectedYear = "";
          searchState.selectedConstruct = "";
          searchState.selectedCab = "";
          searchState.selectedBed = "";
        } else if (select.dataset.searchField === "make") {
          searchState.selectedMake = select.value;
          searchState.selectedModel = "";
          searchState.selectedYear = "";
          searchState.selectedConstruct = "";
          searchState.selectedCab = "";
          searchState.selectedBed = "";
        } else if (select.dataset.searchField === "model") {
          searchState.selectedModel = select.value;
          searchState.selectedYear = "";
          searchState.selectedConstruct = "";
          searchState.selectedCab = "";
          searchState.selectedBed = "";
        } else if (select.dataset.searchField === "year") {
          searchState.selectedYear = select.value;
          searchState.selectedConstruct = "";
          searchState.selectedCab = "";
          searchState.selectedBed = "";
        } else if (select.dataset.searchField === "construct") {
          searchState.selectedConstruct = select.value;
          searchState.selectedCab = "";
          searchState.selectedBed = "";
        } else if (select.dataset.searchField === "cab") {
          searchState.selectedCab = select.value;
          searchState.selectedBed = "";
        } else if (select.dataset.searchField === "bed") {
          searchState.selectedBed = select.value;
        }
        updateSearchControls();
        updateSearchResults();
      });
    });

    app.querySelectorAll("[data-size-field-toggle]").forEach((checkbox) => {
      checkbox.addEventListener("change", () => {
        ensureSizeFieldState();
        if (checkbox.checked) {
          searchState.visibleColumns.add(checkbox.value);
        } else {
          searchState.visibleColumns.delete(checkbox.value);
        }
        updateSearchResults();
      });
    });

    app.querySelectorAll("[data-size-move-field]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.preventDefault();
        moveSizeField(button.dataset.sizeMoveField, Number(button.dataset.moveDirection));
        render();
      });
    });

    const sizeSortSelect = app.querySelector("[data-size-sort-field]");
    if (sizeSortSelect) {
      sizeSortSelect.addEventListener("change", () => {
        searchState.sortField = sizeSortSelect.value;
        updateSearchResults();
      });
    }

    const sizeSortDirection = app.querySelector("[data-size-sort-direction]");
    if (sizeSortDirection) {
      sizeSortDirection.addEventListener("click", () => {
        searchState.sortDirection = searchState.sortDirection === "asc" ? "desc" : "asc";
        sizeSortDirection.textContent = searchState.sortDirection === "asc" ? "↑" : "↓";
        updateSearchResults();
      });
    }

    const resetButton = app.querySelector(".search-reset");
    resetButton.addEventListener("click", () => {
      searchState.query = "";
      resetSearchFilters();
      const globalInput = app.querySelector(".global-search-input");
      if (globalInput) {
        globalInput.value = "";
      }
      loadSearchIndex(currentSearchDirectories());
      updateSearchControls();
      updateSearchResults();
    });

    app.querySelectorAll(".page-frame").forEach((frame) => {
      frame.addEventListener("load", () => {
        measureFrame(frame);
        resizeFrames();
        if (searchState.status === "error") {
          scheduleFrameSearchIndex();
        }
      });
    });
  }

  function resetSearchFilters() {
    searchState.selectedSource = "";
    searchState.selectedMake = "";
    searchState.selectedModel = "";
    searchState.selectedYear = "";
    searchState.selectedConstruct = "";
    searchState.selectedCab = "";
    searchState.selectedBed = "";
    searchState.sortField = "";
    searchState.sortDirection = "asc";
  }

  function currentSearchDirectories() {
    return directories;
  }

  async function loadSearchIndex(scopeDirectories) {
    if (!scopeDirectories.length) {
      return;
    }

    const token = ++searchLoadToken;
    const scopeKey = scopeDirectories.map((directory) => directory.name).join("|");
    if (searchState.scopeKey === scopeKey && (searchState.status === "ready" || searchState.status === "loading")) {
      updateSearchControls();
      updateSearchResults();
      return;
    }
    searchState.scopeKey = scopeKey;
    searchState.records = [];
    searchState.columns = [];
    searchState.status = "loading";
    searchState.message = "Loading records...";
    updateSearchControls();
    updateSearchResults();

    try {
      const indexes = await Promise.all(scopeDirectories.map(loadDirectoryIndex));

      if (token !== searchLoadToken) {
        return;
      }

      const records = [];
      const columns = [];
      indexes.forEach((index) => {
        records.push(...index.records);
        index.columns.forEach((column) => {
          if (column && !columns.includes(column)) {
            columns.push(column);
          }
        });
      });
      setSearchIndex(scopeKey, records, columns);
    } catch (error) {
      if (token !== searchLoadToken) {
        return;
      }
      searchState.status = "error";
      searchState.message = scopeDirectories.length === 1
        ? "Waiting for page previews to finish loading..."
        : "Unable to load all folders for global search.";
      updateSearchControls();
      updateSearchResults();
      if (scopeDirectories.length === 1) {
        scheduleFrameSearchIndex();
      }
    }
  }

  async function loadDirectoryIndex(directory) {
    if (directoryIndexes.has(directory.name)) {
      return directoryIndexes.get(directory.name);
    }

    const pages = await Promise.all(directory.files.map(async (file) => {
      const response = await fetch(pagePath(directory, file), { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`Cannot load ${directory.name}/${file}`);
      }
      return { file, html: await response.text() };
    }));

    const parser = new DOMParser();
    const records = [];
    const columns = [];
    pages.forEach((page) => {
      const doc = parser.parseFromString(page.html, "text/html");
      records.push(...extractRecords(doc, page.file, directory, columns));
    });
    await enrichRecordsFromSource(directory, records);

    const index = { records, columns };
    directoryIndexes.set(directory.name, index);
    return index;
  }

  function scheduleFrameSearchIndex() {
    window.clearTimeout(frameSearchTimer);
    frameSearchTimer = window.setTimeout(() => {
      const fallbackDirectory = chartDirectories()[0] || directories[0];
      if (!fallbackDirectory || searchState.scopeKey !== fallbackDirectory.name) {
        return;
      }
      const records = [];
      const columns = [];
      app.querySelectorAll(".page-frame").forEach((frame) => {
        try {
          const file = frame.getAttribute("src").split("/").pop();
          if (frame.contentDocument) {
            records.push(...extractRecords(frame.contentDocument, file, fallbackDirectory, columns));
          }
        } catch (error) {
          // Some browsers block file previews from being inspected.
        }
      });
      if (records.length) {
        setSearchIndex(fallbackDirectory.name, records, columns);
      } else {
        searchState.status = "error";
        searchState.message = "Unable to read the preview pages in this browser.";
        updateSearchControls();
        updateSearchResults();
      }
    }, 120);
  }

  function setSearchIndex(scopeKey, records, columns) {
    searchState.scopeKey = scopeKey;
    searchState.records = records;
    searchState.columns = columns;
    searchState.status = "ready";
    searchState.message = records.length ? `全量尺码数据：已索引 ${formatCount(records.length)} 条记录。` : "未读取到表格记录。";
    ensureSizeFieldState();
    updateSearchControls();
    updateSearchResults();
  }

  function extractRecords(doc, file, directory, columns) {
    const records = [];
    const tags = sourceTags(directory.name);
    doc.querySelectorAll(".brand-table").forEach((tableBlock) => {
      const isPickup = tableBlock.classList.contains("profile-pickup");
      const title = normalizeMake(cleanText(tableBlock.querySelector(".brand-title-main, h2")));
      const fallbackMake = isPickup ? logoMake(tableBlock) : title;
      const description = cleanText(tableBlock.querySelector(".brand-title-description"));
      const headers = Array.from(tableBlock.querySelectorAll("thead th")).map(cleanText);
      headers.forEach((header) => {
        if (header && !columns.includes(header)) {
          columns.push(header);
        }
      });

      tableBlock.querySelectorAll("tbody tr").forEach((row) => {
        const values = {};
        Array.from(row.children).forEach((cell, index) => {
          const header = headers[index] || `COL ${index + 1}`;
          values[header] = cleanText(cell);
        });
        const year = values.YEAR || values.Year || "";
        records.push({
          make: fallbackMake,
          model: values.MODEL || values.Model || "",
          year,
          years: expandYears(year),
          construct: values.CONST || values.CONSTRUCT || values.Const || "",
          values,
          title,
          description,
          searchText: "",
          directory: directory.name,
          source: `${directory.name}/${file}`,
          sourceTags: tags,
          file
        });
      });
    });
    return records;
  }

  async function enrichRecordsFromSource(directory, records) {
    try {
      const metadata = await loadDirectoryMetadata(directory);
      if (!metadata.inputPath) {
        return;
      }

      const tsvRows = await loadTsvRows(metadata.inputPath);
      let matchingRows = tsvRows.filter((row) => !metadata.storeValue || cleanField(row["店铺"]) === metadata.storeValue);
      if (!matchingRows.length && metadata.storeValue) {
        matchingRows = tsvRows;
      }

      if (metadata.profile !== "pickup") {
        const lookup = new Map();
        matchingRows.forEach((row) => {
          const key = nonPickupKey({
            make: row.MAKE,
            model: row["SHORT-MODEL"] || row.MODEL,
            year: row.YEAR,
            type: row.TYPE || row["LONG-TYPE"] || row.CONST,
            size: row.SIZE
          });
          if (!lookup.has(key)) {
            lookup.set(key, []);
          }
          lookup.get(key).push(row);
        });

        records.forEach((record) => {
          const row = (lookup.get(nonPickupKey({
            make: record.make,
            model: record.model,
            year: record.values.YEAR,
            type: record.values.TYPE,
            size: record.values.SIZE
          })) || []).shift() || matchingRows.find((candidate) => (
            sameText(candidate.MAKE, record.make)
              && sameText(candidate["SHORT-MODEL"] || candidate.MODEL, record.model)
              && cleanField(candidate.YEAR) === cleanField(record.values.YEAR)
              && cleanField(candidate.SIZE) === cleanField(record.values.SIZE)
          ));

          if (row) {
            record.construct = cleanField(row.CONST || row.CONSTRUCT);
            record.searchText = `${record.searchText} ${Object.values(row).join(" ")}`;
          }
        });
        return;
      }

      const lookup = new Map();
      matchingRows.forEach((row) => {
        const key = pickupKey({
          title: row.TITLE,
          year: row.YEAR,
          cab: row["SHORT-CAB"] || row.CAB,
          bed: row.BED,
          size: row.SIZE
        });
        if (!lookup.has(key)) {
          lookup.set(key, []);
        }
        lookup.get(key).push(row);
      });

      records.forEach((record) => {
        const row = (lookup.get(pickupKey({
          title: record.title,
          year: record.values.YEAR,
          cab: record.values.CAB,
          bed: record.values.BED,
          size: record.values.SIZE
        })) || []).shift() || matchingRows.find((candidate) => (
          sameText(candidate.TITLE, record.title)
            && cleanField(candidate.YEAR) === cleanField(record.values.YEAR)
            && cleanField(candidate.SIZE) === cleanField(record.values.SIZE)
        )) || matchingRows.find((candidate) => (
          sameText(candidate.TITLE, record.title) && cleanField(candidate.YEAR) === cleanField(record.values.YEAR)
        ));

        if (!row) {
          record.searchText = `${record.title} ${record.description}`;
          return;
        }

        record.make = cleanField(row.MAKE);
        record.model = cleanField(row.MODEL || row["SHORT-MODEL"]);
        record.construct = cleanField(row.CONST || row.CONSTRUCT);
        record.cab = cleanField(row.CAB);
        record.bed = cleanField(row.BED);
        record.type = cleanField(row.TYPE || row["LONG-TYPE"] || row.VERSION || row.CONST);
        record.searchText = Object.values(row).join(" ");
      });
    } catch (error) {
      records.forEach((record) => {
        record.searchText = `${record.title} ${record.description}`;
      });
    }
  }

  async function loadDirectoryMetadata(directory) {
    if (directoryMetadata.has(directory.name)) {
      return directoryMetadata.get(directory.name);
    }

    const metadata = { profile: "", inputPath: "", storeValue: "" };
    try {
      const response = await fetch(`${config.basePath}${directory.name}/output_generation.log`, { cache: "no-store" });
      if (response.ok) {
        const log = await response.text();
        metadata.profile = (log.match(/Profile:\s*([^\r\n]+)/) || [])[1]?.trim() || "";
        metadata.inputPath = ((log.match(/-\s*(data[^\r\n]+)/) || [])[1] || "").trim().replace(/\\/g, "/");
        metadata.storeValue = (log.match(/Store value:\s*([^\r\n]+)/) || [])[1]?.trim() || "";
      }
    } catch (error) {
      // The generated HTML is still searchable without source metadata.
    }
    const tags = sourceTags(directory.name);
    if (!metadata.profile && tags.includes("pick")) {
      metadata.profile = "pickup";
    }
    if (!metadata.inputPath && tags.includes("pick")) {
      metadata.inputPath = "data/input/0630/pick.tsv";
    }
    if (!metadata.storeValue && tags.includes("pick")) {
      metadata.storeValue = directory.name.split(/[\\/]/)[0].replace(/^pick-/, "");
    }
    directoryMetadata.set(directory.name, metadata);
    return metadata;
  }

  async function loadTsvRows(path) {
    if (tsvIndexes.has(path)) {
      return tsvIndexes.get(path);
    }

    const response = await fetch(path, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Cannot load ${path}`);
    }
    const rows = parseTsv(await response.text());
    tsvIndexes.set(path, rows);
    return rows;
  }

  function parseTsv(text) {
    const normalizedText = text
      .replace(/^\uFEFF/, "")
      .replace(/"([^"]*)\r?\n([^"]*)"/g, (_, before, after) => `"${before} ${after}"`);
    const lines = normalizedText.split(/\r?\n/).filter((line) => line.trim());
    if (!lines.length) {
      return [];
    }
    const headers = lines[0].split("\t").map((header) => header.trim().replace(/^"|"$/g, ""));
    return lines.slice(1).map((line) => {
      const cells = line.split("\t");
      const row = {};
      headers.forEach((header, index) => {
        row[header] = cleanField(cells[index]);
      });
      return row;
    });
  }

  function pickupKey(row) {
    return [
      cleanField(row.title).toUpperCase(),
      cleanField(row.year),
      cleanField(row.cab).toUpperCase(),
      cleanField(row.bed),
      cleanField(row.size).toUpperCase()
    ].join("|");
  }

  function nonPickupKey(row) {
    return [
      cleanField(row.make).toUpperCase(),
      cleanField(row.model).toUpperCase(),
      cleanField(row.year),
      cleanField(row.type).toUpperCase(),
      cleanField(row.size).toUpperCase()
    ].join("|");
  }

  function sameText(left, right) {
    return cleanField(left).toUpperCase() === cleanField(right).toUpperCase();
  }

  function updateSearchControls() {
    const makeSelect = app.querySelector('[data-search-field="make"]');
    const modelSelect = app.querySelector('[data-search-field="model"]');
    const yearSelect = app.querySelector('[data-search-field="year"]');
    const sourceSelect = app.querySelector('[data-search-field="source"]');
    const constructSelect = app.querySelector('[data-search-field="construct"]');
    const cabSelect = app.querySelector('[data-search-field="cab"]');
    const bedSelect = app.querySelector('[data-search-field="bed"]');
    if (!makeSelect || !modelSelect || !yearSelect || !sourceSelect || !constructSelect || !cabSelect || !bedSelect) {
      return;
    }

    const ready = searchState.status === "ready";
    const makeRecords = queryFilteredRecords();
    const sourceRecords = makeRecords.filter((record) => !searchState.selectedSource || topSource(record.directory) === searchState.selectedSource);
    const modelRecords = sourceRecords.filter((record) => !searchState.selectedMake || record.make === searchState.selectedMake);
    const yearRecords = modelRecords.filter((record) => !searchState.selectedModel || record.model === searchState.selectedModel);
    const constructRecords = yearRecords.filter((record) => !searchState.selectedYear || record.years.includes(Number(searchState.selectedYear)));
    const cabRecords = constructRecords.filter((record) => !searchState.selectedConstruct || filterAtoms(record, "construct").includes(searchState.selectedConstruct));
    const bedRecords = cabRecords.filter((record) => !searchState.selectedCab || filterAtoms(record, "cab").includes(searchState.selectedCab));

    fillSelect(sourceSelect, "All sources", uniqueInOrder(makeRecords.map((record) => topSource(record.directory))), searchState.selectedSource);
    fillSelect(makeSelect, "All makes", unique(sourceRecords.map((record) => record.make)), searchState.selectedMake);
    fillSelect(modelSelect, "All models", unique(modelRecords.map((record) => record.model)), searchState.selectedModel);
    fillSelect(yearSelect, "All years", uniqueYears(yearRecords), searchState.selectedYear);
    fillSelect(constructSelect, filterConfig("construct").empty_label, unique(constructRecords.flatMap((record) => filterAtoms(record, "construct"))), searchState.selectedConstruct);
    fillSelect(cabSelect, filterConfig("cab").empty_label, unique(cabRecords.flatMap((record) => filterAtoms(record, "cab"))), searchState.selectedCab);
    fillSelect(bedSelect, filterConfig("bed").empty_label, unique(bedRecords.flatMap((record) => filterAtoms(record, "bed"))), searchState.selectedBed);

    sourceSelect.disabled = !ready;
    makeSelect.disabled = !ready;
    modelSelect.disabled = !ready || !modelRecords.length;
    yearSelect.disabled = !ready || !yearRecords.length;
    constructSelect.disabled = !ready || !constructRecords.length;
    cabSelect.disabled = !ready || !cabRecords.length;
    bedSelect.disabled = !ready || !bedRecords.length;
  }

  function updateSearchResults() {
    const summary = app.querySelector(".search-summary");
    const results = app.querySelector(".search-results");
    if (!summary || !results) {
      return;
    }

    if (searchState.status === "loading" || searchState.status === "error") {
      summary.textContent = searchState.message;
      results.innerHTML = "";
      return;
    }

    const queryRecords = queryFilteredRecords();
    if (!queryRecords.length) {
      summary.textContent = searchState.query.trim() ? "未找到匹配记录。" : searchState.message;
      results.innerHTML = "";
      return;
    }

    const matches = sortSizeRows(getSearchMatches());
    summary.textContent = `匹配结果：${formatCount(matches.length)} 条记录。`;
    results.innerHTML = renderResultsTable(matches);
    bindResultColumnResizers();
  }

  function getSearchMatches() {
    return queryFilteredRecords().filter((record) => {
      if (searchState.selectedMake && record.make !== searchState.selectedMake) {
        return false;
      }
      if (searchState.selectedSource && topSource(record.directory) !== searchState.selectedSource) {
        return false;
      }
      if (searchState.selectedModel && record.model !== searchState.selectedModel) {
        return false;
      }
      if (searchState.selectedYear && !record.years.includes(Number(searchState.selectedYear))) {
        return false;
      }
      if (searchState.selectedConstruct && !filterAtoms(record, "construct").includes(searchState.selectedConstruct)) {
        return false;
      }
      if (searchState.selectedCab && !filterAtoms(record, "cab").includes(searchState.selectedCab)) {
        return false;
      }
      if (searchState.selectedBed && !filterAtoms(record, "bed").includes(searchState.selectedBed)) {
        return false;
      }
      return true;
    });
  }

  function queryFilteredRecords() {
    const tokens = searchTokens(searchState.query);
    if (!tokens.length) {
      return searchState.records;
    }

    return searchState.records.filter((record) => tokens.every((token) => recordMatchesToken(record, token)));
  }

  function renderResultsTable(records) {
    if (!records.length) {
      return '<div class="empty-results">No rows match the current selection.</div>';
    }

    const columns = resultColumns(records);
    const tableColumns = [
      { key: "SOURCE", label: "SOURCE", source: true, width: "56px" },
      { key: "MAKE", label: "MAKE", width: "105px" },
      ...columns.map((column) => ({
        key: column,
        label: column,
        size: isSizeColumn(column),
        width: defaultResultColumnWidth(column)
      }))
    ];
    return `
      <div class="results-table-wrap size-results-wrap">
        <table class="results-table size-results-table dimension-theme-blue">
          <colgroup>
            ${tableColumns.map((column) => {
              const width = searchState.columnWidths[column.key] || column.width;
              return `<col data-col-key="${escapeHtml(column.key)}"${width ? ` style="width: ${escapeHtml(width)}"` : ""}>`;
            }).join("")}
          </colgroup>
          <thead>
            <tr>
              ${tableColumns.map((column) => `
                <th class="${resultHeaderClass(column)}" data-col-key="${escapeHtml(column.key)}">
                  <span class="th-label">${escapeHtml(column.label)}</span>
                  <span class="col-resizer" data-col-key="${escapeHtml(column.key)}" title="拖动调整列宽" aria-hidden="true"></span>
                </th>
              `).join("")}
            </tr>
          </thead>
          <tbody>
            ${records.map((record) => `
              <tr>
                ${tableColumns.map((column) => resultCellMarkup(record, column)).join("")}
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function resultColumns(records) {
    const usedColumns = searchState.columns.filter((column) => records.some((record) => resultColumnValue(record, column)));
    const fallbackColumns = ["MODEL", "YEAR", "TYPE", "CONST", "SIZE"];
    const columns = usedColumns.length ? usedColumns : fallbackColumns;
    const withModel = records.some((record) => record.model) && !columns.some((column) => sameColumn(column, "MODEL"))
      ? ["MODEL", ...columns]
      : columns;
    const withConst = records.some((record) => record.construct) && !withModel.some((column) => sameColumn(column, "CONST"))
      ? [...withModel, "CONST"]
      : withModel;
    const ordered = sortSizeFields(withConst.map((column) => ({ key: column, label: column }))).map((field) => field.key);
    const visible = ordered.filter((column) => isSizeColumnVisible(column) || isSizeColumn(column));
    const withoutSize = visible.filter((column) => !isSizeColumn(column));
    const hasSize = withModel.some((column) => isSizeColumn(column)) || records.some((record) => record.values.SIZE || record.size);
    return hasSize ? [...withoutSize, "SIZE"] : withoutSize;
  }

  function resultCellMarkup(record, column) {
    if (column.source) {
      return `<td class="source-cell"><a href="${pagePathByName(record.directory, record.file)}">${escapeHtml(record.source)}</a></td>`;
    }
    const value = column.key === "MAKE" ? record.make : resultColumnValue(record, column.key);
    if (column.size) {
      return `<td class="size-cell"><strong>${escapeHtml(value || "-")}</strong></td>`;
    }
    return `<td>${escapeHtml(value || "")}</td>`;
  }

  function resultColumnValue(record, column) {
    if (sameColumn(column, "MODEL")) return record.values[column] || record.model || "";
    if (sameColumn(column, "MAKE")) return record.make || "";
    if (sameColumn(column, "CONST")) return configuredRecordValue(record, "const") || record.construct || record.values.CONST || record.values.CONSTRUCT || "";
    if (sameColumn(column, "CAB")) return configuredRecordValue(record, "cab") || record.values[column] || "";
    if (sameColumn(column, "BED")) return configuredRecordValue(record, "bed") || record.values[column] || "";
    if (sameColumn(column, "TYPE")) return record.values[column] || record.type || "";
    return record.values[column] || "";
  }

  function sizeDisplayFields() {
    const seen = new Set();
    const keys = ["MODEL", ...searchState.columns, "CONST", "TYPE", "YEAR", "CAB", "BED", "SIZE"].filter(Boolean);
    const fields = keys.filter((key) => {
      const normalized = cleanField(key).toUpperCase();
      if (seen.has(normalized)) return false;
      seen.add(normalized);
      return !sameColumn(key, "MAKE");
    }).map((key) => ({ key, label: sameColumn(key, "CONST") ? "CONST" : key }));
    return sortSizeFields(fields);
  }

  function ensureSizeFieldState() {
    const fields = sizeDisplayFields();
    if (!searchState.fieldOrder.length) {
      searchState.fieldOrder = fields.map((field) => field.key);
    }
    if (!searchState.visibleColumns) {
      searchState.visibleColumns = new Set(fields.map((field) => field.key));
    }
  }

  function isSizeColumnVisible(key) {
    ensureSizeFieldState();
    return searchState.visibleColumns.has(key);
  }

  function sortSizeFields(fields) {
    const order = new Map(searchState.fieldOrder.map((key, index) => [cleanField(key).toUpperCase(), index]));
    return [...fields].sort((left, right) => {
      const leftIndex = order.has(cleanField(left.key).toUpperCase()) ? order.get(cleanField(left.key).toUpperCase()) : Number.MAX_SAFE_INTEGER;
      const rightIndex = order.has(cleanField(right.key).toUpperCase()) ? order.get(cleanField(right.key).toUpperCase()) : Number.MAX_SAFE_INTEGER;
      return leftIndex - rightIndex;
    });
  }

  function moveSizeField(key, direction) {
    const ordered = sizeDisplayFields().map((field) => field.key);
    const index = ordered.indexOf(key);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= ordered.length) return;
    const [item] = ordered.splice(index, 1);
    ordered.splice(nextIndex, 0, item);
    const orderedSet = new Set(ordered);
    searchState.fieldOrder = [...ordered, ...searchState.fieldOrder.filter((field) => !orderedSet.has(field))];
  }

  function sortSizeRows(rows) {
    if (!searchState.sortField) return rows;
    const direction = searchState.sortDirection === "desc" ? -1 : 1;
    return [...rows].sort((left, right) => compareValues(resultColumnValue(left, searchState.sortField), resultColumnValue(right, searchState.sortField)) * direction);
  }

  function compareValues(left, right) {
    const leftNumber = Number(left);
    const rightNumber = Number(right);
    if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
      return leftNumber - rightNumber;
    }
    return String(left || "").localeCompare(String(right || ""), undefined, { numeric: true });
  }

  function formatCount(value) {
    return new Intl.NumberFormat("en-US").format(value);
  }

  function recordFilterValue(record, column) {
    return cleanField(resultColumnValue(record, column));
  }

  function constructAtoms(record) {
    return filterAtoms(record, "construct");
  }

  function filterAtoms(record, key) {
    const value = configuredRecordValue(record, key);
    return filterConfig(key).atomize === false ? [cleanField(value)].filter(Boolean) : fieldAtoms(value);
  }

  function configuredRecordValue(record, key) {
    const source = filterConfig(key).source || tableFieldConfig(key).source;
    if (key === "construct") {
      return record.construct || sourceValue(record, source) || record.values.CONSTRUCT;
    }
    if (key === "const") {
      return record.construct || sourceValue(record, source) || record.values.CONSTRUCT;
    }
    if (key === "cab") {
      return record.cab || (source && !sameColumn(source, "CAB") ? sourceValue(record, source) : "");
    }
    if (key === "bed") {
      return record.bed || sourceValue(record, source);
    }
    return sourceValue(record, source);
  }

  function sourceValue(record, source) {
    return cleanField(record.values[source] || record.values[cleanField(source).toUpperCase()] || record.values[cleanField(source).toLowerCase()]);
  }

  function filterConfig(key) {
    return { ...(defaultViewConfig.filters[key] || {}), ...(viewConfig.filters?.[key] || {}) };
  }

  function tableFieldConfig(key) {
    return { ...(defaultViewConfig.table_fields[key] || {}), ...(viewConfig.table_fields?.[key] || {}) };
  }

  function fieldAtoms(value) {
    const text = cleanField(value);
    if (!text) {
      return [];
    }
    return uniqueInOrder(text.split(/\s*(?:\/|,|;|\||\+|&)\s*/).map(cleanField));
  }

  async function loadViewConfig() {
    if (!config.viewConfigPath) {
      return;
    }
    try {
      const response = await fetch(config.viewConfigPath, { cache: "no-store" });
      if (response.ok) {
        viewConfig = mergeViewConfig(defaultViewConfig, parseSizeViewYaml(await response.text()));
      }
    } catch (error) {
      viewConfig = defaultViewConfig;
    }
  }

  function parseSizeViewYaml(text) {
    const result = { filters: {}, table_fields: {} };
    let section = "";
    let keyName = "";
    text.split(/\r?\n/).forEach((line) => {
      if (!line.trim() || line.trim().startsWith("#")) return;
      const indent = (line.match(/^\s*/) || [""])[0].length;
      const trimmed = line.trim();
      if (indent === 0 && trimmed.endsWith(":")) {
        section = trimmed.slice(0, -1);
        keyName = "";
        return;
      }
      if (indent === 2 && trimmed.endsWith(":") && (section === "filters" || section === "table_fields")) {
        keyName = trimmed.slice(0, -1);
        result[section][keyName] = result[section][keyName] || {};
        return;
      }
      if (indent >= 4 && keyName && trimmed.includes(":")) {
        const [rawKey, ...rawValue] = trimmed.split(":");
        result[section][keyName][rawKey.trim()] = parseYamlValue(rawValue.join(":").trim());
      }
    });
    return result;
  }

  function parseYamlValue(value) {
    const cleaned = value.replace(/^["']|["']$/g, "");
    if (/^(true|false)$/i.test(cleaned)) {
      return cleaned.toLowerCase() === "true";
    }
    return cleaned;
  }

  function mergeViewConfig(fallback, parsed) {
    const merged = {
      filters: { ...fallback.filters },
      table_fields: { ...fallback.table_fields }
    };
    Object.entries(parsed.filters || {}).forEach(([key, value]) => {
      merged.filters[key] = { ...(merged.filters[key] || {}), ...value };
    });
    Object.entries(parsed.table_fields || {}).forEach(([key, value]) => {
      merged.table_fields[key] = { ...(merged.table_fields[key] || {}), ...value };
    });
    return merged;
  }

  function resultHeaderClass(column) {
    if (column.source) return "source-heading";
    if (column.size) return "size-heading";
    return "";
  }

  function defaultResultColumnWidth(column) {
    if (sameColumn(column, "MODEL")) return "150px";
    if (sameColumn(column, "YEAR")) return "92px";
    if (sameColumn(column, "TYPE")) return "130px";
    if (sameColumn(column, "CAB")) return "110px";
    if (sameColumn(column, "BED")) return "90px";
    if (isSizeColumn(column)) return "104px";
    return "118px";
  }

  function bindResultColumnResizers() {
    const table = app.querySelector(".size-results-table");
    if (!table) return;
    table.querySelectorAll(".col-resizer").forEach((handle) => {
      handle.addEventListener("pointerdown", (event) => {
        const key = handle.dataset.colKey;
        const col = table.querySelector(`col[data-col-key="${cssEscape(key)}"]`);
        if (!col) return;
        event.preventDefault();
        const startX = event.clientX;
        const startWidth = col.getBoundingClientRect().width || 96;
        document.body.classList.add("is-resizing-column");

        const onPointerMove = (moveEvent) => {
          const width = Math.max(56, Math.round(startWidth + moveEvent.clientX - startX));
          searchState.columnWidths[key] = `${width}px`;
          col.style.width = searchState.columnWidths[key];
        };

        const stopResize = () => {
          document.body.classList.remove("is-resizing-column");
          document.removeEventListener("pointermove", onPointerMove);
          document.removeEventListener("pointerup", stopResize);
          document.removeEventListener("pointercancel", stopResize);
        };

        document.addEventListener("pointermove", onPointerMove);
        document.addEventListener("pointerup", stopResize);
        document.addEventListener("pointercancel", stopResize);
      });
    });
  }

  function isSizeColumn(column) {
    return sameColumn(column, "SIZE");
  }

  function sameColumn(left, right) {
    return cleanField(left).toUpperCase() === cleanField(right).toUpperCase();
  }

  function pagePathByName(directoryName, file) {
    const directory = directories.find((item) => item.name === directoryName) || chartDirectories()[0] || directories[0];
    return directory ? pagePath(directory, file) : "#";
  }

  function topSource(directoryName) {
    return String(directoryName || "").split(/[\\/]/)[0] || directoryName;
  }

  function fillSelect(select, label, options, selectedValue) {
    select.innerHTML = `<option value="">${label}</option>${options.map((option) => (
      `<option value="${escapeHtml(option)}"${option === selectedValue ? " selected" : ""}>${escapeHtml(option)}</option>`
    )).join("")}`;
  }

  function unique(values) {
    return Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
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

  function uniqueYears(records) {
    const years = new Set();
    records.forEach((record) => record.years.forEach((year) => years.add(year)));
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
        for (let year = start; year <= end; year += 1) {
          years.push(year);
        }
        return years;
      }
    }
    return Array.from(new Set((text.match(/\b(?:19|20)\d{2}\b/g) || []).map(Number)));
  }

  function normalizeMake(value) {
    return String(value || "").replace(/\s+\d+\s*\/\s*\d+\s*$/, "").trim();
  }

  function logoMake(tableBlock) {
    const alt = cleanField(tableBlock.querySelector(".brand-title-logo")?.getAttribute("alt"));
    return alt.replace(/\s+logo$/i, "");
  }

  function sourceTags(directoryName) {
    const normalized = normalizeSearchText(directoryName);
    const tags = new Set(normalized.split(/\s+/).filter(Boolean));
    if (normalized.includes("nonpick")) {
      tags.add("nonpick");
    } else if (normalized.includes("pick")) {
      tags.add("pick");
    }
    return Array.from(tags);
  }

  function searchTokens(value) {
    return normalizeSearchText(value).split(/\s+/).filter(Boolean);
  }

  function normalizeSearchText(value) {
    return String(value || "").toLowerCase().replace(/[-_/]+/g, " ").replace(/\s+/g, " ").trim();
  }

  function recordMatchesToken(record, token) {
    const sourceOnlyTokens = ["pick", "nonpick", "tm", "宏能图"];
    if (sourceOnlyTokens.includes(token) && record.sourceTags.includes(token)) {
      return true;
    }
    if (sourceOnlyTokens.includes(token)) {
      return false;
    }
    if (record.sourceTags.includes(token)) {
      return true;
    }

    const haystack = normalizeSearchText([
      record.source,
      record.make,
      record.model,
      record.type,
      record.year,
      record.title,
      record.description,
      record.searchText,
      Object.values(record.values).join(" ")
    ].join(" "));
    return haystack.includes(token);
  }

  function cleanField(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function cleanText(element) {
    if (!element) {
      return "";
    }
    return element.textContent.replace(/\s+/g, " ").trim();
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

  function measureFrame(frame) {
    try {
      const doc = frame.contentDocument;
      const rootStyle = doc.defaultView.getComputedStyle(doc.documentElement);
      const bodyStyle = doc.defaultView.getComputedStyle(doc.body);
      const cssWidth = parseFloat(rootStyle.getPropertyValue("--page-width"));
      const cssHeight = parseFloat(rootStyle.getPropertyValue("--page-height"));
      const measuredWidth = Math.max(doc.documentElement.scrollWidth, doc.body.scrollWidth);
      const measuredHeight = Math.max(doc.documentElement.scrollHeight, doc.body.scrollHeight);

      frameStates.set(frame, {
        width: cssWidth || parseFloat(bodyStyle.minWidth) || measuredWidth || 2000,
        height: cssHeight || measuredHeight || 1800
      });
    } catch (error) {
      frameStates.set(frame, { width: 2000, height: 1800 });
    }
  }

  function resizeFrames() {
    app.querySelectorAll(".page-frame").forEach((frame) => {
      const shell = frame.closest(".frame-shell");
      const state = frameStates.get(frame) || { width: 2000, height: 1800 };
      const availableWidth = shell.clientWidth;
      const scale = availableWidth / state.width;

      frame.style.width = `${state.width}px`;
      frame.style.height = `${state.height}px`;
      frame.style.transform = `scale(${scale})`;
      shell.style.height = `${Math.ceil(state.height * scale)}px`;
    });
  }

  window.addEventListener("resize", resizeFrames);
  loadViewConfig().then(render);
})();
