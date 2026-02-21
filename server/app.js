const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

const app = express();
app.use(cors({ origin: process.env.CORS_ORIGIN || "*" }));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.get("/", (req, res) => {
  res.json({ status: "ok", service: "fitness-pay-backend" });
});

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

const requiredEnv = [
  "SEVENPAY_PID",
  "SEVENPAY_KEY",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY"
];

const missing = requiredEnv.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`Missing env: ${missing.join(", ")}`);
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function randomSuffix() {
  return crypto.randomBytes(3).toString("hex").toUpperCase();
}
const PAY_PRICE = Number(process.env.PAY_PRICE || "9.9").toFixed(2);
const PAY_SITENAME = process.env.PAY_SITENAME || "AI Fitness Plan";
const PAY_PRODUCT_NAME = process.env.PAY_PRODUCT_NAME || "AI Fitness Plan Premium";
const FRONTEND_URL = process.env.FRONTEND_URL || "";
const SIGN_MODE = process.env.SIGN_MODE || "append"; // append | ampersand_key

function buildSign(params, key) {
  const keys = Object.keys(params)
    .filter((k) => params[k] !== "" && params[k] !== undefined && params[k] !== null)
    .filter((k) => k !== "sign" && k !== "sign_type")
    .sort();

  const query = keys.map((k) => `${k}=${params[k]}`).join("&");
  const signA = crypto.createHash("md5").update(query + key).digest("hex");
  const signB = crypto.createHash("md5").update(query + `&key=${key}`).digest("hex");
  const sign = SIGN_MODE === "ampersand_key" ? signB : signA;
  return { sign, signA, signB };
}

function normalizeSign(sign) {
  return String(sign || "").trim().toLowerCase();
}

function validPayType(type) {
  return ["wxpay", "alipay", "qqpay"].includes(type);
}

async function insertOrder(order) {
  const { error } = await supabase.from("orders").insert(order);
  if (error) throw error;
}

async function updateOrder(orderNo, patch) {
  const { error } = await supabase
    .from("orders")
    .update(patch)
    .eq("order_no", orderNo);
  if (error) throw error;
}

app.post("/api/pay/create", async (req, res) => {
  try {
    if (missing.length) {
      return res.status(500).json({ error: "Server not configured" });
    }

    const payType = validPayType(req.body.payType) ? req.body.payType : "wxpay";
    const orderNo = `FP${Date.now()}${randomSuffix()}`;

    const notifyUrl = `${process.env.BASE_URL || req.protocol + "://" + req.get("host")}/api/pay/notify`;
    const returnBase = FRONTEND_URL || req.headers.origin || "";
    const returnUrl = returnBase ? `${returnBase}?order_no=${orderNo}` : "";

    const params = {
      pid: process.env.SEVENPAY_PID,
      type: payType,
      out_trade_no: orderNo,
      notify_url: notifyUrl,
      return_url: returnUrl,
      name: PAY_PRODUCT_NAME,
      money: PAY_PRICE,
      sitename: PAY_SITENAME
    };

    const { sign } = buildSign(params, process.env.SEVENPAY_KEY);
    const query = new URLSearchParams({
      ...params,
      sign,
      sign_type: "MD5"
    }).toString();

    const payBase = process.env.SEVENPAY_API_BASE || "https://7pay.top";
    const payUrl = `${payBase}/submit.php?${query}`;

    await insertOrder({
      order_no: orderNo,
      amount: Number(PAY_PRICE),
      status: "pending",
      pay_type: payType
    });

    res.json({ order_no: orderNo, pay_url: payUrl });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Create order failed" });
  }
});

app.get("/api/pay/status", async (req, res) => {
  try {
    const orderNo = String(req.query.order_no || "").trim();
    if (!orderNo) return res.status(400).json({ error: "order_no required" });

    const { data, error } = await supabase
      .from("orders")
      .select("order_no,status,amount,paid_at")
      .eq("order_no", orderNo)
      .maybeSingle();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: "Not found" });
    res.json(data);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Status query failed" });
  }
});

app.all("/api/pay/notify", async (req, res) => {
  try {
    const body = (req.method === "GET" ? req.query : req.body) || {};
    const sign = normalizeSign(body.sign);
    const { signA, signB } = buildSign(body, process.env.SEVENPAY_KEY);
    const expectA = normalizeSign(signA);
    const expectB = normalizeSign(signB);

    if (String(body.pid || "") !== String(process.env.SEVENPAY_PID || "")) {
      return res.send("fail");
    }

    if (sign !== expectA && sign !== expectB) {
      return res.send("fail");
    }

    const orderNo = body.out_trade_no;
    if (!orderNo) return res.send("fail");

    const paid = ["TRADE_SUCCESS", "SUCCESS"].includes(String(body.trade_status || ""));
    if (paid) {
      await updateOrder(orderNo, {
        status: "paid",
        paid_at: new Date().toISOString(),
        trade_no: body.trade_no || null,
        raw_notify: body
      });
    }

    res.send("success");
  } catch (e) {
    console.error(e);
    res.send("fail");
  }
});

module.exports = app;
