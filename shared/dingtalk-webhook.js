import "dotenv/config";

import crypto from "crypto";

const DINGTALK_SECRET = process.env.DINGTALK_SECRET || "";
const DINGTALK_WEBHOOK = process.env.DINGTALK_WEBHOOK || "";
const enabled = process.env.ENABLE_DINGTALK === "true";

function signWebhookUrl(webhook, secret) {
  if (!secret) return webhook;

  let url = webhook;
  if (secret) {
    const timestamp = Date.now();
    const stringToSign = `${timestamp}\n${secret}`;
    const sign = crypto
      .createHmac("sha256", secret)
      .update(stringToSign)
      .digest("base64");
    const signEncoded = encodeURIComponent(sign);
    const joiner = url.includes("?") ? "&" : "?";
    url = `${url}${joiner}timestamp=${timestamp}&sign=${signEncoded}`;
  }
  return url;
}

async function sendDingTalkText(msg, options = {}) {
  const {
    webhook = DINGTALK_WEBHOOK,
    secret = webhook === DINGTALK_WEBHOOK ? DINGTALK_SECRET : "",
    force = false,
  } = options;

  if ((!enabled && !force) || !webhook) {
    return { ok: false, skipped: true };
  }

  const url = signWebhookUrl(webhook, secret);

  const body = {
    msgtype: "text",
    text: { content: msg },
  };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      console.error(`[DingTalk] Failed: ${response.statusText}`);
      return { ok: false, status: response.status, statusText: response.statusText };
    }
    const responseData = await response.json();
    if (responseData.errcode) {
      console.error(`[DingTalk] Failed: ${responseData.errmsg}`);
      return { ok: false, response: responseData };
    }
    return { ok: true, response: responseData };
  } catch (e) {
    console.error("[DingTalk] Error sending message:", e);
    return { ok: false, error: e };
  }
}

async function dingTalk(msg) {
  return sendDingTalkText(msg);
}

export { sendDingTalkText };
export default dingTalk;
