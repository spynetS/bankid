const express = require("express");
const https = require("https");
const fs = require("fs");
const axios = require("axios");

const app = express();
app.use(express.json());

// === BankID config ===
// Replace with your actual paths and URLs
const bankIdApiUrl = "https://appapi2.test.bankid.com/rp/v5"; // BankID test URL
const cert = fs.readFileSync("./cert/cert.pem");
const key = fs.readFileSync("./cert/key.pem");

// Create HTTPS agent with client cert for mutual TLS
const httpsAgent = new https.Agent({
  cert,
  key,
  rejectUnauthorized: false, // In production, make sure you verify the server certificate
});

// Start BankID authentication
async function startAuth(personalNumber, endUserIp) {
  const requestData = {
    personalNumber, // can be omitted to let user enter it in BankID app
    endUserIp, // client's IP address
  };

  const response = await axios.post(`${bankIdApiUrl}/auth`, requestData, {
    httpsAgent,
  });
  return response.data; // contains orderRef etc.
}

// Poll BankID for auth status
async function pollStatus(orderRef) {
  const response = await axios.post(
    `${bankIdApiUrl}/collect`,
    { orderRef },
    { httpsAgent },
  );
  return response.data; // contains status and info
}

// === Routes ===

// Start authentication (call this from frontend)
app.post("/start-auth", async (req, res) => {
  console.log("test");
  try {
    const { personalNumber } = req.body;
    let endUserIp =
      req.headers["x-forwarded-for"] || req.connection.remoteAddress;

    // If local IP, replace with a dummy valid IP (ONLY FOR TESTING)
    if (
      endUserIp === "::1" ||
      endUserIp === "127.0.0.1" ||
      endUserIp === "::ffff:127.0.0.1"
    ) {
      endUserIp = "192.168.1.1"; // Or any valid IPv4 you want to test with
    }
    console.log(endUserIp);

    const authResponse = await startAuth(personalNumber, endUserIp);
    res.json(authResponse);
  } catch (err) {
    console.error("start-auth error:", err.response?.data || err.message);
    res.status(500).json({ error: "Failed to start BankID authentication" });
  }
});

// Poll status (pass orderRef received from /start-auth)
app.post("/poll-status", async (req, res) => {
  try {
    const { orderRef } = req.body;
    if (!orderRef) {
      return res.status(400).json({ error: "Missing orderRef" });
    }

    const statusResponse = await pollStatus(orderRef);
    res.json(statusResponse);
  } catch (err) {
    console.error("poll-status error:", err.response?.data || err.message);
    res.status(500).json({ error: "Failed to poll BankID status" });
  }
});

app.get("/", function (req, res) {
  res.sendFile(__dirname + "/index.html");
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`BankID test server running on port ${PORT}`);
});
