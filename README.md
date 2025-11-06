# Whale.fun 🐋

A decentralized platform for creating and trading meme tokens with bonding curves, battle arenas, and community features.

## 🌐 Deployed Contract Addresses and Networks

### 0G Testnet (Chain ID: 16602)

- **WhaleToken**: yet to be deployed
- **TokenFactory**: `0xb17f589b3dd10a05d4ef4ed1bdbe4cee8ec2da25`
- **Network**: 0G Testnet Network
- **RPC URL**: https://evmrpc-testnet.0g.ai
- **Explorer**: https://chainscan.0g.ai

## 🚀 Features

- **Token Creation**: Create meme tokens with customizable bonding curves
- **Trading Interface**: Buy/sell tokens with real-time price calculations
- **Battle Arena**: Gamified token competitions and leaderboards
- **Portfolio Management**: Track your token holdings and performance
- **Multi-Chain Support**: Deploy on 0G network.

## 🛠️ Technology Stack

- **Frontend**: Next.js 14, TypeScript, Tailwind CSS
- **Blockchain**: Ethereum-compatible networks (0G)
- **Smart Contracts**: Solidity with Hardhat framework
- **Web3 Integration**: Viem, Wagmi, RainbowKit
- **State Management**: React Query, Context API

## 📦 Getting Started

### Prerequisites

- Node.js 18+ and npm/yarn
- MetaMask or compatible Web3 wallet
- Git

### Installation

1. **Clone the repository**

```bash
git clone https://github.com/your-username/whale.fun.git
cd whale.fun
```

2. **Install dependencies**

```bash
npm install
# or
yarn install
```

3. **Set up environment variables**

```bash
cp .env.example .env.local
```

Edit `.env.local` with your configuration:

```env
# RPC URLs (optional - fallbacks are provided)
NEXT_PUBLIC_0G_RPC_URL=https://evmrpc-testnet.0g.ai

# Database (if using backend features)
DATABASE_URL=your_database_url
```

4. **Run the development server**

```bash
npm run dev
# or
yarn dev
```

5. **Open your browser**
   Navigate to [http://localhost:3000](http://localhost:3000)

## 🔧 Smart Contract Development

### Contract Deployment

1. **Navigate to contracts directory**

```bash
cd contracts
```

2. **Install contract dependencies**

```bash
npm install
```

3. **Compile contracts**

```bash
npx hardhat compile
```

4. **Deploy to testnet**

```bash
# Deploy to 0G Testnet
npx hardhat run scripts/deploy-multichain.ts --network zeroG-testnet
```

### Contract Architecture

- **TokenFactoryRoot**: Main factory contract for creating tokens
- **WhaleToken**: Platform utility token
- **BondingCurveLibrary**: Mathematical functions for price calculations
- **CreatorToken**: Individual meme token implementation

## 🎮 Platform Features

### Token Creation

- Customizable bonding curve parameters
- Creator fee settings (30-95%)
- Initial liquidity requirements
- Multi-chain deployment support

### Trading Engine

- Real-time bonding curve calculations
- Slippage protection
- Transaction receipt handling for slow RPCs
- Hybrid contract + frontend calculation fallback

### Battle Arena

- Token competition system
- Leaderboards and rankings
- Achievement system
- Prize pool distribution

### Portfolio Management

- Multi-chain token tracking
- Real-time balance updates
- Performance analytics
- Creator statistics

## 🌍 Supported Networks

| Network    | Chain ID | Status    | Features                |
| ---------- | -------- | --------- | ----------------------- |
| 0G Testnet | 16602    | ✅ Active | Token creation, trading |

## 🔐 Security Features

- **Contract Validation**: Parameter bounds checking
- **Overflow Protection**: SafeMath implementations
- **Access Control**: Owner-only admin functions
- **Reentrancy Guards**: Protection against attacks
- **Audit Trail**: Comprehensive event logging

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

- **Documentation**: [docs.whale.fun](https://docs.whale.fun)
- **Discord**: [Join our community](https://discord.gg/whale-fun)
- **Twitter**: [@WhaleFunPlatform](https://twitter.com/WhaleFunPlatform)
- **Issues**: [GitHub Issues](https://github.com/your-username/whale.fun/issues)

## 🎯 Roadmap

- [ ] Mainnet deployment
- [ ] Additional DEX integrations
- [ ] Mobile app development
- [ ] Advanced analytics dashboard
- [ ] Cross-chain bridge integration
- [ ] NFT marketplace integration

---

Built with ❤️ by the Whale.fun team
