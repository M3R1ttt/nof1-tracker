# 测试覆盖率报告

本项目已配置完整的测试覆盖率报告系统，帮助开发者了解代码测试覆盖情况。

## 📊 可用的测试命令

### 基础测试命令
```bash
# 运行所有测试
npm test

# 运行测试（监视模式）
npm run test:watch

# 运行测试并生成覆盖率报告
npm run test:coverage
```

### 覆盖率报告命令
```bash
# 生成覆盖率报告（控制台 + HTML + LCOV格式）
npm run test:coverage

# 生成覆盖率报告并输出为LCOV格式（用于CI/CD集成）
npm run test:coverage:report
```

## 📈 覆盖率报告格式

运行 `npm run test:coverage` 后，会生成以下格式的报告：

1. **控制台输出**：直接在终端显示覆盖率摘要
2. **HTML报告**：在 `coverage/index.html` 查看详细的可视化报告
3. **LCOV报告**：在 `coverage/lcov.info` 生成用于CI/CD集成的报告
4. **JSON报告**：在 `coverage/coverage-final.json` 生成机器可读的详细数据

## 🎯 覆盖率阈值

项目设置了以下覆盖率阈值要求：

- **语句覆盖率 (Statements)**: ≥ 80%
- **分支覆盖率 (Branches)**: ≥ 80%
- **函数覆盖率 (Functions)**: ≥ 80%
- **行覆盖率 (Lines)**: ≥ 80%

如果覆盖率低于阈值，测试将会失败。

## 📋 查看详细报告

### HTML报告（推荐）
```bash
# 打开HTML报告（macOS）
open coverage/index.html

# 或在浏览器中手动打开
# file:///path/to/project/coverage/index.html
```

### 控制台摘要
覆盖率命令会在控制台显示类似以下的摘要：
```
-----------------------------|---------|----------|---------|---------|-------------------
File                         | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s
-----------------------------|---------|----------|---------|---------|-------------------
All files                    |   85.42 |    78.91 |   90.12 |   84.56 |
 scripts                     |   75.23 |    65.45 |   85.71 |   74.12 |
  analyze-api.ts             |   75.23 |    65.45 |   85.71 |   74.12 | 120-130,150-160
 services                    |   91.84 |    86.75 |   94.44 |   91.23 |
  config-manager.ts          |   95.00 |    92.31 |   88.88 |   95.00 | 101-105
  risk-manager.ts            |   89.65 |    85.00 |   87.50 |   89.65 | 114,128
  trading-executor.ts        |   82.14 |    78.94 |   75.00 |   82.14 | 56-78
-----------------------------|---------|----------|---------|---------|-------------------
```

## ⚙️ 配置说明

测试覆盖率在 `jest.config.js` 中配置：

```javascript
module.exports = {
  // ... 其他配置
  collectCoverageFrom: [
    'src/**/*.ts',           // 收集所有TypeScript文件的覆盖率
    '!src/**/*.d.ts',        // 排除类型声明文件
    '!src/**/__tests__/**',  // 排除测试文件
    '!src/index.ts',         // 排除入口文件
  ],
  coverageReporters: [
    'text',      // 控制台输出
    'lcov',      // LCOV格式（用于CI/CD）
    'html',      // HTML可视化报告
    'json'       // JSON数据
  ],
  coverageThreshold: {        // 覆盖率阈值
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  }
};
```

## 🔧 CI/CD 集成

### GitHub Actions 示例
```yaml
- name: Run tests with coverage
  run: npm run test:coverage

- name: Upload coverage to Codecov
  uses: codecov/codecov-action@v1
  with:
    file: ./coverage/lcov.info
```

## 📝 提高覆盖率的建议

1. **识别未覆盖的代码**：查看HTML报告中的红色行号
2. **补充测试用例**：为未覆盖的分支和条件编写测试
3. **边界测试**：测试各种边界条件和异常情况
4. **集成测试**：确保不同模块间的交互也被测试覆盖

## 🚨 忽略特定文件

如果需要忽略某些文件不计算覆盖率，可以在 `jest.config.js` 的 `collectCoverageFrom` 数组中添加：

```javascript
collectCoverageFrom: [
  'src/**/*.ts',
  '!src/**/*.d.ts',
  '!src/**/__tests__/**',
  '!src/index.ts',
  '!src/utils/temp.ts',      // 新增忽略文件
  '!src/mocks/**'           // 新增忽略目录
],
```

---

**注意**：保持高覆盖率是好的实践，但不要为了追求100%覆盖率而编写无意义的测试。重点应该是测试有业务逻辑和复杂条件的代码。