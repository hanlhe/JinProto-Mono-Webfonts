import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const url = 'https://hanlhe.github.io/JinProto-Mono-Webfonts/';
const output = join(process.env.RUNNER_TEMP || '/tmp', 'jinproto-live-check');
await mkdir(output, { recursive: true });
const report = { url, ok: false, assets: [] };
let browser;
let socket;
const pending = new Map();
let sequence = 0;

function command(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Timed out: ${method}`)); }, 45000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const result = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  assert(!result.exceptionDetails, JSON.stringify(result.exceptionDetails));
  return result.result.value;
}

try {
  const page = await fetch(url);
  report.httpStatus = page.status;
  assert(page.ok, `Live HTML returned HTTP ${page.status}`);
  assert((await page.text()).includes('<title>JinProto Mono</title>'));
  const stylesheet = await fetch(new URL('JinProtoMono.css', url));
  assert(stylesheet.ok, `Stylesheet returned HTTP ${stylesheet.status}`);
  assert((await stylesheet.text()).includes('font-family: "JinProto Mono"'));
  for (const line of (await readFile('SHA256SUMS', 'utf8')).trim().split('\n')) {
    const [expected, name] = line.trim().split(/\s+/);
    const response = await fetch(new URL(name, url));
    assert(response.ok, `${name}: HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.equal(createHash('sha256').update(bytes).digest('hex'), expected, name);
    report.assets.push({ name, status: response.status, bytes: bytes.length });
  }
  browser = spawn('google-chrome', ['--headless=new', '--no-sandbox', '--disable-gpu',
    '--disable-dev-shm-usage', '--remote-debugging-port=9222',
    `--user-data-dir=${join(output, 'chrome')}`], { stdio: 'ignore' });
  let startupError;
  browser.on('error', error => { startupError = error; });
  let target;
  for (let attempt = 0; attempt < 80; attempt++) {
    if (startupError) throw startupError;
    try {
      target = await (await fetch('http://127.0.0.1:9222/json/new?about:blank', { method: 'PUT' })).json();
      break;
    } catch { await sleep(250); }
  }
  assert(target, 'Browser did not start');
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    const request = pending.get(message.id);
    if (!request) return;
    clearTimeout(request.timer);
    pending.delete(message.id);
    if (message.error) request.reject(new Error(JSON.stringify(message.error)));
    else request.resolve(message.result);
  });
  await command('Page.enable');
  await command('Page.navigate', { url });
  for (let attempt = 0; attempt < 150; attempt++) {
    if (await evaluate('document.readyState === "complete" && location.href.includes("JinProto-Mono-Webfonts")')) break;
    await sleep(200);
  }
  report.fonts = await evaluate(`(async () => {
    await document.fonts.load('400 20px "JinProto Mono"');
    await document.fonts.load('700 20px "JinProto Mono"');
    await document.fonts.ready;
    const context = document.createElement('canvas').getContext('2d');
    const widths = [400, 700].map(weight => {
      context.font = weight + ' 20px "JinProto Mono"';
      return { weight, latin: context.measureText('0').width, chinese: context.measureText('中').width };
    });
    return { title: document.title, family: getComputedStyle(document.body).fontFamily,
      faces: Array.from(document.fonts).map(f => ({ family: f.family, weight: f.weight, status: f.status })), widths };
  })()`);
  for (const weight of ['400', '700']) assert(report.fonts.faces.some(f => f.weight === weight && f.status === 'loaded'));
  for (const metrics of report.fonts.widths) assert(Math.abs(metrics.chinese - 2 * metrics.latin) < 0.01);
  for (const [name, width, height, mobile] of [['desktop', 1400, 1800, false], ['mobile', 390, 844, true]]) {
    await command('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
    await sleep(300);
    report[name] = await evaluate('({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth })');
    assert(report[name].scrollWidth <= report[name].width + 1, `${name}: horizontal page overflow`);
    const { cssContentSize } = await command('Page.getLayoutMetrics');
    const image = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true,
      clip: { x: 0, y: 0, width: cssContentSize.width, height: cssContentSize.height, scale: 1 } });
    await writeFile(join(output, `${name}.png`), Buffer.from(image.data, 'base64'));
  }
  report.ok = true;
} catch (error) {
  report.error = error.message;
} finally {
  await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2));
  socket?.close();
  browser?.kill();
}
