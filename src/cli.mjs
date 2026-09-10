#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { loadConfig, selectProjects } from './config.mjs';
import { captureAuth, runProject } from './runner.mjs';
import { writeReport } from './report.mjs';
import { nowSlug } from './utils.mjs';

const [command = 'test', selector = 'all', ...flags] = process.argv.slice(2);
const config = await loadConfig();
const selected = selectProjects(config.projects, selector);

if (command === 'auth') {
  if (selected.length !== 1) throw new Error('auth必须指定一个项目');
  await captureAuth(selected[0][0], selected[0][1], config.authDir);
  process.exit(0);
}
if (command !== 'test') throw new Error(`未知命令：${command}`);

const outputDir = path.join(config.root, 'output', nowSlug());
await fs.mkdir(outputDir, { recursive: true });
const results = [];
for (const [projectKey, project] of selected) {
  console.log(`测试 ${project.name}...`);
  results.push(...await runProject(projectKey, project, config.scenarios[projectKey], {
    outputDir,
    authDir: config.authDir,
    headed: flags.includes('--headed'),
    allowWrites: flags.includes('--allow-writes'),
  }));
}
const report = { generatedAt: new Date().toISOString(), safeWriteMode: !flags.includes('--allow-writes'), results };
const reportFile = await writeReport(outputDir, report);
const failed = results.filter((item) => item.status === 'failed').length;
const blocked = results.filter((item) => item.status === 'blocked').length;
console.log(`测试完成：通过${results.length - failed - blocked}，失败${failed}，阻塞${blocked}`);
console.log(`报告：${reportFile}`);
process.exit(failed || blocked ? 1 : 0);
