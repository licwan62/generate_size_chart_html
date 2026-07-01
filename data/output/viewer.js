(function () {
  const config = window.SIZE_CHART_VIEWER;
  const app = document.getElementById("app");

  if (!config || !app) {
    return;
  }

  const directories = config.directories || [];
  let activeDirectory = directories[0] || null;
  const frameStates = new Map();

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
          render();
          window.scrollTo({ top: 0, behavior: "instant" });
        }
      });
    });

    app.querySelectorAll(".page-frame").forEach((frame) => {
      frame.addEventListener("load", () => {
        measureFrame(frame);
        resizeFrames();
      });
    });
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
