# OKX API Integration Guide

## 📋 Table of Contents

1. [Project Overview](#project-overview)
2. [Architecture Design](#architecture-design)
3. [Phased Implementation Plan](#phased-implementation-plan)
4. [Technical Implementation Details](#technical-implementation-details)
5. [Configuration Guide](#configuration-guide)
6. [Development Checklist](#development-checklist)
7. [Testing Strategy](#testing-strategy)
8. [Risk Assessment](#risk-assessment)

---

## Project Overview

### 🎯 Integration Objectives

Add OKX futures trading API support to the nof1-tracker project to achieve:

- **Feature Parity**: Maintain identical functionality with existing Binance API
- **Seamless Switching**: Users can switch between Binance and OKX through simple configuration
- **Unified Experience**: Same CLI commands, same trading logic, same risk management
- **Backward Compatibility**: No impact on existing Binance users' experience

### 📊 Current Binance Feature Analysis

Based on code analysis, current Binance features include:

#### Core Trading Functions
- ✅ Account information query
- ✅ Position information query
- ✅ Futures order placement (market, limit, stop loss, take profit)
- ✅ Leverage setting (1-125x)
- ✅ Margin mode setting (isolated/cross)
- ✅ Order management (query, cancel)
- ✅ User trade history query

#### Risk Management Features
- ✅ Balance check and margin verification
- ✅ Automatic quantity adjustment
- ✅ Price precision handling
- ✅ Time synchronization and retry mechanism
- ✅ Automatic stop loss/take profit order creation

#### Advanced Features
- ✅ Telegram notification integration
- ✅ Detailed logging
- ✅ Error handling and recovery
- ✅ Connection management and resource cleanup

### 🚧 Technical Challenges

#### 1. API Differences Adaptation

| Feature | Binance | OKX | Solution |
|---------|---------|-----|----------|
| **Authentication** | API Key + Secret | API Key + Secret + Passphrase | Extend authentication interface |
| **Signature Algorithm** | HMAC-SHA256 | HMAC-SHA256 + different parameter format | Adapt signature generation |
| **Symbol Format** | BTCUSDT | BTC-USDT-SWAP | Symbol conversion layer |
| **Base URL** | fapi.binance.com | www.okx.com | Configuration management |
| **Endpoint Path** | /fapi/v1/ | /api/v5/ | Endpoint mapping |

#### 2. Data Format Differences

```typescript
// Binance position response format
interface BinancePosition {
  symbol: string;
  positionAmt: string;
  entryPrice: string;
  markPrice: string;
  unRealizedProfit: string;
  leverage: string;
  // ...
}

// OKX position response format (needs adaptation)
interface OkxPosition {
  instId: string;        // corresponds to symbol
  pos: string;          // corresponds to positionAmt
  avgPx: string;        // corresponds to entryPrice
  markPx: string;       // corresponds to markPrice
  upl: string;          // corresponds to unRealizedProfit
  lever: string;        // corresponds to leverage
  // ...
}
```

#### 3. Precision and Specification Differences

- **Minimum Order Size**: Different minimum quantity requirements for different trading pairs
- **Price Precision**: OKX and Binance may have different decimal places for prices
- **Leverage Limits**: OKX's leverage range and rules may differ from Binance

---

## Architecture Design

### 🏗️ Overall Architecture

Adopting **Abstract Factory Pattern + Strategy Pattern** design to achieve exchange decoupling and extensibility:

```
┌─────────────────────────────────────────────────────────────┐
│                    CLI Layer                               │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │   agents    │  │    follow   │  │   status    │        │
│  └─────────────┘  └─────────────┘  └─────────────┘        │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                Trading Executor                            │
│  ┌─────────────────────────────────────────────────────┐    │
│  │           Exchange Factory                          │    │
│  │  ┌─────────────┐    ┌─────────────┐                │    │
│  │  │  Binance    │    │     OKX     │                │    │
│  │  │  Service    │    │   Service   │                │    │
│  │  └─────────────┘    └─────────────┘                │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│              Exchange Interface                            │
│           (Unified Service Abstraction Layer)             │
└─────────────────────────────────────────────────────────────┘
```

### 🔌 Interface Design

#### 1. Core Service Interface

```typescript
// src/services/exchange.interface.ts
export interface ExchangeService {
  // Connection validation
  validateConnection(): Promise<boolean>;
  getServerTime(): Promise<number>;
  destroy(): void;

  // Account management
  getAccountInfo(): Promise<AccountInfo>;
  getPositions(): Promise<PositionResponse[]>;
  getAllPositions(): Promise<PositionResponse[]>;

  // Trading operations
  placeOrder(order: ExchangeOrder): Promise<OrderResponse>;
  cancelOrder(symbol: string, orderId: number | string): Promise<OrderResponse>;
  getOrderStatus(symbol: string, orderId: number | string): Promise<OrderResponse>;
  getOpenOrders(symbol?: string): Promise<OrderResponse[]>;
  cancelAllOrders(symbol: string): Promise<any>;

  // Risk management
  setLeverage(symbol: string, leverage: number): Promise<any>;
  setMarginType(symbol: string, marginType: 'ISOLATED' | 'CROSSED'): Promise<any>;

  // Market data
  getExchangeInformation(): Promise<any>;
  getSymbolInfo(symbol: string): Promise<any>;
  get24hrTicker(symbol?: string): Promise<any>;

  // Trade history
  getUserTrades(
    symbol?: string,
    startTime?: number,
    endTime?: number,
    fromId?: number | string,
    limit?: number
  ): Promise<UserTrade[]>;

  // Utility methods
  convertSymbol(symbol: string): string;
  formatQuantity(quantity: number | string, symbol: string): string;
  formatPrice(price: number | string, symbol: string): string;
}
```

#### 2. Unified Data Types

```typescript
// Unified order type
export interface ExchangeOrder {
  symbol: string;
  side: "BUY" | "SELL";
  type: "MARKET" | "LIMIT" | "STOP" | "TAKE_PROFIT" | "TAKE_PROFIT_MARKET" | "STOP_MARKET";
  quantity: string;
  leverage?: number;
  price?: string;
  stopPrice?: string;
  timeInForce?: "GTC" | "IOC" | "FOK";
  closePosition?: string;
}

// Unified position response
export interface PositionResponse {
  symbol: string;
  positionAmt: string;
  entryPrice: string;
  markPrice: string;
  unRealizedProfit: string;
  liquidationPrice: string;
  leverage: string;
  marginType: string;
  positionSide: string;
  notional: string;
  updateTime: number;
}

// Unified order response
export interface OrderResponse {
  orderId: string | number;
  symbol: string;
  status: string;
  clientOrderId: string;
  price: string;
  avgPrice: string;
  origQty: string;
  executedQty: string;
  side: string;
  type: string;
  time: number;
  updateTime: number;
}
```

#### 3. Factory Pattern Implementation

```typescript
// src/services/exchange-factory.ts
export class ExchangeFactory {
  static createExchange(
    exchange: 'binance' | 'okx',
    config: ExchangeConfig
  ): ExchangeService {
    switch (exchange) {
      case 'binance':
        return new BinanceService(
          config.apiKey,
          config.apiSecret,
          config.testnet
        );
      case 'okx':
        return new OkxService(
          config.apiKey,
          config.apiSecret,
          config.passphrase,
          config.testnet
        );
      default:
        throw new Error(`Unsupported exchange: ${exchange}`);
    }
  }
}

export interface ExchangeConfig {
  apiKey: string;
  apiSecret: string;
  passphrase?: string;  // OKX specific
  testnet?: boolean;
}
```

### 🔄 Configuration Management Extension

#### 1. Environment Variables Extension

```bash
# New OKX configurations
OKX_API_KEY=your_okx_api_key
OKX_API_SECRET=your_okx_api_secret
OKX_API_PASSPHRASE=your_okx_passphrase
OKX_TESTNET=true

# Exchange selection (optional, default binance)
DEFAULT_EXCHANGE=binance  # binance | okx
```

#### 2. Configuration Manager Update

```typescript
// src/services/config-manager.ts
export interface AppConfig {
  exchange: {
    type: 'binance' | 'okx';
    binance?: BinanceConfig;
    okx?: OkxConfig;
  };
  // ... other configurations
}

export interface BinanceConfig {
  apiKey: string;
  apiSecret: string;
  testnet: boolean;
}

export interface OkxConfig {
  apiKey: string;
  apiSecret: string;
  passphrase: string;
  testnet: boolean;
}
```

---

## Phased Implementation Plan

### 📅 Phase 1: Infrastructure Design (1-2 days)

#### Task List

- [ ] **1.1 Create Interface Definition Files**
  ```bash
  touch src/services/exchange.interface.ts
  touch src/services/exchange-factory.ts
  touch src/types/exchange.types.ts
  ```

- [ ] **1.2 Define Unified Interfaces**
  - Implement `ExchangeService` interface
  - Define common data types
  - Create factory pattern foundation

- [ ] **1.3 Update Configuration System**
  - Extend `constants.ts` with OKX-related constants
  - Update `config-manager.ts` to support multi-exchange configuration
  - Modify `.env.example` to add OKX configuration template

- [ ] **1.4 Create Test Foundation**
  - Create test framework for exchange interfaces
  - Design Mock services for testing

#### Acceptance Criteria

- ✅ Interface definitions are complete and type-safe
- ✅ Factory pattern can correctly create Binance service instances
- ✅ Configuration system supports reading OKX configuration
- ✅ Basic test framework is functional

---

### 📅 Phase 2: OKX Service Implementation (2-3 days)

#### Task List

- [ ] **2.1 Create OKX Service Basic Structure**
  ```bash
  touch src/services/okx-service.ts
  ```

- [ ] **2.2 Implement Authentication Mechanism**
  ```typescript
  // OKX-specific authentication (including passphrase)
  private createSignature(timestamp: string, method: string, path: string, body: string): string {
    const message = timestamp + method + path + body;
    return CryptoJS.HmacSHA256(message, this.apiSecret).toString(CryptoJS.enc.Base64);
  }
  ```

- [ ] **2.3 Implement Core API Methods**
  - `getAccountInfo()` - Account information query
  - `getPositions()` - Position information query
  - `placeOrder()` - Order placement functionality
  - `setLeverage()` - Leverage setting
  - `setMarginType()` - Margin mode setting

- [ ] **2.4 Symbol and Precision Handling**
  ```typescript
  // OKX symbol conversion: BTC → BTC-USDT-SWAP
  public convertSymbol(symbol: string): string {
    if (symbol.includes('-')) return symbol; // Already OKX format
    return `${symbol}-USDT-SWAP`;
  }
  ```

- [ ] **2.5 Error Handling Adaptation**
  - Adapt OKX-specific error codes
  - Implement retry mechanism and time synchronization
  - Unify error message format

#### Acceptance Criteria

- ✅ OKX service can successfully connect to testnet
- ✅ Basic API calls (account info, position query) work normally
- ✅ Symbol conversion and precision formatting are correct
- ✅ Error handling mechanism is comprehensive

---

### 📅 Phase 3: Code Refactoring (1-2 days)

#### Task List

- [ ] **3.1 Refactor BinanceService**
  - Make `BinanceService` implement `ExchangeService` interface
  - Update method signatures to match interface definition
  - Maintain backward compatibility

- [ ] **3.2 Update TradingExecutor**
  ```typescript
  export class TradingExecutor {
    private exchangeService: ExchangeService;
    private exchangeType: 'binance' | 'okx';

    constructor(
      exchangeType: 'binance' | 'okx' = 'binance',
      config?: ExchangeConfig
    ) {
      this.exchangeType = exchangeType;
      this.exchangeService = ExchangeFactory.createExchange(exchangeType, config || {});
    }
  }
  ```

- [ ] **3.3 Update Dependency Injection**
  - Modify all places using `BinanceService`
  - Create exchange instances through factory pattern
  - Update constructor signatures

- [ ] **3.4 Data Adaptation Layer**
  - Ensure all returned data formats are unified
  - Handle exchange-specific field differences
  - Update related type definitions

#### Acceptance Criteria

- ✅ Existing Binance functionality works completely without regression
- ✅ `TradingExecutor` supports dynamic exchange switching
- ✅ All unit tests pass
- ✅ Code quality checks pass

---

### 📅 Phase 4: CLI and Entry Point Updates (1 day)

#### Task List

- [ ] **4.1 Update CLI Parameters**
  ```typescript
  // Add exchange selection parameters
  program
    .option('-e, --exchange <exchange>', 'Exchange to use (binance|okx)', 'binance')
    .option('--okx-api-key <key>', 'OKX API key')
    .option('--okx-api-secret <secret>', 'OKX API secret')
    .option('--okx-passphrase <passphrase>', 'OKX API passphrase');
  ```

- [ ] **4.2 Update Main Entry Point**
  - Modify `src/index.ts` to support exchange parameters
  - Implement configuration validation and error prompts
  - Update help information

- [ ] **4.3 Update Command Processors**
  - Modify command files under `src/commands/`
  - Support passing exchange configuration
  - Update error handling

- [ ] **4.4 Validation and Testing**
  - Test CLI parameter parsing
  - Verify configuration is passed correctly
  - Test error scenario handling

#### Acceptance Criteria

- ✅ CLI supports `--exchange okx` parameter
- ✅ OKX configuration parameters are passed correctly
- ✅ Help information includes new parameter descriptions
- ✅ Error prompts are clear and friendly

---

### 📅 Phase 5: Testing and Documentation (1-2 days)

#### Task List

- [ ] **5.1 Create OKX Test Suite**
  ```bash
  touch src/services/__tests__/okx-service.test.ts
  ```

- [ ] **5.2 Integration Testing**
  - Use OKX testnet for end-to-end testing
  - Verify all core functionalities
  - Test error scenarios and recovery mechanisms

- [ ] **5.3 Documentation Updates**
  - Update `README.md` to add OKX configuration instructions
  - Create OKX API application guide
  - Update environment variable documentation

- [ ] **5.4 Performance Testing**
  - Compare response times between Binance and OKX
  - Verify memory usage
  - Test concurrent request handling

#### Acceptance Criteria

- ✅ All tests pass (including new OKX tests)
- ✅ Documentation is complete and accurate
- ✅ Performance meets expectations
- ✅ User experience is good

---

## Technical Implementation Details

### 🔐 OKX Authentication Mechanism

OKX API uses HmacSHA256 signature, requiring additional passphrase:

```typescript
class OkxService implements ExchangeService {
  private createSignature(
    timestamp: string,
    method: string,
    path: string,
    body: string
  ): string {
    const message = timestamp + method + path + body;
    return CryptoJS.HmacSHA256(message, this.apiSecret).toString(CryptoJS.enc.Base64);
  }

  private async makeSignedRequest<T>(
    endpoint: string,
    method: 'GET' | 'POST' | 'DELETE' = 'GET',
    params: Record<string, any> = {}
  ): Promise<T> {
    const timestamp = new Date().toISOString();
    const body = method === 'GET' ? '' : JSON.stringify(params);
    const sign = this.createSignature(timestamp, method, endpoint, body);

    const headers = {
      'OK-ACCESS-KEY': this.apiKey,
      'OK-ACCESS-SIGN': sign,
      'OK-ACCESS-TIMESTAMP': timestamp,
      'OK-ACCESS-PASSPHRASE': this.passphrase,
      'Content-Type': 'application/json',
    };

    // Send request...
  }
}
```

### 🔄 Symbol Conversion Mapping

| NOF1 Format | Binance Format | OKX Format | Conversion Logic |
|-------------|----------------|------------|------------------|
| BTC | BTCUSDT | BTC-USDT-SWAP | appendUSDT / insert-dash-SWAP |
| ETH | ETHUSDT | ETH-USDT-SWAP | appendUSDT / insert-dash-SWAP |
| BNB | BNBUSDT | BNB-USDT-SWAP | appendUSDT / insert-dash-SWAP |

```typescript
// Universal symbol converter
export class SymbolConverter {
  static toBinance(symbol: string): string {
    return symbol.endsWith('USDT') ? symbol : `${symbol}USDT`;
  }

  static toOkx(symbol: string): string {
    if (symbol.includes('-')) return symbol;
    return `${symbol}-USDT-SWAP`;
  }

  static fromExchange(symbol: string, exchange: 'binance' | 'okx'): string {
    if (exchange === 'binance') {
      return symbol.replace('USDT', '');
    } else {
      return symbol.replace('-USDT-SWAP', '');
    }
  }
}
```

### 📊 Precision Handling Strategy

OKX and Binance may have different precision requirements, need dynamic fetching:

```typescript
class OkxService implements ExchangeService {
  private symbolPrecisionCache: Map<string, any> = new Map();

  async getSymbolPrecision(symbol: string): Promise<{lot: number, price: number}> {
    const okxSymbol = this.convertSymbol(symbol);

    if (this.symbolPrecisionCache.has(okxSymbol)) {
      return this.symbolPrecisionCache.get(okxSymbol);
    }

    try {
      const response = await this.makePublicRequest('/api/v5/public/instruments', {
        instType: 'SWAP',
        instId: okxSymbol
      });

      const instrument = response.data[0];
      const precision = {
        lot: Math.abs(Math.log10(parseFloat(instrument.minSz))),
        price: Math.abs(Math.log10(parseFloat(instrument.tickSz)))
      };

      this.symbolPrecisionCache.set(okxSymbol, precision);
      return precision;
    } catch (error) {
      // Return default precision
      return { lot: 3, price: 2 };
    }
  }

  async formatQuantity(quantity: number | string, symbol: string): Promise<string> {
    const precision = await this.getSymbolPrecision(symbol);
    const quantityNum = typeof quantity === 'string' ? parseFloat(quantity) : quantity;
    return quantityNum.toFixed(precision.lot);
  }
}
```

### ⚠️ Error Handling Adaptation

OKX uses different error code systems:

```typescript
// OKX error code mapping
const OKX_ERROR_MAP: Record<string, string> = {
  '51000': 'Invalid API Key',
  '51008': 'Timestamp is invalid',
  '51020': 'Signature not valid',
  '51100': 'Invalid IP',
  '51108': 'Invalid passphrase',
  '51112': 'Invalid sign',
  '53001': 'Service unavailable',
  '53002': 'System busy',
  '53003': 'Internal error',
  '53004': 'Record not found',
  '53005': 'No operation permission',
  '53006': 'Request too frequent',
  '51116': 'Insufficient balance',
  '51144': 'Order size exceeds limit',
  '51146': 'Order not found',
  '51160': 'Invalid symbol',
};

function handleOkxError(error: any): never {
  const errorCode = error?.data?.[0]?.sCode;
  const errorMessage = error?.data?.[0]?.sMsg;

  const mappedMessage = OKX_ERROR_MAP[errorCode] || errorMessage || 'Unknown OKX API error';

  if (['51008', '51020', '51112'].includes(errorCode)) {
    // Time sync or signature error, need to resync
    throw new Error(`OKX Authentication Error: ${mappedMessage}. Please check your API credentials.`);
  }

  if (errorCode === '51116') {
    throw new Error(`OKX Insufficient Balance: ${mappedMessage}`);
  }

  throw new Error(`OKX API Error [${errorCode}]: ${mappedMessage}`);
}
```

---

## Configuration Guide

### 🔑 OKX API Application

#### 1. Register OKX Account

1. Visit [OKX Official Website](https://www.okx.com) to register an account
2. Complete identity verification (KYC)
3. Enable futures trading functionality

#### 2. Create API Key

1. Log in to OKX, go to **API Management** page
2. Click **Create API Key**
3. Set **API Name** (e.g., nof1-trader)
4. Select **Permissions**:
   - ✅ **Trading** - Allow placing and canceling orders
   - ✅ **Read** - Allow querying account information
   - ❌ **Withdrawal** - Withdrawal permission not needed
5. Set **Passphrase** (save it securely)
6. Complete security verification (SMS/email verification)

#### 3. Configure Environment Variables

Create `.env` file (or update existing file):

```bash
# OKX API Configuration
OKX_API_KEY=your_api_key_here
OKX_API_SECRET=your_api_secret_here
OKX_API_PASSPHRASE=your_passphrase_here

# Use testnet (recommended)
OKX_TESTNET=true

# Select default exchange (optional)
DEFAULT_EXCHANGE=okx
```

#### 4. Testnet Configuration

OKX provides testnet environment:

- **Testnet Address**: https://www.okx.com/balance
- **Testnet API**: https://www.okx.com/api/v5/
- **Get Test Funds**: Testnet accounts automatically receive virtual funds

### 🔧 Environment Variables Explained

| Variable Name | Required | Description | Example |
|---------------|----------|-------------|---------|
| `OKX_API_KEY` | ✅ | OKX API Key | `xxxx-xxxx-xxxx-xxxx` |
| `OKX_API_SECRET` | ✅ | OKX Secret Key | `xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` |
| `OKX_API_PASSPHRASE` | ✅ | Passphrase set during API creation | `YourPassphrase123` |
| `OKX_TESTNET` | ❌ | Whether to use testnet | `true` |
| `DEFAULT_EXCHANGE` | ❌ | Default exchange | `okx` |

### 🚀 Quick Verification

#### 1. Verify Configuration

```bash
# Check if configuration is correct
npm start -- status --exchange okx
```

#### 2. Test Connection

```bash
# Validate connection only, no trading execution
npm start -- follow test-agent --risk-only --exchange okx
```

#### 3. Small Amount Testing

Test with small amounts on testnet:

```bash
# Use minimum amount for testing
npm start -- follow deepseek-chat-v3.1 --total-margin 10 --exchange okx
```

---

## Development Checklist

### ✅ Phase 1 Checklist

#### Code Quality
- [ ] Complete TypeScript type definitions
- [ ] ESLint checks pass
- [ ] Prettier formatting is consistent
- [ ] Complete JSDoc comments

#### Feature Completeness
- [ ] `ExchangeService` interface includes all required methods
- [ ] `ExchangeFactory` can create Binance instances
- [ ] Configuration system supports OKX parameter reading
- [ ] Error handling mechanism is comprehensive

#### Test Coverage
- [ ] Unit tests for interface definitions
- [ ] Test cases for factory pattern
- [ ] Configuration loading tests
- [ ] Mock service test framework

### ✅ Phase 2 Checklist

#### Core Functions
- [ ] `validateConnection()` method works normally
- [ ] `getAccountInfo()` returns correct account information
- [ ] `getPositions()` returns position list
- [ ] `placeOrder()` can successfully place orders
- [ ] `setLeverage()` leverage setting function works normally

#### Data Processing
- [ ] Symbol conversion functions correctly handle various formats
- [ ] Quantity and price formatting meets OKX requirements
- [ ] Timestamp synchronization mechanism works normally
- [ ] Response data format conversion is correct

#### Error Handling
- [ ] API errors correctly mapped to user-friendly messages
- [ ] Network timeout handling mechanism
- [ ] Retry logic works normally
- [ ] Authentication failures have clear error prompts

### ✅ Phase 3 Checklist

#### Refactoring Quality
- [ ] `BinanceService` successfully implements interface
- [ ] `TradingExecutor` supports multi-exchange
- [ ] All dependencies correctly injected
- [ ] Backward compatibility maintained

#### Code Consistency
- [ ] Unified method signatures
- [ ] Consistent error handling approaches
- [ ] Unified log format
- [ ] Unified type definitions

#### Test Validation
- [ ] All existing Binance functionality tests pass
- [ ] New interface tests pass
- [ ] Integration tests have no regression
- [ ] Performance tests pass

### ✅ Phase 4 Checklist

#### CLI Functionality
- [ ] `--exchange` parameter correctly parsed
- [ ] OKX configuration parameters correctly passed
- [ ] Help information includes new parameters
- [ ] Parameter validation logic is comprehensive

#### User Experience
- [ ] Error prompts are clear and friendly
- [ ] Configuration validation provides clear guidance
- [ ] Command-line interaction is smooth
- [ ] Help documentation is accurate

### ✅ Phase 5 Checklist

#### Documentation Completeness
- [ ] README.md update complete
- [ ] API application guide is clear
- [ ] Configuration instructions are detailed
- [ ] Troubleshooting guide is complete

#### Test Coverage
- [ ] OKX service unit tests
- [ ] Complete integration test cases
- [ ] Error scenario test coverage
- [ ] Performance test results meet standards

#### Deployment Ready
- [ ] All tests pass
- [ ] Code review complete
- [ ] Documentation review passed
- [ ] Release preparation complete

---

## Testing Strategy

### 🧪 Unit Tests

#### Test Framework Structure
```
src/
├── services/
│   ├── __tests__/
│   │   ├── exchange-factory.test.ts
│   │   ├── binance-service.test.ts
│   │   ├── okx-service.test.ts
│   │   └── trading-executor.test.ts
│   └── ...
```

#### Key Test Cases

1. **Factory Pattern Tests**
```typescript
describe('ExchangeFactory', () => {
  test('should create Binance service', () => {
    const service = ExchangeFactory.createExchange('binance', binanceConfig);
    expect(service).toBeInstanceOf(BinanceService);
  });

  test('should create OKX service', () => {
    const service = ExchangeFactory.createExchange('okx', okxConfig);
    expect(service).toBeInstanceOf(OkxService);
  });

  test('should throw error for unsupported exchange', () => {
    expect(() => {
      ExchangeFactory.createExchange('unsupported' as any, {});
    }).toThrow('Unsupported exchange');
  });
});
```

2. **Symbol Conversion Tests**
```typescript
describe('SymbolConverter', () => {
  test('should convert to Binance format', () => {
    expect(SymbolConverter.toBinance('BTC')).toBe('BTCUSDT');
    expect(SymbolConverter.toBinance('BTCUSDT')).toBe('BTCUSDT');
  });

  test('should convert to OKX format', () => {
    expect(SymbolConverter.toOkx('BTC')).toBe('BTC-USDT-SWAP');
    expect(SymbolConverter.toOkx('BTC-USDT-SWAP')).toBe('BTC-USDT-SWAP');
  });
});
```

### 🔧 Integration Tests

#### Test Environment Configuration
```typescript
// jest.config.js
module.exports = {
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/setup.ts'],
  testTimeout: 30000, // OKX API might be slower
};
```

#### Mock Strategy
```typescript
// src/__tests__/mocks/okx-mock.ts
export const mockOkxResponses = {
  accountInfo: {
    data: [{
      adjEq: '1000.0',
      imr: '0',
      isoEq: '0',
      mgnRatio: '9999',
      mmr: '0',
      notionalUsd: '0',
      ordFroz: '0',
      totalEq: '1000.0',
      utime: '1234567890'
    }]
  },

  positions: {
    data: [{
      instId: 'BTC-USDT-SWAP',
      lever: '10',
      ls: 'long',
      notionalUsd: '5000',
      pos: '0.1',
      posId: '12345',
      upl: '50',
      uplRatio: '0.01'
    }]
  }
};
```

### 🚀 End-to-End Tests

#### Test Script
```bash
#!/bin/bash
# scripts/e2e-test.sh

echo "🧪 Running E2E tests..."

# Test Binance connection
echo "Testing Binance connection..."
npm start -- status --exchange binance

# Test OKX connection
echo "Testing OKX connection..."
npm start -- status --exchange okx

# Test configuration validation
echo "Testing configuration validation..."
npm start -- follow test-agent --risk-only --exchange okx

echo "✅ E2E tests completed"
```

---

## Risk Assessment

### ⚠️ Development Risks

#### 1. API Compatibility Risk
- **Risk Level**: Medium
- **Impact**: OKX API may have subtle differences from Binance
- **Mitigation Measures**:
  - Sufficient test coverage
  - Testnet validation
  - Refer to official documentation and community feedback

#### 2. Authentication Complexity
- **Risk Level**: Low
- **Impact**: OKX's passphrase adds authentication complexity
- **Mitigation Measures**:
  - Provide detailed configuration guide
  - Implement good error prompts
  - Use environment variables to manage sensitive information

#### 3. Precision Handling Differences
- **Risk Level**: Medium
- **Impact**: Different precision requirements between exchanges may cause trading failures
- **Mitigation Measures**:
  - Dynamically fetch trading rules
  - Implement intelligent precision adjustment
  - Sufficient boundary testing

### 🛡️ Runtime Risks

#### 1. API Rate Limits
- **Risk Level**: Low
- **Impact**: OKX API rate limits may differ from Binance
- **Mitigation Measures**:
  - Implement request frequency control
  - Monitor API usage
  - Implement graceful degradation

#### 2. Network Stability
- **Risk Level**: Low
- **Impact**: Network issues may cause trading failures
- **Mitigation Measures**:
  - Implement retry mechanism
  - Add timeout handling
  - Provide offline mode option

#### 3. Configuration Errors
- **Risk Level**: Medium
- **Impact**: User configuration errors may cause trading failures or fund losses
- **Mitigation Measures**:
  - Implement configuration validation
  - Provide detailed error information
  - Force testnet-first approach

### 📋 Rollback Plan

If OKX integration encounters issues, follow these steps to rollback:

1. **Immediate Rollback**: Switch back to Binance API
   ```bash
   npm start -- follow agent --exchange binance
   ```

2. **Configuration Rollback**: Remove OKX configuration from `.env` file

3. **Code Rollback**: If needed, rollback to code version before integration

4. **User Notification**: Notify users of issues and solutions in a timely manner

---

## 📞 Technical Support

### 🐛 Issue Reporting

If you encounter problems during integration, please provide the following information:

1. **Environment Information**
   - Node.js version
   - Operating system
   - Project version

2. **Error Details**
   - Complete error stack
   - Reproduction steps
   - Related configuration

3. **Debug Information**
   - Log output
   - API responses
   - Network request details

### 📚 Reference Resources

- [OKX API Official Documentation](https://www.okx.com/docs-v5/)
- [OKX API Rate Limits](https://www.okx.com/docs-v5/#rest-api-rate-limit)
- [Project GitHub Issues](https://github.com/your-repo/nof1-tracker/issues)

### 🔄 Continuous Improvement

This integration guide will be continuously updated based on actual development experience. Feedback and suggestions are welcome.

---

**Document Version**: v1.0
**Creation Date**: 2025-10-28
**Author**: Claude Code Assistant
**Last Updated**: 2025-10-28

---

*Disclaimer: This document is for reference only. Please adjust according to the latest OKX API documentation during actual development. Futures trading carries the risk of fund loss, please use with caution after fully understanding the risks.*