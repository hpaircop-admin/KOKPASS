// Cloudflare Pages Function — 솔라피(Solapi) 발송 프록시
// 브라우저가 api.solapi.com을 직접 호출하면 CORS에 막히므로,
// 같은 도메인(admin.pages.dev)의 이 서버리스 함수가 대신 호출해준다.
// 경로: /api/solapi-send  (POST)

export async function onRequestPost(context) {
  try {
    const { apiKey, apiSecret, message } = await context.request.json();

    if (!apiKey || !apiSecret || !message) {
      return jsonResponse({ message: 'apiKey, apiSecret, message는 필수입니다.' }, 400);
    }

    // HMAC-SHA256 서명 생성 (솔라피 인증 방식)
    const date = new Date().toISOString();
    const salt = crypto.randomUUID().replace(/-/g, '').slice(0, 32);
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(apiSecret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const sigBuf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(date + salt));
    const signature = Array.from(new Uint8Array(sigBuf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    const solapiRes = await fetch('https://api.solapi.com/messages/v4/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `HMAC-SHA256 apiKey=${apiKey}, date=${date}, salt=${salt}, signature=${signature}`,
      },
      body: JSON.stringify({ message }),
    });

    const data = await solapiRes.json();
    return jsonResponse(data, solapiRes.status);
  } catch (err) {
    return jsonResponse({ message: err.message || '프록시 오류' }, 500);
  }
}

// GET 요청은 헬스체크용
export async function onRequestGet() {
  return jsonResponse({ ok: true, info: 'solapi-send 프록시가 정상 작동 중입니다.' });
}

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
