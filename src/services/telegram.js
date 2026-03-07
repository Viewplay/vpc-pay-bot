// src/services/telegram.js
export async function sendTelegramMessage({ token, chatId, text }) {
  const t = String(token || "").trim();
  const c = String(chatId || "").trim();
  const msg = String(text || "").trim();

  if (!t || !c || !msg) return { ok: false, skipped: true };

  const url = `https://api.telegram.org/bot${t}/sendMessage`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      chat_id: c,
      text: msg,
      disable_web_page_preview: true,
    }),
  });

  const data = await res.json().catch(() => ({}));
  return { ok: res.ok && data?.ok === true, data };
}