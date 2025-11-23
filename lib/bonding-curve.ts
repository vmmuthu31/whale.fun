export const INITIAL_PRICE = 0.000001; // Starting price in ETH
export const SLOPE = 0.0000001; // Price increase per token sold
export const FEE_PERCENT = 0.01; // 1% trading fee

/**
 * Calculate the cost to buy a specific amount of tokens.
 * Formula: Integral of (P0 + m*s) ds from s to s+amount
 * Cost = Base Cost * (1 + Fee)
 * 
 * @param currentSupply - The number of tokens currently sold (circulating supply)
 * @param amountToBuy - The amount of tokens the user wants to buy
 * @returns The total cost in ETH (including fee)
 */
export function calculateBuyCost(currentSupply: number, amountToBuy: number): number {
  const s = currentSupply;
  const a = amountToBuy;
  const m = SLOPE;
  const p0 = INITIAL_PRICE;

  const term1 = p0 * a;
  const term2 = m * (Math.pow(s + a, 2) / 2 - Math.pow(s, 2) / 2);
  
  const baseCost = term1 + term2;
  return baseCost * (1 + FEE_PERCENT);
}

/**
 * Calculate the refund for selling a specific amount of tokens.
 * Formula: Integral of (P0 + m*s) ds from s-amount to s
 * Refund = Base Refund * (1 - Fee)
 * 
 * @param currentSupply - The number of tokens currently sold (circulating supply)
 * @param amountToSell - The amount of tokens the user wants to sell
 * @returns The total refund in ETH (after fee deduction)
 */
export function calculateSellRefund(currentSupply: number, amountToSell: number): number {
  const s = currentSupply;
  const a = amountToSell;
  const m = SLOPE;
  const p0 = INITIAL_PRICE;

  const term1 = p0 * a;
  const term2 = m * (Math.pow(s, 2) / 2 - Math.pow(s - a, 2) / 2);
  
  const baseRefund = term1 + term2;
  return baseRefund * (1 - FEE_PERCENT);
}

/**
 * Calculate the current price per token.
 * Price = P0 + m * s
 */
export function getCurrentPrice(currentSupply: number): number {
  return INITIAL_PRICE + SLOPE * currentSupply;
}

/**
 * Get the fee amount for a given base value
 */
export function calculateFee(baseValue: number): number {
    return baseValue * FEE_PERCENT;
}
