# Plugin-based Notification System

## Overview

This document describes the plugin-based notification system architecture for nof1-tracker, which transforms the current hardcoded Telegram notifications into an extensible plugin system supporting multiple notification channels like Slack, Discord, etc.

## Architecture

### Core Components

#### 1. Notification Provider Interface

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

#### 2. Plugin Loader

The PluginLoader dynamically loads notification plugins using runtime interface validation, allowing flexible plugin management without complex dependencies.

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

      // Runtime interface validation
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

#### 3. Notification Manager

The NotificationManager manages multiple notification providers and handles message broadcasting with fault tolerance.

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

    // Concurrent sending with fault tolerance
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

#### 4. Message Formatter

Centralized message formatting logic that can be reused across different notification providers.

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

## Implementation in Main Project

### 1. Configuration Management Extension

Extend the existing ConfigManager to support multiple notification providers.

```typescript
// src/services/config-manager.ts
export interface TradingConfig {
  // ... existing configurations
  notificationPlugins?: Record<string, {
    enabled: boolean;
    package: string;
    config: Record<string, any>;
  }>;
}

export class ConfigManager {
  loadFromEnvironment(): void {
    // Load notification plugin configurations
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

### 2. TradingExecutor Refactoring

Replace hardcoded Telegram calls with the unified NotificationManager.

```typescript
// src/services/trading-executor.ts
export class TradingExecutor {
  private notificationManager: NotificationManager;

  constructor(..., configManager?: ConfigManager) {
    // ... existing code
    this.notificationManager = new NotificationManager();
    this.initializeNotifications();
  }

  private async initializeNotifications(): Promise<void> {
    // Load built-in Telegram support
    const telegramConfig = this.configManager.getConfig().telegram;
    if (telegramConfig.enabled) {
      const telegramProvider = new TelegramService(telegramConfig.token);
      this.notificationManager.addProvider(telegramProvider);
    }

    // Load external plugins
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

  // Replace existing Telegram notification calls
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

### 3. Telegram Service Adapter

Adapt the existing TelegramService to implement the NotificationProvider interface.

```typescript
// src/services/telegram-service.ts
export class TelegramService implements NotificationProvider {
  name = 'telegram';
  private bot: TelegramBot;

  constructor(token: string) {
    this.bot = new TelegramBot(token, { polling: false });
  }

  // Implement NotificationProvider interface
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

## Slack Plugin Package Design

### 1. Package Structure

```
nof1-slack-plugin/
├── package.json
├── README.md
├── tsconfig.json
├── src/
│   ├── index.ts              # Main entry
│   ├── slack-provider.ts     # Slack provider implementation
│   └── message-formatter.ts  # Slack message formatting
├── dist/                     # Compiled output
└── examples/
    └── usage-example.ts      # Usage examples
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

### 3. Slack Provider Implementation

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

### 4. Message Formatter

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

## Usage Guide

### 1. Installation

```bash
npm install nof1-slack-plugin
```

### 2. Environment Variables Configuration

```bash
# .env file
NOTIFICATION_PLUGINS=slack
SLACK_ENABLED=true
SLACK_PACKAGE=nof1-slack-plugin
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_CHANNEL_ID=C0123456789
SLACK_USERNAME=Nof1 Trader
SLACK_ICON_EMOJI=:chart_with_upwards_trend:
```

### 3. Code Usage

#### Automatic Loading
```typescript
import { TradingExecutor } from './services/trading-executor';

// Plugins are automatically loaded from environment variables
const executor = new TradingExecutor();
```

#### Manual Addition
```typescript
import SlackPlugin from 'nof1-slack-plugin';

const slackProvider = new SlackPlugin({
  botToken: 'xoxb-your-token',
  channelId: 'C0123456789'
});

executor.addNotificationProvider(slackProvider);
```

### 4. Testing

```bash
# Test Slack plugin
npm start -- test-slack
```

## Configuration Options

### Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `NOTIFICATION_PLUGINS` | Comma-separated list of plugins to load | `slack,discord` |
| `{PLUGIN}_ENABLED` | Enable/disable specific plugin | `SLACK_ENABLED=true` |
| `{PLUGIN}_PACKAGE` | NPM package name for the plugin | `SLACK_PACKAGE=nof1-slack-plugin` |
| `{PLUGIN}_BOT_TOKEN` | Plugin-specific bot token | `SLACK_BOT_TOKEN=xoxb-xxx` |
| `{PLUGIN}_CHANNEL_ID` | Plugin-specific channel ID | `SLACK_CHANNEL_ID=C0123456789` |

### Configuration File

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

## Implementation Steps

### Phase 1: Core Architecture
1. Create NotificationProvider interface
2. Implement PluginLoader with runtime validation
3. Create NotificationManager for unified management
4. Extend ConfigManager for plugin support

### Phase 2: Code Refactoring
1. Refactor TradingExecutor notification calls
2. Migrate TelegramService to plugin architecture
3. Update existing test cases
4. Ensure backward compatibility

### Phase 3: Plugin Development
1. Create Slack plugin package structure
2. Implement Slack notification provider
3. Add Slack message formatting
4. Add configuration validation and error handling

### Phase 4: Documentation and Examples
1. Update README with plugin system
2. Create plugin development guide
3. Provide configuration examples
4. Add troubleshooting section

## Advantages

- ✅ **Extensibility**: Support any notification channel through plugins
- ✅ **Loose Coupling**: Core trading logic separated from notification logic
- ✅ **Backward Compatibility**: Existing Telegram functionality remains unchanged
- ✅ **Fault Tolerance**: Notification failures don't affect trade execution
- ✅ **Easy to Use**: Dynamic loading with runtime validation
- ✅ **Flexible Configuration**: Support both environment variables and code configuration

## Future Extensions

### Potential Plugin Ideas

1. **Discord Plugin**: Using Discord webhooks for notifications
2. **Email Plugin**: SMTP-based email notifications
3. **SMS Plugin**: SMS notifications via Twilio or similar services
4. **Webhook Plugin**: Generic HTTP webhook notifications
5. **Desktop Notification Plugin**: Native desktop notifications

### Advanced Features

1. **Message Templates**: Customizable message templates for different providers
2. **Rate Limiting**: Built-in rate limiting to prevent spam
3. **Message Queuing**: Asynchronous message queuing for better performance
4. **Notification Routing**: Route different message types to different providers
5. **Health Monitoring**: Built-in health checks and monitoring for all providers

---

**Last Updated**: 2025-01-30
**Version**: 1.0.0
**Compatible with**: nof1-tracker v2.0.0+