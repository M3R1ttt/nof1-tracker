# 插件化通知系统

## 概述

本文档描述了 nof1-tracker 的插件化通知系统架构，将当前硬编码的 Telegram 通知改造为支持 Slack、Discord 等多种通知渠道的可扩展插件系统。

## 架构设计

### 核心组件

#### 1. 通知提供商接口

```typescript
// src/types/notification.ts
export interface TradeNotificationData {
  symbol: string;
  side: 'BUY' | 'SELL';
  quantity: string;
  price: string;
  orderId: string;
  status: string;
  leverage?: number;
  marginType?: string;
}

export interface StopOrderData {
  type: 'take_profit' | 'stop_loss';
  symbol: string;
  price: string;
  orderId: string;
}

export interface NotificationProvider {
  name: string;
  sendMessage(message: string): Promise<void>;
  isEnabled(): boolean;
}
```

#### 2. 插件加载器

插件加载器使用运行时接口验证动态加载通知插件，允许灵活的插件管理而无需复杂的依赖关系。

```typescript
// src/utils/plugin-loader.ts
export class PluginLoader {
  static async loadNotificationPlugin(
    packageName: string,
    config?: any
  ): Promise<NotificationProvider | null> {
    try {
      const pluginModule = await import(packageName);
      const ProviderClass = pluginModule.default ||
                           pluginModule[`${packageName.split('-').pop()}Provider`];

      if (!ProviderClass) {
        throw new Error(`Plugin ${packageName} does not export a provider class`);
      }

      const provider = new ProviderClass(config);

      // 运行时接口验证
      if (this.isValidProvider(provider)) {
        console.log(`✅ Loaded notification plugin: ${packageName}`);
        return provider;
      }

      throw new Error('Plugin does not implement required NotificationProvider interface');
    } catch (error) {
      console.warn(`❌ Failed to load plugin ${packageName}:`, error);
      return null;
    }
  }

  private static isValidProvider(obj: any): obj is NotificationProvider {
    return obj &&
           typeof obj.name === 'string' &&
           typeof obj.sendMessage === 'function' &&
           typeof obj.isEnabled === 'function';
  }
}
```

#### 3. 通知管理器

通知管理器管理多个通知提供商，并处理具有容错能力的消息广播。

```typescript
// src/services/notification-manager.ts
export class NotificationManager {
  private providers: NotificationProvider[] = [];

  addProvider(provider: NotificationProvider): void {
    this.providers.push(provider);
  }

  async notifyTrade(data: TradeNotificationData): Promise<void> {
    const message = MessageFormatter.formatTradeMessage(data);
    await this.broadcastMessage(message);
  }

  private async broadcastMessage(message: string): Promise<void> {
    const enabledProviders = this.providers.filter(p => p.isEnabled());

    // 并发发送，容错处理
    const promises = enabledProviders.map(async provider => {
      try {
        await provider.sendMessage(message);
      } catch (error) {
        console.error(`Failed to send notification via ${provider.name}:`, error);
      }
    });

    await Promise.allSettled(promises);
  }
}
```

#### 4. 消息格式化器

可跨不同通知提供商重用的集中式消息格式化逻辑。

```typescript
// src/utils/message-formatter.ts
export class MessageFormatter {
  static formatTradeMessage(data: TradeNotificationData): string {
    const { symbol, side, quantity, price, orderId, status, leverage, marginType } = data;

    const sideEmoji = side === 'BUY' ? '📈' : '📉';
    const sideText = side === 'BUY' ? 'LONG' : 'SHORT';

    let message = `✅ <b>Trade Executed</b>\n\n`;
    message += `${sideEmoji} <b>${sideText}</b> ${symbol}\n`;
    message += `💰 <b>Quantity:</b> ${quantity}\n`;
    message += `💵 <b>Price:</b> ${price}\n`;
    message += `🆔 <b>Order ID:</b> ${orderId}\n`;
    message += `📊 <b>Status:</b> ${status}\n`;

    if (leverage) {
      message += `⚡ <b>Leverage:</b> ${leverage}x\n`;
    }

    if (marginType) {
      const marginTypeText = marginType === 'ISOLATED' ? '🔒 Isolated' : '🔄 Cross';
      message += `${marginTypeText}\n`;
    }

    return message;
  }
}
```

