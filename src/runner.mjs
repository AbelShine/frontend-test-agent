import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { isWriteMethod, normalizeUrl } from './utils.mjs';

export async function captureAuth(projectKey, project, authDir) {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(project.url, { waitUntil: 'domcontentloaded' });
  process.stdout.write(`请登录 ${project.name}，完成后回到终端按 Enter。\n`);
  await waitForEnter();
  await fs.mkdir(authDir, { recursive: true });
  await context.storageState({ path: path.join(authDir, `${projectKey}.json`) });
  await browser.close();
}

export async function runProject(projectKey, project, configuredScenarios, { outputDir, authDir, headed = false, allowWrites = false }) {
  const authFile = path.join(authDir, `${projectKey}.json`);
  const storageState = await usefulAuth(authFile) ? authFile : undefined;
  const browser = await chromium.launch({ headless: !headed });
  const context = await browser.newContext(storageState ? { storageState } : {});
  const scenarios = buildScenarios(projectKey, project, configuredScenarios);
  const results = [];
  try {
    for (const scenario of scenarios) {
      results.push(await runScenario(context, projectKey, project, scenario, { outputDir, allowWrites }));
    }
  } finally {
    await browser.close();
  }
  return results;
}

export function buildScenarios(projectKey, project, configured = []) {
  const smoke = (project.routes || ['/']).map((route) => ({
    name: `页面冒烟：${route}`,
    coverage: 'smoke',
    route,
    viewport: project.viewports?.[0],
    actions: [
      { action: 'assertVisible', selector: 'body' },
      { action: 'assertNotBlank' },
      { action: 'assertNoHorizontalOverflow' },
    ],
  }));
  return [...smoke, ...(configured || []).map((scenario) => ({ ...scenario, coverage: 'configured-scenario' }))];
}

async function runScenario(context, projectKey, project, scenario, { outputDir, allowWrites }) {
  const startedAt = Date.now();
  const page = await context.newPage({ viewport: scenario.viewport || project.viewports?.[0] || { width: 1366, height: 768 } });
  const requests = [];
  const consoleErrors = [];
  const httpErrors = [];
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('pageerror', (error) => consoleErrors.push(error.message));
  page.on('response', (response) => {
    if (response.status() >= 400 && ['xhr', 'fetch'].includes(response.request().resourceType())) {
      httpErrors.push(`${response.status()} ${response.url()}`);
    }
  });
  page.on('request', (request) => {
    if (['xhr', 'fetch'].includes(request.resourceType())) requests.push({
      method: request.method(), url: normalizeUrl(request.url()), payload: parsePayload(request.postData()), at: Date.now(),
    });
  });
  if (!allowWrites) {
    await page.route('**/*', async (route) => {
      const request = route.request();
      if (!['xhr', 'fetch'].includes(request.resourceType()) || !isWriteMethod(request.method()) || isAuthRequest(request.url())) return route.continue();
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, code: 200, message: '测试模拟成功', result: null }) });
    });
  }
  let error = '';
  let errorCode = '';
  let screenshot = '';
  try {
    const target = new URL(scenario.route || '/', project.url).toString();
    await page.goto(target, { waitUntil: 'domcontentloaded', timeout: scenario.timeoutMs || 20000 });
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
    if (!scenario.allowLoginPage) await assertBusinessPage(page, projectKey);
    for (const action of scenario.actions || []) await executeAction(page, action, requests);
    if (!scenario.allowLoginPage) await assertBusinessPage(page, projectKey);
    if (consoleErrors.length) throw new Error(`控制台错误：${consoleErrors[0]}`);
    if (httpErrors.length) throw new Error(`接口错误：${httpErrors[0]}`);
  } catch (caught) {
    error = caught instanceof Error ? caught.message : String(caught);
    errorCode = caught.code || '';
    screenshot = `${safeName(projectKey)}-${safeName(scenario.name)}.png`;
    await page.screenshot({ path: path.join(outputDir, screenshot), fullPage: true }).catch(() => {});
  }
  await page.close();
  return {
    project: projectKey,
    name: scenario.name,
    status: errorCode === 'AUTH_REQUIRED' ? 'blocked' : error ? 'failed' : 'passed',
    durationMs: Date.now() - startedAt,
    error,
    errorCode,
    coverage: scenario.coverage,
    screenshot,
    requestCount: requests.length,
    writeMode: allowWrites ? 'real' : 'mocked',
  };
}

