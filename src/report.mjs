import fs from 'node:fs/promises';
import path from 'node:path';
import { escapeHtml } from './utils.mjs';

export async function writeReport(outputDir, report) {
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(path.join(outputDir, 'report.json'), JSON.stringify(report, null, 2));
  const passed = report.results.filter((item) => item.status === 'passed').length;
  const failed = report.results.length - passed;
  const rows = report.results.map((item) => `
    <tr class="${item.status}">
      <td>${escapeHtml(item.project)}</td><td>${escapeHtml(item.name)}</td><td>${escapeHtml(item.status)}</td>
      <td>${escapeHtml(item.durationMs)}ms</td><td>${escapeHtml(item.error || '')}</td><td>${item.screenshot ? `<a href="${encodeURI(item.screenshot)}">截图</a>` : ''}</td>
    </tr>`).join('');
  const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>Frontend Test Agent</title>
  <style>body{font-family:system-ui;margin:32px;color:#172033;background:#f5f7fb}main{max-width:1100px;margin:auto}.summary{display:flex;gap:16px}.card{padding:16px 22px;background:white;border-radius:10px}.passed{color:#137333}.failed{color:#b3261e}table{width:100%;border-collapse:collapse;background:white;margin-top:20px}th,td{padding:12px;border-bottom:1px solid #e4e7ec;text-align:left}</style>
  </head><body><main><h1>Frontend Test Agent</h1><div class="summary"><div class="card">总计 ${report.results.length}</div><div class="card passed">通过 ${passed}</div><div class="card failed">失败 ${failed}</div></div>
  <table><thead><tr><th>项目</th><th>场景</th><th>结果</th><th>耗时</th><th>错误</th><th>证据</th></tr></thead><tbody>${rows}</tbody></table></main></body></html>`;
  const file = path.join(outputDir, 'index.html');
  await fs.writeFile(file, html);
  return file;
}