## 主项目实现

### 1. 配置管理扩展

扩展现有的 ConfigManager 以支持多个通知提供商。

```typescript
// src/services/config-manager.ts
export interface TradingConfig {
  // ... 现有配置
  notificationPlugins?: Record<string, {
    enabled: boolean;
    package: string;
    config: Record<string, any>;
  }>;
}

export class ConfigManager {
  loadFromEnvironment(): void {
    // 加载通知插件配置
    const pluginConfigs = process.env.NOTIFICATION_PLUGINS;
    if (pluginConfigs) {
      const plugins = pluginConfigs.split(',').map(p => p.trim());
      this.config.notificationPlugins = {};

      plugins.forEach(pluginName => {
        const enabled = process.env[`${pluginName.toUpperCase()}_ENABLED`] === 'true';
        const packageName = process.env[`${pluginName.toUpperCase()}_PACKAGE`] || `nof1-${pluginName}-plugin`;

        const pluginConfig: Record<string, any> = {};
        Object.keys(process.env).forEach(key => {
          if (key.startsWith(`${pluginName.toUpperCase()}_`) &&
              !key.endsWith('_ENABLED') &&
              !key.endsWith('_PACKAGE')) {
            const configKey = key.substring(pluginName.length + 1).toLowerCase();
            pluginConfig[configKey] = process.env[key];
          }
        });

        this.config.notificationPlugins[pluginName] = {
          enabled,
          package: packageName,
          config: pluginConfig
        };
      });
    }
  }
}
```

### 2. TradingExecutor 重构

用统一的通知管理器替换硬编码的 Telegram 调用。

```typescript
// src/services/trading-executor.ts
export class TradingExecutor {
  private notificationManager: NotificationManager;

  constructor(..., configManager?: ConfigManager) {
    // ... 现有代码
    this.notificationManager = new NotificationManager();
    this.initializeNotifications();
  }

  private async initializeNotifications(): Promise<void> {
    // 加载内置 Telegram 支持
    const telegramConfig = this.configManager.getConfig().telegram;
    if (telegramConfig.enabled) {
      const telegramProvider = new TelegramService(telegramConfig.token);
      this.notificationManager.addProvider(telegramProvider);
    }

    // 加载外部插件
    const pluginConfigs = this.configManager.getConfig().notificationPlugins;
    if (pluginConfigs) {
      for (const [pluginName, pluginConfig] of Object.entries(pluginConfigs)) {
        if (pluginConfig.enabled) {
          const provider = await PluginLoader.loadNotificationPlugin(
            pluginConfig.package,
            pluginConfig.config
          );
          if (provider) {
            this.notificationManager.addProvider(provider);
          }
        }
      }
    }
  }

  // 替换现有的 Telegram 通知调用
  private async sendTradeNotification(orderResponse: any, tradingPlan: TradingPlan): Promise<void> {
    await this.notificationManager.notifyTrade({
      symbol: orderResponse.symbol,
      side: tradingPlan.side,
      quantity: orderResponse.executedQty,
      price: orderResponse.avgPrice || 'Market',
      orderId: orderResponse.orderId.toString(),
      status: orderResponse.status,
      leverage: tradingPlan.leverage,
      marginType: tradingPlan.marginType
    });
  }
}
```

### 3. Telegram 服务适配器

调整现有的 TelegramService 以实现 NotificationProvider 接口。

