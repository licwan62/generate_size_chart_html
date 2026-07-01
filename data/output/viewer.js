(function () {
  const config = window.SIZE_CHART_VIEWER;
  const app = document.getElementById("app");

  if (!config || !app) {
    return;
  }

  const directories = config.directories || [];
  let activeDirectory = directories[0] || null;
  const frameStates = new Map();
  const directoryIndexes = new Map();
  const directoryMetadata = new Map();
  const tsvIndexes = new Map();
  const searchState = {
    scopeKey: "",
    records: [],
    columns: [],
    query: "",
    selectedMake: "",
    selectedModel: "",
    selectedYear: "",
    status: "idle",
    message: ""
  };
  let searchLoadToken = 0;
  let frameSearchTimer = 0;

  function pagePath(directory, file) {
    return `${config.basePath}${directory.name}/${file}`;
  }

  function render() {
    app.innerHTML = `
      <header class="topbar">
        <div class="topbar-inner">
          <button class="drawer-button" type="button" aria-expanded="false" aria-controls="directory-drawer" title="Directory">≡</button>
          <div class="current-title">
            <div class="root-label">${config.rootLabel}</div>
            <div class="current-path">${activeDirectory ? `${config.rootLabel}/${activeDirectory.name}` : config.rootLabel}</div>
          </div>
          <div class="directory-tabs" role="tablist" aria-label="Folders">
            ${directories.map((directory) => `
              <button class="dir-button${directory === activeDirectory ? " is-active" : ""}" type="button" data-dir="${directory.name}" role="tab" aria-selected="${directory === activeDirectory ? "true" : "false"}">${directory.name}</button>
            `).join("")}
          </div>
        </div>
        <nav class="drawer-panel" id="directory-drawer" aria-label="Directory tree">
          <div class="drawer-content">
            <p class="tree-root">${config.rootLabel}/</p>
            <ol class="tree">
              ${directories.map((directory) => `
                <li class="tree-folder">
                  <button class="tree-folder-header${directory === activeDirectory ? " is-active" : ""}" type="button" data-dir="${directory.name}">
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

      <main class="viewer-main">
        <section class="search-panel" aria-label="Size chart search">
          <div class="search-header">
            <div>
              <h2>Search Records</h2>
              <p>${searchState.query ? "Global search" : (activeDirectory ? activeDirectory.name : config.rootLabel)}</p>
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
          </div>
          <div class="search-summary" role="status"></div>
          <div class="search-results"></div>
        </section>
        <section class="page-stack" aria-label="Selected HTML previews">
          ${activeDirectory ? activeDirectory.files.map((file) => `
            <article class="page-card">
              <div class="page-card-header">
                <div class="page-name">${activeDirectory.name}/${file}</div>
                <a class="open-link" href="${pagePath(activeDirectory, file)}">打开</a>
              </div>
              <div class="frame-shell">
                <iframe class="page-frame" title="${activeDirectory.name}/${file}" src="${pagePath(activeDirectory, file)}"></iframe>
              </div>
            </article>
          `).join("") : ""}
        </section>
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

    app.querySelectorAll("[data-dir]").forEach((button) => {
      button.addEventListener("click", () => {
        const next = directories.find((directory) => directory.name === button.dataset.dir);
        if (next) {
          activeDirectory = next;
          frameStates.clear();
          if (!searchState.query) {
            resetSearchFilters();
          }
          render();
          window.scrollTo({ top: 0, behavior: "instant" });
        }
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
        if (select.dataset.searchField === "make") {
          searchState.selectedMake = select.value;
          searchState.selectedModel = "";
          searchState.selectedYear = "";
        } else if (select.dataset.searchField === "model") {
          searchState.selectedModel = select.value;
          searchState.selectedYear = "";
        } else if (select.dataset.searchField === "year") {
          searchState.selectedYear = select.value;
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
    searchState.selectedMake = "";
    searchState.selectedModel = "";
    searchState.selectedYear = "";
  }

  function currentSearchDirectories() {
    return searchState.query.trim() ? directories : (activeDirectory ? [activeDirectory] : []);
  }

  async function loadSearchIndex(scopeDirectories) {
    if (!scopeDirectories.length) {
      return;
    }

    const token = ++searchLoadToken;
    const scopeKey = scopeDirectories.map((directory) => directory.name).join("|");
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
      if (!activeDirectory || searchState.scopeKey !== activeDirectory.name) {
        return;
      }
      const records = [];
      const columns = [];
      app.querySelectorAll(".page-frame").forEach((frame) => {
        try {
          const file = frame.getAttribute("src").split("/").pop();
          if (frame.contentDocument) {
            records.push(...extractRecords(frame.contentDocument, file, activeDirectory, columns));
          }
        } catch (error) {
          // Some browsers block file previews from being inspected.
        }
      });
      if (records.length) {
        setSearchIndex(activeDirectory.name, records, columns);
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
    if (!metadata.profile && directory.name.startsWith("pick-")) {
      metadata.profile = "pickup";
    }
    if (!metadata.inputPath && directory.name.startsWith("pick-")) {
      metadata.inputPath = "data/input/0630/pick.tsv";
    }
    if (!metadata.storeValue && directory.name.startsWith("pick-")) {
      metadata.storeValue = directory.name.replace(/^pick-/, "");
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
    if (!makeSelect || !modelSelect || !yearSelect) {
      return;
    }

    const ready = searchState.status === "ready";
    const makeRecords = queryFilteredRecords();
    const modelRecords = makeRecords.filter((record) => !searchState.selectedMake || record.make === searchState.selectedMake);
    const yearRecords = modelRecords.filter((record) => !searchState.selectedModel || record.model === searchState.selectedModel);

    fillSelect(makeSelect, "All makes", unique(makeRecords.map((record) => record.make)), searchState.selectedMake);
    fillSelect(modelSelect, "All models", unique(modelRecords.map((record) => record.model)), searchState.selectedModel);
    fillSelect(yearSelect, "All years", uniqueYears(yearRecords), searchState.selectedYear);

    makeSelect.disabled = !ready;
    modelSelect.disabled = !ready || !modelRecords.length;
    yearSelect.disabled = !ready || !yearRecords.length;
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

    const hasFilter = searchState.query.trim() || searchState.selectedMake || searchState.selectedModel || searchState.selectedYear;
    if (!hasFilter) {
      summary.textContent = `${searchState.records.length} rows indexed. Select MAKE, MODEL, or YEAR to search.`;
      results.innerHTML = "";
      return;
    }

    const matches = getSearchMatches();
    summary.textContent = `${matches.length} matching row${matches.length === 1 ? "" : "s"}.`;
    results.innerHTML = renderResultsTable(matches);
  }

  function getSearchMatches() {
    return queryFilteredRecords().filter((record) => {
      if (searchState.selectedMake && record.make !== searchState.selectedMake) {
        return false;
      }
      if (searchState.selectedModel && record.model !== searchState.selectedModel) {
        return false;
      }
      if (searchState.selectedYear && !record.years.includes(Number(searchState.selectedYear))) {
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
    return `
      <div class="results-table-wrap">
        <table class="results-table">
          <thead>
            <tr>
              <th>SOURCE</th>
              <th>MAKE</th>
              ${columns.map((column) => `<th>${escapeHtml(column)}</th>`).join("")}
            </tr>
          </thead>
          <tbody>
            ${records.map((record) => `
              <tr>
                <td><a href="${pagePathByName(record.directory, record.file)}">${escapeHtml(record.source)}</a></td>
                <td>${escapeHtml(record.make)}</td>
                ${columns.map((column) => `<td>${escapeHtml(record.values[column] || "")}</td>`).join("")}
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function resultColumns(records) {
    const usedColumns = searchState.columns.filter((column) => records.some((record) => record.values[column]));
    return usedColumns.length ? usedColumns : ["MODEL", "YEAR", "TYPE", "SIZE"];
  }

  function pagePathByName(directoryName, file) {
    const directory = directories.find((item) => item.name === directoryName) || activeDirectory;
    return directory ? pagePath(directory, file) : "#";
  }

  function fillSelect(select, label, options, selectedValue) {
    select.innerHTML = `<option value="">${label}</option>${options.map((option) => (
      `<option value="${escapeHtml(option)}"${option === selectedValue ? " selected" : ""}>${escapeHtml(option)}</option>`
    )).join("")}`;
  }

  function unique(values) {
    return Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
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
    if (normalized.startsWith("nonpick")) {
      tags.add("nonpick");
    } else if (normalized.startsWith("pick")) {
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
