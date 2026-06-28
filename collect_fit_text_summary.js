const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { pathToFileURL } = require("node:url");

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 2) {
    const key = argv[i];
    const value = argv[i + 1];
    if (!key || !key.startsWith("--") || value === undefined) {
      throw new Error(`Invalid argument near ${key || "<end>"}`);
    }
    args[key.slice(2)] = value;
  }
  return args;
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = require("node:net").createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}

function requestJson(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, options, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        body += chunk;
      });
      res.on("end", () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`HTTP ${res.statusCode}: ${body}`));
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(error);
        }
      });
    });
    req.once("error", reject);
    req.end();
  });
}

async function waitForJson(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      return await requestJson(url);
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw lastError || new Error(`Timed out waiting for ${url}`);
}

function createCdpClient(wsUrl) {
  const socket = new WebSocket(wsUrl);
  let nextId = 1;
  const pending = new Map();

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) {
      return;
    }
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) {
      reject(new Error(message.error.message || JSON.stringify(message.error)));
    } else {
      resolve(message.result);
    }
  });

  return new Promise((resolve, reject) => {
    socket.addEventListener("open", () => {
      resolve({
        send(method, params = {}) {
          const id = nextId++;
          const payload = JSON.stringify({ id, method, params });
          return new Promise((commandResolve, commandReject) => {
            pending.set(id, { resolve: commandResolve, reject: commandReject });
            socket.send(payload);
          });
        },
        close() {
          socket.close();
        },
      });
    });
    socket.addEventListener("error", reject, { once: true });
  });
}

const collectExpression = String.raw`
(async function () {
  if (document.readyState !== "complete") {
    await new Promise((resolve) => window.addEventListener("load", resolve, { once: true }));
  }
  if (document.fonts && document.fonts.ready) {
    await document.fonts.ready.catch(function () {});
  }
  await new Promise((resolve) => requestAnimationFrame(function () {
    requestAnimationFrame(resolve);
  }));

  function cssNumber(style, name, fallback) {
    var raw = style.getPropertyValue(name);
    var match = raw && raw.match(/-?\d+(?:\.\d+)?/);
    return match ? parseFloat(match[0]) : fallback;
  }

  function cleanText(value) {
    return (value || "").replace(/\s+/g, " ").trim();
  }

  function cssNameFromHeader(value) {
    return "--" + cleanText(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + "-font-size";
  }

  var rootStyle = getComputedStyle(document.documentElement);
  var minSize = cssNumber(rootStyle, "--fit-text-min-font-size", 7);
  var items = Array.prototype.slice.call(document.querySelectorAll(".fit-text")).map(function (element) {
    var inlineSize = parseFloat(element.style.fontSize || "");
    if (!inlineSize) {
      return null;
    }

    var cell = element.closest("td");
    var table = element.closest(".brand-table");
    var header = "";
    if (cell) {
      var headerCells = cell.closest("table").querySelectorAll("thead th");
      if (headerCells[cell.cellIndex]) {
        header = cleanText(headerCells[cell.cellIndex].textContent);
      }
    }

    var originalSize = parseFloat(element.dataset.maxFontSize || "");
    if (!originalSize) {
      var headerFontSizeName = header ? cssNameFromHeader(header) : "";
      if (element.closest(".size-badge")) {
        originalSize = cssNumber(rootStyle, "--badge-font-size", NaN);
        if (!originalSize) {
          originalSize = cssNumber(rootStyle, "--size-font-size", NaN);
        }
      } else {
        originalSize = cssNumber(rootStyle, "--cell-font-size", NaN);
        if (!originalSize && headerFontSizeName) {
          originalSize = cssNumber(rootStyle, headerFontSizeName, NaN);
        }
      }
      if (!originalSize) {
        originalSize = inlineSize;
      }
    }

    if (inlineSize >= originalSize - 0.01) {
      return null;
    }

    return {
      page: cleanText((document.querySelector(".chart-page") || {}).dataset && document.querySelector(".chart-page").dataset.page),
      brand: cleanText(table && table.querySelector("h2") ? table.querySelector("h2").innerText : ""),
      column: header,
      text: cleanText(element.textContent),
      originalFontSize: Math.round(originalSize * 100) / 100,
      finalFontSize: Math.round(inlineSize * 100) / 100,
      reachedMinimum: inlineSize <= minSize + 0.01
    };
  }).filter(Boolean);

  var byColumn = {};
  var byText = {};
  items.forEach(function (item) {
    byColumn[item.column || "(unknown)"] = (byColumn[item.column || "(unknown)"] || 0) + 1;
    var key = [item.column || "(unknown)", item.text, item.finalFontSize].join("\u0001");
    if (!byText[key]) {
      byText[key] = {
        column: item.column || "(unknown)",
        text: item.text,
        finalFontSize: item.finalFontSize,
        count: 0
      };
    }
    byText[key].count += 1;
  });

  return {
    total: items.length,
    byColumn: byColumn,
    byText: Object.keys(byText).map(function (key) { return byText[key]; }),
    items: items
  };
})()
`;

async function main() {
  const args = parseArgs(process.argv);
  const edgePath = args.edge;
  const htmlPath = args.html;
  const width = Number.parseInt(args.width || "2000", 10);
  const height = Number.parseInt(args.height || "1800", 10);
  const timeoutMs = Number.parseInt(args.timeout || "15000", 10);

  if (!edgePath || !fs.existsSync(edgePath)) {
    throw new Error("Browser executable was not found.");
  }
  if (!htmlPath || !fs.existsSync(htmlPath)) {
    throw new Error("HTML file was not found.");
  }

  const port = await getFreePort();
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "size-chart-cdp-"));
  const browser = spawn(edgePath, [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    "--force-device-scale-factor=1",
    `--window-size=${width},${height}`,
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    "about:blank",
  ], { stdio: "ignore" });

  let output = null;
  try {
    await waitForJson(`http://127.0.0.1:${port}/json/version`, timeoutMs);
    const fileUrl = pathToFileURL(path.resolve(htmlPath)).href;
    const target = await requestJson(
      `http://127.0.0.1:${port}/json/new?${encodeURIComponent(fileUrl)}`,
      { method: "PUT" }
    );
    const client = await createCdpClient(target.webSocketDebuggerUrl);
    try {
      let result = null;
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
          result = await client.send("Runtime.evaluate", {
            expression: collectExpression,
            awaitPromise: true,
            returnByValue: true,
            timeout: timeoutMs,
          });
          break;
        } catch (error) {
          if (attempt === 3 || !String(error.message || error).includes("Execution context was destroyed")) {
            throw error;
          }
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }
      if (result.exceptionDetails) {
        throw new Error(result.exceptionDetails.text || "Runtime evaluation failed.");
      }
      output = result.result.value || { total: 0, byColumn: {}, byText: [], items: [] };
    } finally {
      client.close();
    }
  } finally {
    if (!browser.killed) {
      browser.kill();
    }
    await new Promise((resolve) => {
      const timer = setTimeout(resolve, 1500);
      browser.once("exit", () => {
        clearTimeout(timer);
        resolve();
      });
    });
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true });
    } catch (_) {
      // Browser shutdown can lag briefly on Windows; the temp profile is safe to ignore.
    }
  }
  process.stdout.write(JSON.stringify(output || { total: 0, byColumn: {}, byText: [], items: [] }));
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exitCode = 1;
});
