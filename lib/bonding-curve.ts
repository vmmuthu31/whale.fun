export const INITIAL_PRICE = 0.000001; // Starting price in ETH
export const SLOPE = 0.0000001; // Price increase per token sold

/**
 * Calculate the cost to buy a specific amount of tokens.
 * Formula: Integral of (P0 + m*s) ds from s to s+amount
 * = P0*amount + m*( (s+amount)^2/2 - s^2/2 )
 * 
 * @param currentSupply - The number of tokens currently sold (circulating supply)
 * @param amountToBuy - The amount of tokens the user wants to buy
 * @returns The cost in ETH
 */
export function calculateBuyCost(currentSupply: number, amountToBuy: number): number {
  const s = currentSupply;
  const a = amountToBuy;
  const m = SLOPE;
  const p0 = INITIAL_PRICE;

  const term1 = p0 * a;
  const term2 = m * (Math.pow(s + a, 2) / 2 - Math.pow(s, 2) / 2);

  return term1 + term2;
}

/**
 * Calculate the refund for selling a specific amount of tokens.
 * Formula: Integral of (P0 + m*s) ds from s-amount to s
 * = P0*amount + m*( s^2/2 - (s-amount)^2/2 )
 * 
 * @param currentSupply - The number of tokens currently sold (circulating supply)
 * @param amountToSell - The amount of tokens the user wants to sell
 * @returns The refund in ETH
 */
export function calculateSellRefund(currentSupply: number, amountToSell: number): number {
  const s = currentSupply;
  const a = amountToSell;
  const m = SLOPE;
  const p0 = INITIAL_PRICE;

  const term1 = p0 * a;
  const term2 = m * (Math.pow(s, 2) / 2 - Math.pow(s - a, 2) / 2);

  return term1 + term2;
}

/**
 * Calculate the current price per token.
 * Price = P0 + m * s
 */
export function getCurrentPrice(currentSupply: number): number {
  return INITIAL_PRICE + SLOPE * currentSupply;
}
