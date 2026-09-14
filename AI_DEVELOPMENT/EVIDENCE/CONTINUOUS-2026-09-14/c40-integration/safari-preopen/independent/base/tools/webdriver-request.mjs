import http from 'node:http';
import https from 'node:https';

// Appium may spend several minutes building WDA before sending headers.
// Use one explicit total budget, without fetch's separate header-wait limit.
export function requestWebDriver(url, { method = 'POST', body, timeout = 90000 } = {}) {
  const target = new URL(url);
  const transport = target.protocol === 'https:' ? https : target.protocol === 'http:' ? http : null;
  if (!transport) throw new Error(`Unsupported WebDriver protocol: ${target.protocol}`);
  const data = body === undefined ? undefined : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const request = transport.request(target, {
      method,
      signal: AbortSignal.timeout(timeout),
      headers: data === undefined ? undefined : {
        'content-type': 'application/json', 'content-length': Buffer.byteLength(data),
      },
    }, response => {
      response.setEncoding('utf8');
      let text = '';
      response.on('data', chunk => { text += chunk; });
      response.on('error', reject);
      response.on('end', () => {
        let payload;
        try { payload = text ? JSON.parse(text) : {}; }
        catch { reject(new Error(`WebDriver ${method} ${target.pathname}: invalid JSON response (HTTP ${response.statusCode})`)); return; }
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)
          || !Object.prototype.hasOwnProperty.call(payload, 'value')) {
          reject(new Error(`WebDriver ${method} ${target.pathname}: invalid response envelope (HTTP ${response.statusCode})`));
          return;
        }
        if (response.statusCode < 200 || response.statusCode >= 300 || payload?.value?.error) {
          reject(new Error(`WebDriver ${method} ${target.pathname}: ${payload?.value?.message || `HTTP ${response.statusCode}`}`));
          return;
        }
        resolve(payload.value);
      });
    });
    request.on('error', reject);
    request.end(data);
  });
}
