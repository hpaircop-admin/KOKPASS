// Cloudflare Pages Function — 솔라피 이미지(MMS 첨부파일) 업로드 프록시
// 브라우저에서 api.solapi.com을 직접 호출하면 CORS에 막히므로,
// 같은 도메인의 이 서버리스 함수가 대신 업로드하고 fileId를 돌려준다.
// 경로: /api/solapi-upload-image  (POST)

export async function onRequestPost(context) {
  try {
    const { apiKey, apiSecret, fileBase64, fileName } = await context.request.json();

    if (!apiKey || !apiSecret || !fileBase64) {
      return jsonResponse({ message: 'apiKey, apiSecret, fileBase64는 필수입니다.' }, 400);
    }

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

    // 솔라피 스토리지 업로드 API는 JSON이 아닌 form(application/x-www-form-urlencoded)
    // 형식을 기대합니다. JSON으로 보내면 조용히 실패해 MMS 전송이 문자로만 대체됩니다.
    const form = new URLSearchParams();
    form.set('file', fileBase64);
    form.set('type', 'MMS');
    form.set('name', fileName || 'barcode.png');

    const solapiRes = await fetch('https://api.solapi.com/storage/v1/files', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `HMAC-SHA256 apiKey=${apiKey}, date=${date}, salt=${salt}, signature=${signature}`,
      },
      body: form.toString(),
    });

    const data = await solapiRes.json();
    return jsonResponse(data, solapiRes.status);
  } catch (err) {
    return jsonResponse({ message: err.message || '이미지 업로드 프록시 오류' }, 500);
  }
}

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
