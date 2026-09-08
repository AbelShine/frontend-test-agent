import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { runProject } from '../src/runner.mjs';

test('真实浏览器可以执行页面场景并安全拦截写请求', async () => {
  let writes = 0;
  const server = http.createServer((request, response) => {
    if (request.url === '/save') {
      writes += 1;
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end('{"success":true}');
      return;
    }
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(`<!doctype html><html><body><main>测试页面</main><button id="save">保存</button>
      <script>document.querySelector('#save').onclick=()=>fetch('/save',{method:'POST'});</script></body></html>`);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'frontend-test-agent-'));
  try {
    const results = await runProject('demo', {
      name: '测试项目',
      url: `http://127.0.0.1:${address.port}/`,
      routes: ['/'],
      viewports: [{ width: 800, height: 600 }],
    }, [{
      name: '安全提交',
      route: '/',
      actions: [
        { action: 'click', selector: '#save' },
        { action: 'wait', ms: 100 },
        { action: 'assertRequest', method: 'POST', urlIncludes: '/save', min: 1, max: 1 },
      ],
    }], { outputDir: temporary, authDir: temporary, allowWrites: false });
    assert.deepEqual(results.map((item) => item.status), ['passed', 'passed']);
    assert.equal(writes, 0);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
