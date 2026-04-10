const http = require("http");
const http2 = require("http2");

const PORT = 3001;

const server = http.createServer(async (req, res) => {
  // CORS on every response
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);
  const target = url.searchParams.get("url");

  if (!target) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Missing ?url= parameter" }));
    return;
  }

  const allowed = ["data.sec.gov", "www.sec.gov", "efts.sec.gov"];
  let targetUrl;
  try {
    targetUrl = new URL(target);
  } catch {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Invalid URL" }));
    return;
  }

  if (!allowed.includes(targetUrl.hostname)) {
    res.writeHead(403, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Domain not allowed" }));
    return;
  }

  console.log(`Proxying: ${target}`);

  try {
    const data = await fetchH2(targetUrl);
    console.log(`Success: ${data.length} bytes`);
    res.writeHead(200, {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(data),
      "Access-Control-Allow-Origin": "*",
    });
    res.end(data);
  } catch (err) {
    console.error("Error:", err.message);
    res.writeHead(500, {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    });
    res.end(JSON.stringify({ error: err.message }));
  }
});

function fetchH2(targetUrl) {
  return new Promise((resolve, reject) => {
    const client = http2.connect(`https://${targetUrl.hostname}`);

    client.on("error", (err) => {
      reject(err);
      client.close();
    });

    const req = client.request({
      ":method": "GET",
      ":path": targetUrl.pathname + targetUrl.search,
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
      accept: "application/json",
      "accept-encoding": "identity",
    });

    req.on("response", (headers) => {
      const status = headers[":status"];
      if (status !== 200) {
        reject(new Error(`SEC returned HTTP ${status}`));
        client.close();
        return;
      }

      const chunks = [];
      req.on("data", (chunk) => chunks.push(chunk));
      req.on("end", () => {
        resolve(Buffer.concat(chunks).toString("utf-8"));
        client.close();
      });
    });

    req.on("error", (err) => {
      reject(err);
      client.close();
    });

    req.end();
  });
}

server.listen(PORT, () => {
  console.log(`SEC proxy (HTTP/2) running at http://localhost:${PORT}`);
  console.log(
    `Test: http://localhost:${PORT}/?url=https://data.sec.gov/api/xbrl/companyfacts/CIK0000320193.json`,
  );
});