```typescript
// src/services/telegram-service.ts
export class TelegramService implements NotificationProvider {
  name = 'telegram';
  private bot: TelegramBot;

  constructor(token: string) {
    this.bot = new TelegramBot(token, { polling: false });
  }

  // 实现 NotificationProvider 接口
  async sendMessage(message: string): Promise<void> {
    const configManager = new ConfigManager();
    configManager.loadFromEnvironment();
    const telegramConfig = configManager.getConfig().telegram;

    if (telegramConfig.chatId) {
      await this.sendMessage(telegramConfig.chatId, message);
    } else {
      throw new Error('Telegram chatId not configured');
    }
  }

  isEnabled(): boolean {
    const configManager = new ConfigManager();
    configManager.loadFromEnvironment();
    const telegramConfig = configManager.getConfig().telegram;
    return !!(telegramConfig.enabled && telegramConfig.token && telegramConfig.chatId);
  }
}
```

## Slack 插件包设计

### 1. 包结构

```
nof1-slack-plugin/
├── package.json
├── README.md
├── tsconfig.json
├── src/
│   ├── index.ts              # 主入口
│   ├── slack-provider.ts     # Slack 提供商实现
│   └── message-formatter.ts  # Slack 消息格式化
├── dist/                     # 编译输出
└── examples/
    └── usage-example.ts      # 使用示例
```

### 2. package.json

```json
{
  "name": "nof1-slack-plugin",
  "version": "1.0.0",
  "description": "Slack notification plugin for nof1-tracker",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "test": "jest"
  },
  "keywords": ["nof1", "slack", "notifications", "trading"],
  "author": "Your Name",
  "license": "MIT",
  "dependencies": {
    "@slack/web-api": "^6.9.0"
  },
  "devDependencies": {
    "@types/node": "^18.0.0",
    "typescript": "^4.9.0"
  }
}
```

### 3. Slack 提供商实现

```typescript
// src/slack-provider.ts
export interface SlackConfig {
  botToken: string;
  channelId: string;
  username?: string;
  iconEmoji?: string;
}

export default class SlackNotificationProvider {
  name = 'slack';
  private client?: any;
  private config: SlackConfig;

  constructor(config: SlackConfig) {
    this.config = config;
  }

  async sendMessage(message: string): Promise<void> {
    if (!this.client) {
      const { WebClient } = await import('@slack/web-api');
      this.client = new WebClient(this.config.botToken);
    }

    try {
      await this.client.chat.postMessage({
        channel: this.config.channelId,
        text: message,
        username: this.config.username || 'Nof1 Trader',
        icon_emoji: this.config.iconEmoji || ':chart_with_upwards_trend:'
      });
    } catch (error) {
      console.error('Failed to send Slack message:', error);
      throw error;
    }
  }

  isEnabled(): boolean {
    return !!(this.config.botToken && this.config.channelId);
  }
}
```

### 4. 消息格式化器

```typescript
// src/message-formatter.ts
export class SlackMessageFormatter {
  static formatTradeMessage(data: any): string {
    const { symbol, side, quantity, price, orderId, leverage, marginType } = data;

    const sideEmoji = side === 'BUY' ? ':chart_with_upwards_trend:' : ':chart_with_downwards_trend:';
    const sideText = side === 'BUY' ? 'LONG' : 'SHORT';

    let message = `${sideEmoji} *Trade Executed*\n\n`;
    message += `*Symbol:* ${symbol}\n`;
    message += `*Position:* ${sideText}\n`;
    message += `*Quantity:* ${quantity}\n`;
    message += `*Price:* ${price}\n`;
    message += `*Order ID:* \`${orderId}\`\n`;

    if (leverage) {
      message += `*Leverage:* ${leverage}x\n`;
    }

    if (marginType) {
      const marginTypeText = marginType === 'ISOLATED' ? ':lock: Isolated' : ':arrows_counterclockwise: Cross';
      message += `*Margin Mode:* ${marginTypeText}\n`;
    }

    return message;
  }
}
```

## 使用指南

### 1. 安装

```bash
npm install nof1-slack-plugin
```

### 2. 环境变量配置

```bash
# .env 文件
NOTIFICATION_PLUGINS=slack
SLACK_ENABLED=true
SLACK_PACKAGE=nof1-slack-plugin
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_CHANNEL_ID=C0123456789
SLACK_USERNAME=Nof1 Trader
SLACK_ICON_EMOJI=:chart_with_upwards_trend:
```

### 3. 代码使用

#### 自动加载
```typescript
import { TradingExecutor } from './services/trading-executor';

