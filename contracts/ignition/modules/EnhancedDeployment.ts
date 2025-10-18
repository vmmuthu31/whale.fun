import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

/**
 * Enhanced Deployment Module for Whale.fun Platform
 * Includes all contracts with proper analytics and MEV protection
 */
const EnhancedWhaleDeployment = buildModule("EnhancedWhaleDeployment", (m) => {
  // Configuration parameters for mainnet deployment
  const initialEthToUsdRate = m.getParameter(
    "initialEthToUsdRate",
    BigInt(2000) * BigInt(10) ** BigInt(18)
  );

  const platformFeePercent = m.getParameter("platformFeePercent", 500); // 5%
  const defaultGraduationThreshold = m.getParameter(
    "defaultGraduationThreshold",
    BigInt(20) * BigInt(10) ** BigInt(18)
  ); // $20 USD

  // Deploy WhaleToken first (platform governance token)
  const whaleToken = m.contract("WhaleToken", [], {
    id: "WhaleToken",
  });

  // Deploy TokenFactory (core token creation contract)
  const tokenFactory = m.contract("TokenFactory", [whaleToken], {
    id: "TokenFactoryRoot",
  });

  // Deploy TokenGraduation (handles token graduation to DEX)
  const tokenGraduation = m.contract("TokenGraduation", [tokenFactory], {
    id: "TokenGraduation",
  });

  // Deploy TokenAnalyticsEnhanced (comprehensive analytics)
  const tokenAnalytics = m.contract(
    "TokenAnalyticsEnhanced",
    [tokenFactory, tokenGraduation],
    {
      id: "TokenAnalyticsEnhanced",
    }
  );

  // Deploy TradingEngineEnhanced (advanced trading with MEV protection)
  const tradingEngine = m.contract(
    "TradingEngineEnhanced",
    [whaleToken, tokenFactory, tokenAnalytics],
    {
      id: "TradingEngineEnhanced",
    }
  );

  // Deploy DashboardDataProvider (frontend data aggregation)
  const dashboardProvider = m.contract(
    "DashboardDataProvider",
    [tokenFactory, tokenAnalytics, tradingEngine, tokenGraduation],
    {
      id: "DashboardDataProvider",
    }
  );

  // Deploy DEXConfiguration (Jarinne DEX integration)
  const dexConfiguration = m.contract("DEXConfiguration", [], {
    id: "DEXConfiguration",
  });

  // Deploy BossBattleArena (gaming/community features)
  const bossBattleArena = m.contract(
    "BossBattleArena",
    [whaleToken, tokenFactory],
    {
      id: "BossBattleArena",
    }
  );

  // Configure TokenGraduation with initial parameters
  m.call(tokenGraduation, "updateEthToUsdRate", [initialEthToUsdRate], {
    id: "SetInitialEthRate",
  });

  // Configure TokenFactory with competitive revenue-generating parameters
  m.call(
    tokenFactory,
    "setLaunchFee",
    [m.getParameter("launchFee", 1000000000000000n)],
    {
      // 0.001 ETH (~$2)
      id: "SetLaunchFee",
    }
  );

  m.call(tokenFactory, "setMinInitialLiquidity", [0], {
    // No minimum liquidity required
    id: "SetMinLiquidity",
  });

  m.call(tokenFactory, "setMaxTokensPerCreator", [1000000], {
    // Practically unlimited tokens per creator
    id: "SetMaxTokensPerCreator",
  });

  // Configure platform commission rates
  m.call(tokenFactory, "setPlatformCommissionRate", [100], {
    // 1% platform commission
    id: "SetPlatformCommission",
  });

  m.call(tokenFactory, "setCreatorCommissionRate", [300], {
    // 3% creator commission
    id: "SetCreatorCommission",
  });

  // Configure TradingEngine fee structure
  m.call(
    tradingEngine,
    "updateFeeStructure",
    [
      30, // 0.3% base fee
      100, // 1% max fee
      70, // 70% to creator
      20, // 20% to platform
      10, // 10% to staking
    ],
    {
      id: "ConfigureTradingFees",
    }
  );

  // Setup DEX integrations for graduation
  // Jarinne DEX for 0G Mainnet (chainId: 16661)
  const jarinneRouter = m.getParameter(
    "jarinneRouter",
    "0x8B598A7C136215A95ba0282b4d832B9f9801f2e2"
  );
  const jarinneDexFactory = m.getParameter(
    "jarinneDexFactory",
    "0x9bdcA5798E52e592A08e3b34d3F18EeF76Af7ef4"
  );

  // Configure Jarinne DEX for mainnet graduation
  m.call(
    tokenGraduation,
    "configureDEX",
    [
      jarinneRouter,
      jarinneDexFactory,
      true, // V3 DEX (Jarinne uses V3)
      true, // Supported
    ],
    {
      id: "ConfigureJarinneDEX",
    }
  );

  // For testnet, we can skip DEX configuration or use different addresses

  return {
    whaleToken,
    tokenFactory,
    tokenGraduation,
    tokenAnalytics,
    tradingEngine,
    dashboardProvider,
    dexConfiguration,
    bossBattleArena,
  };
});

export default EnhancedWhaleDeployment;
