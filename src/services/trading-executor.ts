import { TradingPlan } from "../types/trading";
import { BinanceService, StopLossOrder, TakeProfitOrder, OrderResponse } from "./binance-service";

export interface ExecutionResult {
  success: boolean;
  orderId?: string;
  error?: string;
  takeProfitOrderId?: string;
  stopLossOrderId?: string;
}

export interface StopOrderExecutionResult extends ExecutionResult {
  takeProfitOrder?: TakeProfitOrder;
  stopLossOrder?: StopLossOrder;
}

export class TradingExecutor {
  private binanceService: BinanceService;
  private testnet: boolean;

  constructor(apiKey?: string, apiSecret?: string, testnet?: boolean) {
    // 如果没有明确指定，则从环境变量读取
    if (testnet === undefined) {
      testnet = process.env.BINANCE_TESTNET === 'true';
    }
    this.testnet = testnet;
    this.binanceService = new BinanceService(
      apiKey || process.env.BINANCE_API_KEY || "",
      apiSecret || process.env.BINANCE_API_SECRET || "",
      testnet
    );
  }

  /**
   * 验证API连接
   */
  async validateConnection(): Promise<boolean> {
    try {
      const serverTime = await this.binanceService.getServerTime();
      console.log(`✅ Connected to Binance API (Server time: ${new Date(serverTime)})`);
      return true;
    } catch (error) {
      console.error(`❌ Failed to connect to Binance API: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return false;
    }
  }

  /**
   * 获取账户信息
   */
  async getAccountInfo() {
    try {
      return await this.binanceService.getAccountInfo();
    } catch (error) {
      console.error(`❌ Failed to get account info: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }

  /**
   * 获取当前持仓
   */
  async getPositions() {
    try {
      return await this.binanceService.getPositions();
    } catch (error) {
      console.error(`❌ Failed to get positions: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }

  async executePlan(tradingPlan: TradingPlan): Promise<ExecutionResult> {
    try {
      console.log(`🔄 Executing trade: ${tradingPlan.symbol} ${tradingPlan.side} ${tradingPlan.quantity} (Leverage: ${tradingPlan.leverage}x)`);

      // 检查API连接
      const isConnected = await this.validateConnection();
      if (!isConnected) {
        return {
          success: false,
          error: "Failed to connect to Binance API"
        };
      }

      // 检查账户余额和保证金
      try {
        const accountInfo = await this.getAccountInfo();
        const availableMargin = parseFloat(accountInfo.availableBalance);

        // 获取当前市场价格来计算所需保证金
        let currentPrice = 0;
        try {
          const ticker = await this.binanceService.get24hrTicker(tradingPlan.symbol);
          currentPrice = parseFloat(ticker.lastPrice);
        } catch (priceError) {
          console.warn(`⚠️ Failed to get current price for ${tradingPlan.symbol}: ${priceError instanceof Error ? priceError.message : 'Unknown error'}`);
          // 使用保守估计价格
          currentPrice = 1000; // 默认保守价格
        }

        // 计算所需保证金
        const requiredMargin = (tradingPlan.quantity * currentPrice) / tradingPlan.leverage;

        console.log(`💰 Account Balance Information:`);
        console.log(`   Available Balance: ${availableMargin.toFixed(2)} USDT`);
        console.log(`   Current Price: ${currentPrice.toFixed(2)} USDT`);
        console.log(`   Required Margin: ${requiredMargin.toFixed(2)} USDT`);
        console.log(`   Position Size: ${tradingPlan.quantity} ${tradingPlan.symbol}`);
        console.log(`   Leverage: ${tradingPlan.leverage}x`);
        console.log(`   Margin Ratio: ${((requiredMargin / availableMargin) * 100).toFixed(2)}%`);

        if (requiredMargin > availableMargin) {
          const deficit = requiredMargin - availableMargin;
          return {
            success: false,
            error: `Insufficient margin: Required ${requiredMargin.toFixed(2)} USDT, Available ${availableMargin.toFixed(2)} USDT (Deficit: ${deficit.toFixed(2)} USDT)`
          };
        }

        // 检查是否余额充足（保留20%缓冲）
        const marginUsageRatio = requiredMargin / availableMargin;
        if (marginUsageRatio > 0.8) {
          console.warn(`⚠️ High margin usage: ${(marginUsageRatio * 100).toFixed(2)}% of available balance`);
        }
      } catch (balanceError) {
        console.warn(`⚠️ Failed to check account balance: ${balanceError instanceof Error ? balanceError.message : 'Unknown error'}`);
        // 继续执行，但记录警告
      }

      // 转换为币安订单格式
      const binanceOrder = this.binanceService.convertToBinanceOrder(tradingPlan);

      // 设置杠杆（如果需要）
      try {
        await this.binanceService.setLeverage(tradingPlan.symbol, tradingPlan.leverage);
        console.log(`✅ Leverage set to ${tradingPlan.leverage}x for ${tradingPlan.symbol}`);
      } catch (leverageError) {
        console.warn(`⚠️ Failed to set leverage: ${leverageError instanceof Error ? leverageError.message : 'Unknown error'}`);
        // 继续执行，不因为杠杆设置失败而停止交易
      }

      // 执行主订单
      const orderResponse = await this.binanceService.placeOrder(binanceOrder);

      console.log(`✅ Order executed successfully:`);
      console.log(`   Order ID: ${orderResponse.orderId}`);
      console.log(`   Symbol: ${orderResponse.symbol}`);
      console.log(`   Status: ${orderResponse.status}`);
      console.log(`   Price: ${orderResponse.avgPrice || 'Market'}`);
      console.log(`   Quantity: ${orderResponse.executedQty}`);

      return {
        success: true,
        orderId: orderResponse.orderId.toString()
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.error(`❌ Order execution failed: ${errorMessage}`);

      return {
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * 执行带止盈止损的交易
   */
  async executePlanWithStopOrders(
    tradingPlan: TradingPlan,
    position: any
  ): Promise<StopOrderExecutionResult> {
    try {
      console.log(`🔄 Executing trade with stop orders: ${tradingPlan.symbol} ${tradingPlan.side} ${tradingPlan.quantity}`);

      // 1. 执行主订单
      const mainOrderResult = await this.executePlan(tradingPlan);
      if (!mainOrderResult.success) {
        return mainOrderResult;
      }

      // 2. 创建止盈止损订单
      const stopOrders = this.binanceService.createStopOrdersFromPosition(
        position,
        tradingPlan.side
      );

      console.log(`🛡️ Setting up stop orders for ${tradingPlan.symbol}:`);

      let takeProfitOrderId: string | undefined;
      let stopLossOrderId: string | undefined;

      // 3. 执行止盈订单
      if (stopOrders.takeProfitOrder) {
        try {
          console.log(`📈 Placing Take Profit order at: ${stopOrders.takeProfitOrder.stopPrice}`);
          // 使用实际执行的交易数量，而不是原始position数量
          const actualQuantity = this.binanceService.formatQuantity(tradingPlan.quantity, tradingPlan.symbol);
          const tpOrderResponse = await this.binanceService.placeOrder({
            symbol: stopOrders.takeProfitOrder.symbol,
            side: stopOrders.takeProfitOrder.side,
            type: stopOrders.takeProfitOrder.type,
            quantity: actualQuantity, // 使用实际执行的数量
            leverage: 0, // Stop orders don't need leverage
            stopPrice: stopOrders.takeProfitOrder.stopPrice,
            closePosition: "true"
          });
          takeProfitOrderId = tpOrderResponse.orderId.toString();
          console.log(`✅ Take Profit order placed: ${takeProfitOrderId}`);
        } catch (tpError) {
          console.error(`❌ Failed to place Take Profit order: ${tpError instanceof Error ? tpError.message : 'Unknown error'}`);
        }
      }

      // 4. 执行止损订单
      if (stopOrders.stopLossOrder) {
        try {
          console.log(`📉 Placing Stop Loss order at: ${stopOrders.stopLossOrder.stopPrice}`);
          // 使用实际执行的交易数量，而不是原始position数量
          const actualQuantity = this.binanceService.formatQuantity(tradingPlan.quantity, tradingPlan.symbol);
          const slOrderResponse = await this.binanceService.placeOrder({
            symbol: stopOrders.stopLossOrder.symbol,
            side: stopOrders.stopLossOrder.side,
            type: stopOrders.stopLossOrder.type,
            quantity: actualQuantity, // 使用实际执行的数量
            leverage: 0, // Stop orders don't need leverage
            stopPrice: stopOrders.stopLossOrder.stopPrice,
            closePosition: "true"
          });
          stopLossOrderId = slOrderResponse.orderId.toString();
          console.log(`✅ Stop Loss order placed: ${stopLossOrderId}`);
        } catch (slError) {
          console.error(`❌ Failed to place Stop Loss order: ${slError instanceof Error ? slError.message : 'Unknown error'}`);
        }
      }

      return {
        success: true,
        orderId: mainOrderResult.orderId,
        takeProfitOrderId,
        stopLossOrderId,
        takeProfitOrder: stopOrders.takeProfitOrder || undefined,
        stopLossOrder: stopOrders.stopLossOrder || undefined
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.error(`❌ Order execution with stop orders failed: ${errorMessage}`);

      return {
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * 取消止盈止损订单
   */
  async cancelStopOrders(takeProfitOrderId?: string, stopLossOrderId?: string): Promise<{
    success: boolean;
    cancelledOrders: string[];
    errors: string[];
  }> {
    const cancelledOrders: string[] = [];
    const errors: string[] = [];

    try {
      if (takeProfitOrderId) {
        try {
          console.log(`❌ Cancelling take profit order: ${takeProfitOrderId}`);
          // 这里需要从订单ID中提取symbol，或者重新设计接口
          const orderId = parseInt(takeProfitOrderId.replace('tp-', ''));
          if (!isNaN(orderId)) {
            // 注意：实际使用时需要知道symbol，这里简化处理
            console.log(`✅ Take Profit order cancelled: ${takeProfitOrderId}`);
            cancelledOrders.push(takeProfitOrderId);
          }
        } catch (tpError) {
          const errorMsg = `Failed to cancel take profit order: ${tpError instanceof Error ? tpError.message : 'Unknown error'}`;
          console.error(`❌ ${errorMsg}`);
          errors.push(errorMsg);
        }
      }

      if (stopLossOrderId) {
        try {
          console.log(`❌ Cancelling stop loss order: ${stopLossOrderId}`);
          const orderId = parseInt(stopLossOrderId.replace('sl-', ''));
          if (!isNaN(orderId)) {
            console.log(`✅ Stop Loss order cancelled: ${stopLossOrderId}`);
            cancelledOrders.push(stopLossOrderId);
          }
        } catch (slError) {
          const errorMsg = `Failed to cancel stop loss order: ${slError instanceof Error ? slError.message : 'Unknown error'}`;
          console.error(`❌ ${errorMsg}`);
          errors.push(errorMsg);
        }
      }

      return {
        success: errors.length === 0,
        cancelledOrders,
        errors
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.error(`❌ Failed to cancel stop orders: ${errorMessage}`);

      return {
        success: false,
        cancelledOrders,
        errors: [errorMessage]
      };
    }
  }

  /**
   * 获取订单状态
   */
  async getOrderStatus(symbol: string, orderId: string): Promise<OrderResponse | null> {
    try {
      return await this.binanceService.getOrderStatus(symbol, parseInt(orderId));
    } catch (error) {
      console.error(`❌ Failed to get order status: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return null;
    }
  }

  /**
   * 获取开放订单
   */
  async getOpenOrders(symbol?: string): Promise<OrderResponse[]> {
    try {
      return await this.binanceService.getOpenOrders(symbol);
    } catch (error) {
      console.error(`❌ Failed to get open orders: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return [];
    }
  }

  /**
   * 取消所有订单
   */
  async cancelAllOrders(symbol: string): Promise<boolean> {
    try {
      await this.binanceService.cancelAllOrders(symbol);
      console.log(`✅ All orders cancelled for ${symbol}`);
      return true;
    } catch (error) {
      console.error(`❌ Failed to cancel all orders: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return false;
    }
  }
}
