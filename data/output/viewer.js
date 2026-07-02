(function () {
  const config = window.SIZE_CHART_VIEWER;
  const app = document.getElementById("app");

  if (!config || !app) {
    return;
  }

  const directories = config.directories || [];
  let activeChartSelection = "all";
  let activeSection = "search";
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
    selectedType: "",
    selectedCab: "",
    selectedBed: "",
    columnWidths: {},
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
    app.innerHTML = `
      <header class="topbar">
        <div class="topbar-inner">
          <nav class="section-switcher" aria-label="Pages">
            <button class="drawer-button" type="button" aria-expanded="false" aria-controls="directory-drawer" title="目录">≡</button>
            <a href="index.html">首页</a>
            <a class="is-active" href="size-chart.html">查尺码配对</a>
            <a href="cars-data.html">查车型数据</a>
          </nav>
          <div class="current-title">
            <div class="root-label">二级页面 / ${config.rootLabel}</div>
            <div class="current-path">${config.rootLabel} / ${selectedChartLabel}</div>
          </div>
        </div>
        <nav class="drawer-panel" id="directory-drawer" aria-label="Directory tree">
          <div class="drawer-content">
            <p class="tree-root">${config.rootLabel}/</p>
            <ol class="tree">
              ${directories.map((directory) => `
                <li class="tree-folder">
                  <button class="tree-folder-header${activeChartSelection === `dir:${directory.name}` ? " is-active" : ""}" type="button" data-dir="${directory.name}">
                    <span>${directory.name}/</span>
                    <span class="tree-count">${directory.files.length} HTML</span>
                  </button>
                  <ol class="tree-pages">
                    ${directory.files.map((file) => `<li><a href="${pagePath(directory, file)}">${file}</a></li>`).join("")}
                  </ol>
                </li>
              `).join("")}
            </ol>
          </div>
        </nav>
      </header>

      <main class="viewer-main viewer-shell">
        <aside class="viewer-side" aria-label="Page outline">
          <button class="outline-item${activeSection === "search" ? " is-active" : ""}" type="button" data-section="search">
            <span class="outline-marker"></span>
            <span>Search Size</span>
          </button>
          <div class="outline-group${activeSection === "charts" ? " is-active" : ""}">
            <button class="outline-item" type="button" data-section="charts">
              <span class="outline-marker"></span>
              <span>Size Charts</span>
            </button>
            <div class="outline-child chart-outline" aria-label="Size chart folders">
              ${chartOutlineMarkup()}
            </div>
          </div>
        </aside>
        <div class="viewer-content">
        <section class="search-panel viewer-section${activeSection === "search" ? "" : " is-hidden"}" aria-label="Size chart search">
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
          <div class="search-controls">
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
              <span>TYPE</span>
              <select class="search-select" data-search-field="type" ${searchState.status === "loading" ? "disabled" : ""}>
                <option value="">All types</option>
              </select>
            </label>
            <label>
              <span>CAB</span>
              <select class="search-select" data-search-field="cab" ${searchState.status === "loading" ? "disabled" : ""}>
                <option value="">All cabs</option>
              </select>
            </label>
            <label>
              <span>BED</span>
              <select class="search-select" data-search-field="bed" ${searchState.status === "loading" ? "disabled" : ""}>
                <option value="">All beds</option>
              </select>
            </label>
          </div>
          <div class="search-summary" role="status"></div>
          <div class="search-results"></div>
        </section>
        <section class="page-stack size-charts-panel viewer-section${activeSection === "charts" ? "" : " is-hidden"}" aria-label="Size Charts">
          <div class="size-charts-header">
            <div>
              <h2>Size Charts</h2>
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
        </div>
      </main>
    `;

    bind();
    resizeFrames();
    updateSearchControls();
    updateSearchResults();
    loadSearchIndex(currentSearchDirectories());
  }

  function bind() {
    const drawerButton = app.querySelector(".drawer-button");
    const drawerPanel = app.querySelector(".drawer-panel");

    drawerButton.addEventListener("click", () => {
      const isOpen = drawerPanel.classList.toggle("is-open");
      drawerButton.setAttribute("aria-expanded", isOpen ? "true" : "false");
    });

    app.querySelectorAll("[data-section]").forEach((button) => {
      button.addEventListener("click", () => {
        activeSection = button.dataset.section;
        render();
      });
    });

    app.querySelectorAll("[data-dir]").forEach((button) => {
      button.addEventListener("click", () => {
        if (directories.some((directory) => directory.name === button.dataset.dir)) {
          activeChartSelection = `dir:${button.dataset.dir}`;
          activeSection = "charts";
          frameStates.clear();
          render();
          window.scrollTo({ top: 0, behavior: "instant" });
        }
      });
    });

    app.querySelectorAll("[data-chart-scope]").forEach((button) => {
      button.addEventListener("click", () => {
        activeChartSelection = button.dataset.chartScope;
        activeSection = "charts";
        frameStates.clear();
        render();
      });
    });

    const globalInput = app.querySelector(".global-search-input");
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
          searchState.selectedType = "";
          searchState.selectedCab = "";
          searchState.selectedBed = "";
        } else if (select.dataset.searchField === "make") {
          searchState.selectedMake = select.value;
          searchState.selectedModel = "";
          searchState.selectedYear = "";
          searchState.selectedType = "";
          searchState.selectedCab = "";
          searchState.selectedBed = "";
        } else if (select.dataset.searchField === "model") {
          searchState.selectedModel = select.value;
          searchState.selectedYear = "";
          searchState.selectedType = "";
          searchState.selectedCab = "";
          searchState.selectedBed = "";
        } else if (select.dataset.searchField === "year") {
          searchState.selectedYear = select.value;
          searchState.selectedType = "";
          searchState.selectedCab = "";
          searchState.selectedBed = "";
        } else if (select.dataset.searchField === "type") {
          searchState.selectedType = select.value;
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
    searchState.selectedType = "";
    searchState.selectedCab = "";
    searchState.selectedBed = "";
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
    searchState.message = records.length ? `${records.length} rows indexed.` : "No table rows found.";
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
      if (metadata.profile !== "pickup" || !metadata.inputPath) {
        return;
      }

      const tsvRows = await loadTsvRows(metadata.inputPath);
      let matchingRows = tsvRows.filter((row) => !metadata.storeValue || cleanField(row["店铺"]) === metadata.storeValue);
      if (!matchingRows.length && metadata.storeValue) {
        matchingRows = tsvRows;
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
          sameText(candidate.TITLE, record.title) && cleanField(candidate.YEAR) === cleanField(record.values.YEAR)
        ));

        if (!row) {
          record.searchText = `${record.title} ${record.description}`;
          return;
        }

        record.make = cleanField(row.MAKE);
        record.model = cleanField(row.MODEL || row["SHORT-MODEL"]);
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
    const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
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

  function sameText(left, right) {
    return cleanField(left).toUpperCase() === cleanField(right).toUpperCase();
  }

  function updateSearchControls() {
    const makeSelect = app.querySelector('[data-search-field="make"]');
    const modelSelect = app.querySelector('[data-search-field="model"]');
    const yearSelect = app.querySelector('[data-search-field="year"]');
    const sourceSelect = app.querySelector('[data-search-field="source"]');
    const typeSelect = app.querySelector('[data-search-field="type"]');
    const cabSelect = app.querySelector('[data-search-field="cab"]');
    const bedSelect = app.querySelector('[data-search-field="bed"]');
    if (!makeSelect || !modelSelect || !yearSelect || !sourceSelect || !typeSelect || !cabSelect || !bedSelect) {
      return;
    }

    const ready = searchState.status === "ready";
    const makeRecords = queryFilteredRecords();
    const sourceRecords = makeRecords.filter((record) => !searchState.selectedSource || topSource(record.directory) === searchState.selectedSource);
    const modelRecords = sourceRecords.filter((record) => !searchState.selectedMake || record.make === searchState.selectedMake);
    const yearRecords = modelRecords.filter((record) => !searchState.selectedModel || record.model === searchState.selectedModel);
    const typeRecords = yearRecords.filter((record) => !searchState.selectedYear || record.years.includes(Number(searchState.selectedYear)));
    const cabRecords = typeRecords.filter((record) => !searchState.selectedType || recordFilterValue(record, "TYPE") === searchState.selectedType);
    const bedRecords = cabRecords.filter((record) => !searchState.selectedCab || recordFilterValue(record, "CAB") === searchState.selectedCab);

    fillSelect(sourceSelect, "All sources", uniqueInOrder(makeRecords.map((record) => topSource(record.directory))), searchState.selectedSource);
    fillSelect(makeSelect, "All makes", unique(sourceRecords.map((record) => record.make)), searchState.selectedMake);
    fillSelect(modelSelect, "All models", unique(modelRecords.map((record) => record.model)), searchState.selectedModel);
    fillSelect(yearSelect, "All years", uniqueYears(yearRecords), searchState.selectedYear);
    fillSelect(typeSelect, "All types", unique(typeRecords.map((record) => recordFilterValue(record, "TYPE"))), searchState.selectedType);
    fillSelect(cabSelect, "All cabs", unique(cabRecords.map((record) => recordFilterValue(record, "CAB"))), searchState.selectedCab);
    fillSelect(bedSelect, "All beds", unique(bedRecords.map((record) => recordFilterValue(record, "BED"))), searchState.selectedBed);

    sourceSelect.disabled = !ready;
    makeSelect.disabled = !ready;
    modelSelect.disabled = !ready || !modelRecords.length;
    yearSelect.disabled = !ready || !yearRecords.length;
    typeSelect.disabled = !ready || !typeRecords.length;
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
      summary.textContent = searchState.query.trim() ? "0 matching rows." : searchState.message;
      results.innerHTML = "";
      return;
    }

    const matches = getSearchMatches();
    summary.textContent = `${matches.length} matching row${matches.length === 1 ? "" : "s"}.`;
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
      if (searchState.selectedType && recordFilterValue(record, "TYPE") !== searchState.selectedType) {
        return false;
      }
      if (searchState.selectedCab && recordFilterValue(record, "CAB") !== searchState.selectedCab) {
        return false;
      }
      if (searchState.selectedBed && recordFilterValue(record, "BED") !== searchState.selectedBed) {
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
        <table class="results-table size-results-table">
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
    const fallbackColumns = ["MODEL", "YEAR", "TYPE", "SIZE"];
    const columns = usedColumns.length ? usedColumns : fallbackColumns;
    const withModel = records.some((record) => record.model) && !columns.some((column) => sameColumn(column, "MODEL"))
      ? ["MODEL", ...columns]
      : columns;
    const withoutSize = withModel.filter((column) => !isSizeColumn(column));
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
    if (sameColumn(column, "TYPE")) return record.values[column] || record.type || "";
    return record.values[column] || "";
  }

  function recordFilterValue(record, column) {
    return cleanField(resultColumnValue(record, column));
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
  render();
})();
