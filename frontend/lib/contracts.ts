export const FACTORY_ADDRESS = "0xaCBF04d0E3D956BC5733C2843C89879dd454b81d";
export const AGENT_WALLET = "0x46408C26e2df32FB047D7E79020383969c196396";

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
    inputs: [
      { internalType: "address", name: "_newAgent", type: "address" },
    ],
    name: "setAgent",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint8",
        name: "_preference",
        type: "uint8",
      },
    ],
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