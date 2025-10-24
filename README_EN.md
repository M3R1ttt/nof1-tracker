# Nof1 AI Agent Copy Trading System

[中文文档](./README.md) | English

![TypeScript](https://img.shields.io/badge/typescript-5.0%2B-blue)
![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-green)
![License](https://img.shields.io/badge/license-MIT-blue)

A command-line tool for tracking nof1.ai AI Agent trading signals and automatically executing Binance futures trades. Supports real-time copy trading from 7 AI quantitative agents with automatic position opening, closing, switching, and stop-loss/take-profit.

## ⚡ Quick Start

```bash
# 1. Install and build
npm install && npm run build

# 2. Configure environment variables
cp .env.example .env
# Edit .env file, add your Binance API keys (must enable futures trading)

# 3. View available AI Agents
npm start -- agents

# 4. Start copy trading (risk-only mode, no real trades)
npm start -- follow deepseek-chat-v3.1 --risk-only

# 5. Continuous monitoring (check every 30 seconds)
npm start -- follow gpt-5 --interval 30
```

## 🚀 Features

- **🤖 AI Agent Copy Trading**: Support 7 AI quantitative trading agents (GPT-5, Gemini, DeepSeek, etc.)
- **📊 Real-time Monitoring**: Configurable polling interval for continuous agent tracking
- **🔄 Smart Copy Trading**: Auto-detect open, close, switch positions (OID changes), and stop-loss/take-profit
- **⚡ Futures Trading**: Full support for Binance USDT perpetual futures, 1x-125x leverage
- **🛡️ Risk Control**: Support `--risk-only` mode for observation without execution

## 🤖 Supported AI Agents

| Agent Name |
|----------|
| **gpt-5** |
| **gemini-2.5-pro** |
| **deepseek-chat-v3.1** |
| **claude-sonnet-4-5** |
| **buynhold_btc** |
| **grok-4** |
| **qwen3-max** |

## ⚙️ Configuration

### 1. Binance API Key Configuration (Important)

This system uses **Binance Futures Trading API**, permissions must be configured correctly:

#### Create API Key
1. Login to [Binance](https://www.binance.com/) → [API Management](https://www.binance.com/en/my/settings/api-management)
2. Create new API key, complete security verification

#### Configure Permissions (Critical)
- ✅ **Enable Futures** - Enable futures trading (Required)
- ✅ **Enable Reading** - Enable read permission (Required)
- ❌ **Enable Withdrawals** - Not needed

#### Testnet Environment (Recommended for Beginners)
1. Visit [Binance Testnet](https://testnet.binancefuture.com/)
2. Create testnet API key
3. Set in `.env`:
   ```env
   BINANCE_TESTNET=true
   BINANCE_API_KEY=testnet_api_key
   BINANCE_API_SECRET=testnet_secret_key
   ```

### 2. Environment Variables

```env
# Binance API Configuration - Must support futures trading
BINANCE_API_KEY=your_binance_api_key_here
BINANCE_API_SECRET=your_binance_api_secret_here
BINANCE_TESTNET=true  # true=testnet, false=mainnet

# Trading Configuration
MAX_POSITION_SIZE=1000
DEFAULT_LEVERAGE=10
RISK_PERCENTAGE=2.0
```

## 📖 Usage

### Core Commands

#### 1. View Available AI Agents
```bash
npm start -- agents
```

#### 2. Copy Trade AI Agent (Core Feature)

**Basic Usage**:
```bash
# Single execution
npm start -- follow deepseek-chat-v3.1

# Continuous monitoring (poll every 30 seconds)
npm start -- follow gpt-5 --interval 30

# Risk control mode (observe only, no execution)
npm start -- follow claude-sonnet-4-5 --risk-only
```

**Advanced Options**:
```bash
# Set total margin (default 10 USDT)
npm start -- follow gpt-5 --total-margin 5000

# Set price tolerance (default 1.0%)
npm start -- follow deepseek-chat-v3.1 --price-tolerance 1.0

# Combined usage
npm start -- follow gpt-5 --interval 30 --total-margin 2000 --risk-only
```

**Command Options**:
- `-r, --risk-only`: Assess only, no execution (safe mode)
- `-i, --interval <seconds>`: Polling interval in seconds, default 30
- `-t, --price-tolerance <percentage>`: Price tolerance percentage, default 1.0%
- `-m, --total-margin <amount>`: Total margin (USDT), default 10

#### 3. System Status Check
```bash
npm start -- status
```

### Copy Trading Strategy

System automatically detects 4 types of trading signals:

1. **📈 New Position (ENTER)** - Auto copy when agent opens new position
2. **📉 Close Position (EXIT)** - Auto copy when agent closes position
3. **🔄 Switch Position (OID Change)** - Close old position then open new when entry_oid changes
4. **🎯 Stop Loss/Take Profit** - Auto close when price reaches profit_target or stop_loss

### Usage Examples

**Beginner Guide**:
```bash
# 1. Check system configuration
npm start -- status

# 2. View available agents
npm start -- agents

# 3. Risk control mode test
npm start -- follow buynhold_btc --risk-only

# 4. Single copy trade test
npm start -- follow deepseek-chat-v3.1
```

**Continuous Monitoring**:
```bash
# Check every 30 seconds
npm start -- follow gpt-5 --interval 30

# Multi-agent parallel monitoring (different terminals)
npm start -- follow gpt-5 --interval 30
npm start -- follow deepseek-chat-v3.1 --interval 45
npm start -- follow claude-sonnet-4-5 --interval 60 --risk-only
```

## 📊 Architecture Overview

```
src/
├── commands/               # Command handlers
│   ├── agents.ts          # Get AI agent list
│   ├── follow.ts          # Copy trade command (core)
│   └── status.ts          # System status check
├── services/              # Core services
│   ├── api-client.ts      # Nof1 API client
│   ├── binance-service.ts # Binance API integration
│   ├── trading-executor.ts # Trade execution engine
│   ├── position-manager.ts # Position management
│   └── futures-capital-manager.ts # Futures capital management
├── scripts/
│   └── analyze-api.ts     # API analysis engine (copy trading strategy)
├── types/                 # TypeScript type definitions
├── utils/                 # Utility functions
└── index.ts               # CLI entry point
```

**Core Flow**:
```
User Command → follow handler → ApiAnalyzer analyzes agent signals
         ↓
    Detect trading actions (open/close/switch/stop-loss)
         ↓
    Generate FollowPlan → TradingExecutor executes
         ↓
    BinanceService → Binance API → Trade completed
```

## ⚠️ Important Notes

### Risk Warning

- **⚠️ Futures Trading Risk**: Futures trading uses leverage, may lead to rapid losses, use with caution
- **🧪 Test Environment**: Strongly recommend testing on Binance Testnet first
- **📊 Risk Management**: Recommend leverage ≤10x, use dedicated trading account
- **💡 Risk Control Mode**: Beginners should use `--risk-only` mode first
- **📈 Copy Trading Risk**: AI Agent strategies do not guarantee profit, assess risks yourself

### Security Recommendations

- Set IP whitelist to restrict access
- Regularly rotate API keys
- Never hardcode keys in code
- Avoid investing funds you cannot afford to lose

## 🔍 Troubleshooting

### Common Issues

**1. Insufficient Futures Trading Permission**
```
Error: Insufficient permissions
```
- ✅ Ensure **Enable Futures** permission is enabled in Binance API management
- ✅ Ensure **Enable Reading** permission is enabled
- Recreate API key with correct permissions

**2. Agent Not Found**
```
Error: Agent xxx not found
```
- Use `npm start -- agents` to view available agent list
- Confirm agent name spelling is correct (case-sensitive)

**3. Network Connection Issues**
```
Error: timeout
```
- Check network connection and firewall settings
- May need VPN to access Binance API in mainland China

**4. API Key Error**
```
Error: Invalid API Key
```
- Check if API key in `.env` file is correct
- Confirm API key has not expired
- Verify complete key is copied (no extra spaces)

## 🔧 Development

```bash
# Run tests
npm test

# Development mode (auto-restart)
npm run dev

# Build
npm run build

# Code check
npm run lint
```

## 📚 More Documentation

- **[Detailed Copy Trading Strategy](./docs/follow-strategy.md)** - Complete copy trading strategy and risk assessment
- **[Quick Reference](./docs/quick-reference.md)** - Quick command reference

## 📄 License

MIT License - See [LICENSE](LICENSE) file for details

---

**Disclaimer**: This tool is for learning and testing purposes only. Actual trading involves risk of capital loss, use with caution and comply with relevant laws and regulations.