async function assertBusinessPage(page, projectKey) {
  const url = new URL(page.url());
  const loginRoute = /(?:^|\/)(?:login|signin|sign-in|sso)(?:\/|$)/i;
  const path = url.pathname;
  const hashPath = url.hash.replace(/^#/, '').split('?')[0];
  const text = await page.locator('body').innerText({ timeout: 2000 }).catch(() => '');
  const loginForm = await page.locator('input[type="password"]:visible').count() > 0
    && /(?:登录|登\s+录|sign\s*in|log\s*in)/i.test(text);
  if (loginRoute.test(path) || loginRoute.test(hashPath) || loginForm) {
    const error = new Error(`当前停留在登录页，业务验证未执行。请运行 npm run auth -- ${projectKey} 保存登录状态后重试。若场景专门测试登录页，请设置 allowLoginPage: true。`);
    error.code = 'AUTH_REQUIRED';
    throw error;
  }
}

export async function executeAction(page, action, requests = []) {
  const locator = action.selector ? page.locator(action.selector).first() : null;
  switch (action.action) {
    case 'click': return locator.click();
    case 'fill': return locator.fill(String(action.value ?? ''));
    case 'select': return locator.selectOption(action.value);
    case 'check': return locator.check();
    case 'waitFor': return locator.waitFor({ state: action.state || 'visible', timeout: action.timeoutMs || 5000 });
    case 'wait': return page.waitForTimeout(action.ms || 300);
    case 'assertVisible': return locator.waitFor({ state: 'visible', timeout: action.timeoutMs || 5000 });
    case 'assertHidden': return locator.waitFor({ state: 'hidden', timeout: action.timeoutMs || 5000 });
    case 'assertText': {
      const text = await locator.textContent();
      if (!String(text || '').includes(String(action.value))) throw new Error(`${action.selector} 未包含文本 ${action.value}`);
      return;
    }
    case 'assertNotBlank': {
      const hasContent = await page.evaluate(() => {
        const root = document.querySelector('#app, #root, main') || document.body;
        const visibleMedia = root.querySelector('canvas, svg, img, video, table, form, button, input');
        return Boolean(root.textContent?.trim() || visibleMedia || root.children.length);
      });
      if (!hasContent) throw new Error('页面没有可见内容，可能是空白页');
      return;
    }
    case 'assertNoHorizontalOverflow': {
      const overflow = await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth);
      if (overflow > (action.tolerancePx ?? 4)) throw new Error(`页面横向溢出${Math.round(overflow)}px`);
      return;
    }
    case 'assertRequest': {
      const count = requests.filter((item) => (!action.method || item.method === action.method.toUpperCase()) && (!action.urlIncludes || item.url.includes(action.urlIncludes))).length;
      if (count < (action.min ?? 1) || (action.max != null && count > action.max)) throw new Error(`请求断言失败：匹配${count}次`);
      return;
    }
    default: throw new Error(`不支持的测试动作：${action.action}`);
  }
}

function parsePayload(value) { if (!value) return null; try { return JSON.parse(value); } catch { return value; } }
function safeName(value) { return String(value).replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 80); }
function isAuthRequest(value) { return /(login|logout|token|oauth|sso|captcha|randomImage)/i.test(value); }
async function usefulAuth(file) { try { const state = JSON.parse(await fs.readFile(file, 'utf8')); return state.cookies?.length || state.origins?.some((item) => item.localStorage?.length); } catch { return false; } }
function waitForEnter() { return new Promise((resolve) => { process.stdin.resume(); process.stdin.once('data', resolve); }); }
