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
app.post("/cancel-auth", async (req, res) => {
  const { orderRef } = req.body;
  try {
    await axios.post(
      "https://appapi2.test.bankid.com/rp/v5.1/cancel",
      {
        orderRef,
      },
      { httpsAgent: httpsAgent },
    );

    res.json({ success: true });
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).json({ error: "Cancel auth failed" });
  }
});

// Start authentication (call this from frontend)
app.post("/start-auth", async (req, res) => {
  const { personalNumber } = req.body;
  let endUserIp =
    req.headers["x-forwarded-for"] || req.connection.remoteAddress;
  if (["::1", "127.0.0.1", "::ffff:127.0.0.1"].includes(endUserIp)) {
    endUserIp = "192.168.1.4"; // placeholder for test
  }

  try {
    const response = await axios.post(
      "https://appapi2.test.bankid.com/rp/v5.1/auth",
      {
        personalNumber,
        endUserIp,
      },
      {
        httpsAgent: httpsAgent,
      },
    );

    const { orderRef, qrStartToken, qrStartSecret } = response.data;
    const orderTime = Date.now(); // in ms

    res.json({ orderRef, qrStartToken, qrStartSecret, orderTime });
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).json({ error: "Start auth failed" });
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
