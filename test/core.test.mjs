import test from 'node:test';
import assert from 'node:assert/strict';
import { buildScenarios } from '../src/runner.mjs';
import { isWriteMethod, normalizeUrl } from '../src/utils.mjs';

test('每个配置路由都会生成冒烟场景', () => {
  const scenarios = buildScenarios('admin', { routes: ['/', '/users'], viewports: [{ width: 100, height: 100 }] }, []);
  assert.equal(scenarios.length, 2);
  assert.equal(scenarios[1].route, '/users');
});

test('自定义场景会追加到冒烟测试后', () => {
  const scenarios = buildScenarios('admin', { routes: ['/'] }, [{ name: '查询', route: '/', actions: [] }]);
  assert.equal(scenarios.length, 2);
  assert.equal(scenarios[1].name, '查询');
});

test('写请求方法识别正确', () => {
  assert.equal(isWriteMethod('post'), true);
  assert.equal(isWriteMethod('GET'), false);
});

test('URL归一化会移除时间戳参数', () => {
  assert.equal(normalizeUrl('https://example.test/api?_t=1&a=2'), 'https://example.test/api?a=2');
});
