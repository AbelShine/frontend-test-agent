import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { runProject } from '../src/runner.mjs';
import { writeReport } from '../src/report.mjs';

test('登录重定向阻塞业务验证，显式登录场景和修改密码页不受影响', async () => {
  const server = http.createServer((request, response) => {
    response.setHeader('content-type', 'text/html; charset=utf-8');
    if (request.url === '/orders') {
      response.writeHead(302, { location: '/#/login?redirect=/orders' });
      return response.end();
    }
    if (request.url === '/password') return response.end('<main>修改密码<input type="password"></main>');
    response.end('<main>登录<input type="password"></main>');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'frontend-test-login-'));
  try {
    const results = await runProject('fixture', {
      url: `http://127.0.0.1:${server.address().port}`, routes: ['/orders'],
      viewports: [{ width: 800, height: 600 }],
    }, [
      { name: '登录页专项', route: '/#/login', allowLoginPage: true, actions: [{ action: 'assertVisible', selector: 'input' }] },
      { name: '修改密码', route: '/password', actions: [{ action: 'assertVisible', selector: 'input' }] },
    ], { outputDir: temporary, authDir: temporary });
    assert.deepEqual(results.map((item) => item.status), ['blocked', 'passed', 'passed']);
    assert.equal(results[0].errorCode, 'AUTH_REQUIRED');
    assert.equal(results[0].coverage, 'smoke');
    assert.ok(results[0].screenshot);
    assert.match(results[0].error, /npm run auth -- fixture/);
    const report = await writeReport(temporary, { results });
    const html = await fs.readFile(report, 'utf8');
    assert.match(html, /阻塞 1/);
    assert.match(html, /通过 2/);
    assert.match(html, /模拟写入/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(temporary, { recursive: true });
  }
});