// 插件会自动从环境变量加载
const executor = new TradingExecutor();
```

#### 手动添加
```typescript
import SlackPlugin from 'nof1-slack-plugin';

const slackProvider = new SlackPlugin({
  botToken: 'xoxb-your-token',
  channelId: 'C0123456789'
});

executor.addNotificationProvider(slackProvider);
```

### 4. 测试

```bash
# 测试 Slack 插件
npm start -- test-slack
```

## 配置选项

### 环境变量

| 变量 | 描述 | 示例 |
|------|------|------|
| `NOTIFICATION_PLUGINS` | 要加载的插件列表（逗号分隔） | `slack,discord` |
| `{PLUGIN}_ENABLED` | 启用/禁用特定插件 | `SLACK_ENABLED=true` |
| `{PLUGIN}_PACKAGE` | 插件的 NPM 包名 | `SLACK_PACKAGE=nof1-slack-plugin` |
| `{PLUGIN}_BOT_TOKEN` | 插件特定的机器人令牌 | `SLACK_BOT_TOKEN=xoxb-xxx` |
| `{PLUGIN}_CHANNEL_ID` | 插件特定的频道 ID | `SLACK_CHANNEL_ID=C0123456789` |

### 配置文件

```json
{
  "notifications": {
    "enabled": true,
    "providers": {
      "slack": {
        "enabled": true,
        "package": "nof1-slack-plugin",
        "config": {
          "botToken": "xoxb-xxx",
          "channelId": "C0123456789",
          "username": "Nof1 Trader",
          "iconEmoji": ":chart_with_upwards_trend:"
        }
      },
      "discord": {
        "enabled": false,
        "package": "nof1-discord-plugin",
        "config": {
          "webhookUrl": "https://discord.com/api/webhooks/xxx"
        }
      }
    }
  }
}
```

## 实施步骤

### 第一阶段：核心架构
1. 创建 NotificationProvider 接口
2. 实现运行时验证的 PluginLoader
3. 创建统一管理的 NotificationManager
4. 扩展 ConfigManager 支持插件

### 第二阶段：代码重构
1. 重构 TradingExecutor 通知调用
2. 将 TelegramService 迁移到插件架构
3. 更新现有测试用例
4. 确保向后兼容性

### 第三阶段：插件开发
1. 创建 Slack 插件包结构
2. 实现 Slack 通知提供商
3. 添加 Slack 消息格式化
4. 添加配置验证和错误处理

### 第四阶段：文档和示例
1. 用插件系统更新 README
2. 创建插件开发指南
3. 提供配置示例
4. 添加故障排除部分

## 优势

- ✅ **可扩展性**: 通过插件支持任何通知渠道
- ✅ **松耦合**: 核心交易逻辑与通知逻辑分离
- ✅ **向后兼容**: 现有 Telegram 功能保持不变
- ✅ **容错性**: 通知失败不影响交易执行
- ✅ **简单易用**: 动态加载，运行时验证
- ✅ **灵活配置**: 支持环境变量和代码配置

## 未来扩展

### 潜在插件想法

1. **Discord 插件**: 使用 Discord webhooks 进行通知
2. **邮件插件**: 基于 SMTP 的邮件通知
3. **短信插件**: 通过 Twilio 或类似服务发送短信通知
4. **Webhook 插件**: 通用 HTTP webhook 通知
5. **桌面通知插件**: 原生桌面通知

### 高级功能

1. **消息模板**: 为不同提供商提供可定制的消息模板
2. **速率限制**: 内置速率限制防止垃圾信息
3. **消息队列**: 异步消息队列以获得更好的性能
4. **通知路由**: 将不同类型的消息路由到不同的提供商
5. **健康监控**: 对所有提供商进行内置健康检查和监控

---

**最后更新**: 2025-01-30
**版本**: 1.0.0
**兼容**: nof1-tracker v2.0.0+