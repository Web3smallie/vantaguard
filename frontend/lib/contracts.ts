export const FACTORY_ADDRESS = "0xcbfAD0dD3653Ad0D6bA0aCa4Ca7309463235367B";
export const AGENT_WALLET = "0x46408C26e2df32FB047D7E79020383969c196396";
export const POSITION_MANAGER_ADDRESS = "0x743E03cceB4af2efA3CC76838f6E8B50B63F184c";

export const FACTORY_ABI = [
  {
    inputs: [
      { internalType: "address", name: "_agent", type: "address" },
      { internalType: "uint8", name: "_preference", type: "uint8" },
    ],
    name: "createVault",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "user", type: "address" }],
    name: "getVault",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

export const VAULT_ABI = [
  {
    inputs: [{ internalType: "uint256", name: "tokenId", type: "uint256" }],
    name: "registerPosition",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "_newAgent", type: "address" }],
    name: "setAgent",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint8", name: "_preference", type: "uint8" }],
    name: "setRecoveryPreference",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "deactivateBunker",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "fundsInVault",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "bunkerMode",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
  {
  inputs: [],
  name: "positionRegistered",
  outputs: [{ internalType: "bool", name: "", type: "bool" }],
  stateMutability: "view",
  type: "function",
 },
 {
  inputs: [],
  name: "fundsInVault",
  outputs: [{ internalType: "bool", name: "", type: "bool" }],
  stateMutability: "view",
  type: "function",
},
{
  inputs: [],
  name: "resetPosition",
  outputs: [],
  stateMutability: "nonpayable",
  type: "function",
},
] as const;

export const POSITION_MANAGER_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)",
  "function positions(uint256 tokenId) view returns (uint96 nonce, address operator, address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128, uint128 tokensOwed0, uint128 tokensOwed1)",
  "function approve(address to, uint256 tokenId)",
  "function safeTransferFrom(address from, address to, uint256 tokenId)",
] as const;

export const ETHERLINK = {
  id: 42793,
  name: "Etherlink",
  nativeCurrency: { name: "XTZ", symbol: "XTZ", decimals: 18 },
  rpcUrls: { default: { http: ["https://node.mainnet.etherlink.com"] } },
  blockExplorers: {
    default: { name: "Etherlink Explorer", url: "https://explorer.etherlink.com" },
  },
};