# Frontend Test Agent

一个面向企业前端项目的可配置自动化测试执行工具。它使用Playwright打开真实页面、执行声明式测试场景、观察控制台与接口，并输出HTML和JSON测试报告。

## 项目价值

- 把需求验收步骤保存成可以重复执行的回归测试。
- 自动完成页面访问、点击、输入、选择、等待和页面断言。
- 可以断言接口方法、地址和请求次数。
- 失败时自动截图，并使用非零退出码支持CI拦截。
- 默认模拟业务写请求，降低误改真实数据的风险。
- 与`frontend-audit-agent`保持独立，也可以被它自动发现并联动执行。

## 安装

```bash
cd frontend-test-agent
npm install
npx playwright install chromium
```

## 配置项目

公共示例位于`config/projects.json`。个人配置建议复制为不会提交的本地文件：

```bash
cp config/projects.json config/projects.local.json
```

配置键应与Audit项目保持一致，例如`admin`、`mobile`和`screen`。

临时检查其他项目时，可以通过`FRONTEND_TEST_PROJECTS_FILE`和`FRONTEND_TEST_SCENARIOS_FILE`指定仓库外的JSON配置，无需改动公共配置或暴露个人路径。

## 保存登录状态

```bash
npm run auth -- admin
```

登录数据保存在`.auth/`且不会提交。每位使用者都需要在自己的电脑上登录。

## 执行测试

```bash
# 测试全部项目
npm start

# 只测试一个项目
npm run test:project -- admin

# 显示浏览器
npm run test:project -- admin --headed
```

默认拦截非鉴权的`POST`、`PUT`、`PATCH`和`DELETE`请求。只有在明确的测试环境、测试账号和测试数据下，才允许执行真实写请求：

```bash
npm run test:project -- admin --allow-writes
```

## 编写测试场景

把个人场景放在`config/scenarios.local.json`。示例：

```json
{
  "admin": [
    {
      "name": "用户查询",
      "route": "/users",
      "actions": [
        { "action": "fill", "selector": "input[placeholder='请输入姓名']", "value": "测试" },
        { "action": "click", "selector": "button:has-text('查询')" },
        { "action": "waitFor", "selector": ".ant-table-tbody" },
        { "action": "assertVisible", "selector": ".ant-table-tbody" },
        { "action": "assertRequest", "method": "GET", "urlIncludes": "/list", "min": 1, "max": 1 }
      ]
    }
  ],
  "mobile": [],
  "screen": []
}
```

支持的动作：`click`、`fill`、`select`、`check`、`waitFor`、`wait`、`assertVisible`、`assertHidden`、`assertText`、`assertRequest`、`assertNotBlank`、`assertNoHorizontalOverflow`。

即使没有配置自定义场景，每个`routes`页面也会自动执行冒烟测试，检查页面加载、空白页、横向溢出、控制台错误和接口错误。

业务页面跳回登录页（包括hash路由）会标记为`blocked`，退出码为1，不会作为测试通过。保存登录状态后重新执行；专门验证登录页面的自定义场景可设置`"allowLoginPage": true`。登录识别为启发式检查，定制SSO仍应配置明确的业务元素断言。

报告区分冒烟/配置场景、模拟写入/真实接口。模拟成功只验证前端在模拟响应下的行为，不验证后端保存。默认按HTTP方法拦截写请求，不能保护使用GET进行删除等非规范接口；此类项目必须先核对接口并使用隔离测试环境。

报告保存在`output/<时间>/index.html`和`report.json`。

## 无业务需求时体验完整流程

把本项目与`frontend-audit-agent`放在同级目录，然后进入Audit项目直接运行：

```bash
npm start
```

Audit会自动启动内置演示页面，执行静态与运行态巡检；随后本项目会自动完成“查询 → 打开弹窗 → 安全模拟提交 → 检查请求次数 → 确认列表刷新”。演示过程不连接真实业务接口，也不需要登录。

## 与Audit联动

推荐把两个项目放在同一个目录：

```text
workspace/
├── frontend-audit-agent/
└── frontend-test-agent/
```

随后在Audit项目中运行：

```bash
npm start -- admin
```

Audit会先完成页面巡检，再把当前项目配置和登录状态传给Test执行自动测试。如果本地没有Test项目，Audit会跳过联动而不会报错。
