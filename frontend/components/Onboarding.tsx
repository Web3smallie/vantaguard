"use client";
import { useState, useEffect } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { createPublicClient, http } from "viem";
import { FACTORY_ADDRESS, FACTORY_ABI, AGENT_WALLET, VAULT_ABI, POSITION_MANAGER_ADDRESS } from "@/lib/contracts";

type Position = {
  tokenId: bigint;
  token0: string;
  token1: string;
  liquidity: bigint;
};

export function Onboarding({ strategy }: { strategy: number }) {
  const { address } = useAccount();
  const [step, setStep] = useState(0);
  const [vaultAddress, setVaultAddress] = useState<string | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [selectedPosition, setSelectedPosition] = useState<bigint | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [status, setStatus] = useState("");

  const { writeContract, data: hash, isPending } = useWriteContract();
  const { isSuccess } = useWaitForTransactionReceipt({ hash });

  const client = createPublicClient({
    transport: http("https://node.mainnet.etherlink.com"),
  });

  useEffect(() => {
    if (!address) return;
    async function checkVault() {
      try {
        const vault = await client.readContract({
          address: FACTORY_ADDRESS as `0x${string}`,
          abi: [{
            name: "getVault",
            type: "function",
            inputs: [{ name: "user", type: "address" }],
            outputs: [{ name: "", type: "address" }],
            stateMutability: "view",
          }],
          functionName: "getVault",
          args: [(vaultAddress || "") as `0x${string}`, selectedPosition as bigint],
        }) as string;

        if (vault && vault !== "0x0000000000000000000000000000000000000000") {
          setVaultAddress(vault);
          setStep(1);
          setStatus("✓ Vault found! Now select your LP position to protect.");
          fetchPositions();
        }
      } catch (e) {
        console.error("Vault check failed", e);
      }
    }
    checkVault();
  }, [address]);

 async function fetchPositions() {
  if (!address) return;
  setLoading(true);
  setStatus("Scanning your LP positions...");
  try {
    // Use Etherlink explorer API to find all NFTs from Position Manager
    const res = await fetch(
      `https://explorer.etherlink.com/api/v2/addresses/${address}/nft?type=ERC-721`
    );
    const data = await res.json();
    const nfts = data?.items || [];

    // Filter only Position Manager NFTs
    const pmNfts = nfts.filter((nft: any) =>
      nft.token?.address?.toLowerCase() === POSITION_MANAGER_ADDRESS.toLowerCase()
    );

    const found: Position[] = [];

    for (const nft of pmNfts) {
      const tokenId = BigInt(nft.id);
      try {
        const pos = await client.readContract({
          address: POSITION_MANAGER_ADDRESS as `0x${string}`,
          abi: [{
            name: "positions",
            type: "function",
            inputs: [{ name: "tokenId", type: "uint256" }],
            outputs: [
              { name: "nonce", type: "uint96" },
              { name: "operator", type: "address" },
              { name: "token0", type: "address" },
              { name: "token1", type: "address" },
              { name: "fee", type: "uint24" },
              { name: "tickLower", type: "int24" },
              { name: "tickUpper", type: "int24" },
              { name: "liquidity", type: "uint128" },
              { name: "feeGrowthInside0LastX128", type: "uint256" },
              { name: "feeGrowthInside1LastX128", type: "uint256" },
              { name: "tokensOwed0", type: "uint128" },
              { name: "tokensOwed1", type: "uint128" },
            ],
            stateMutability: "view",
          }],
          functionName: "positions",
          args: [tokenId],
        }) as any;

        if (pos.liquidity > BigInt(0)) {
          found.push({
            tokenId,
            token0: pos.token0,
            token1: pos.token1,
            liquidity: pos.liquidity,
          });
        }
      } catch (e) {
        continue;
      }
    }

    setPositions(found);
    if (found.length === 0) {
      setStatus("No active LP positions found. Add liquidity on Oku first.");
    } else {
      setStatus("Found " + found.length + " LP position(s). Select one to protect.");
    }
  } catch (e) {
    setStatus("Error scanning positions. Try again.");
    console.error(e);
  }
  setLoading(false);
 }

  async function createVault() {
    if (!address) return;
    setStatus("Creating your personal vault...");
    try {
      writeContract({
        address: FACTORY_ADDRESS as `0x${string}`,
        abi: FACTORY_ABI,
        functionName: "createVault",
        args: [AGENT_WALLET as `0x${string}`, strategy],
        gas: BigInt(500000),
      });
    } catch (e: any) {
      setStatus("Error: " + e.message);
    }
  }

  async function approveNFT() {
    if (!selectedPosition || !vaultAddress) return;
    setStatus("Approving LP NFT transfer...");
    try {
      writeContract({
        address: POSITION_MANAGER_ADDRESS as `0x${string}`,
        abi: [{
          name: "approve",
          type: "function",
          inputs: [{ name: "to", type: "address" }, { name: "tokenId", type: "uint256" }],
          outputs: [],
          stateMutability: "nonpayable",
        }],
        functionName: "approve",
        args: [vaultAddress as `0x${string}`, selectedPosition],
        gas: BigInt(100000),
      });
    } catch (e: any) {
      setStatus("Error: " + e.message);
    }
  }

  async function registerPosition() {
    if (!selectedPosition || !vaultAddress) return;
    setStatus("Registering LP position in vault...");
    try {
      writeContract({
        address: vaultAddress as `0x${string}`,
        abi: VAULT_ABI,
        functionName: "registerPosition",
        args: [selectedPosition],
        gas: BigInt(300000),
      });
    } catch (e: any) {
      setStatus("Error: " + e.message);
    }
  }

  useEffect(() => {
    if (!isSuccess) return;
    if (step === 0) {
      async function getNewVault() {
        if (!address) return;
        try {
          const vault = await client.readContract({
            address: FACTORY_ADDRESS as `0x${string}`,
            abi: [{
              name: "getVault",
              type: "function",
              inputs: [{ name: "user", type: "address" }],
              outputs: [{ name: "", type: "address" }],
              stateMutability: "view",
            }],
            functionName: "getVault",
            args: [address as `0x${string}`],
          }) as string;
          setVaultAddress(vault);
        } catch (e) {}
      }
      getNewVault();
      setStatus("✓ Vault created! Now select your LP position to protect.");
      setStep(1);
      fetchPositions();
    } else if (step === 2) {
      setStatus("✓ NFT approved! Now register it in your vault...");
      setStep(3);
    } else if (step === 3) {
      setStatus("✓ Position registered! Vantaguard is now protecting your funds.");
      setDone(true);
    }
  }, [isSuccess]);

  if (!address) return null;

  const stepDefs = [
    { num: "01", name: "Connect Wallet", status: "done" },
    { num: "02", name: "Create Vault", status: step >= 1 ? "done" : step === 0 ? "ready" : "pending" },
    { num: "03", name: "Select LP Position", status: step >= 2 ? "done" : step === 1 ? "ready" : "pending" },
    { num: "04", name: "Approve NFT", status: step >= 3 ? "done" : step === 2 ? "ready" : "pending" },
    { num: "05", name: "Register Position", status: done ? "done" : step === 3 ? "ready" : "pending" },
  ];

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", padding: 32 }}>
      <div style={{ fontSize: 14, color: "var(--muted)", letterSpacing: 4, marginBottom: 24 }}>
        VAULT SETUP — COMPLETE ALL STEPS TO ACTIVATE PROTECTION
      </div>

      <div style={{ display: "flex", gap: 0, marginBottom: 24 }}>
        {stepDefs.map((s, i) => (
          <div key={i} style={{
            flex: 1, padding: 20,
            border: "1px solid var(--border)",
            marginRight: -1,
            background: s.status === "ready" ? "rgba(0,255,136,0.03)" : "transparent",
            borderColor: s.status === "ready" ? "var(--green)" : s.status === "done" ? "var(--dim)" : "var(--border)",
          }}>
            <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 8 }}>{s.num}</div>
            <div style={{ fontSize: 13, color: s.status === "done" ? "var(--dim)" : "var(--text)", marginBottom: 4 }}>{s.name}</div>
            <div style={{ fontSize: 11, color: s.status === "done" ? "var(--dim)" : s.status === "ready" ? "var(--green)" : "var(--muted)" }}>
              {s.status === "done" ? "✓ DONE" : s.status === "ready" ? "READY" : "WAITING"}
            </div>
          </div>
        ))}
      </div>

      {status && (
        <div style={{ fontSize: 13, color: "var(--green)", marginBottom: 16, padding: "10px 16px", border: "1px solid var(--border)" }}>
          {status}
        </div>
      )}

      {step === 0 && !done && (
        <button onClick={createVault} disabled={isPending} style={{
          background: "transparent", border: "1px solid var(--green)",
          color: "var(--green)", padding: "14px 32px",
          fontFamily: "monospace", fontSize: 13, letterSpacing: 3, cursor: "pointer",
        }}>
          {isPending ? "SIGNING..." : "CREATE VAULT (SIGN TX)"}
        </button>
      )}

      {step === 1 && !done && (
        <div>
          {loading && (
            <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 16 }}>
              Scanning your LP positions on Etherlink...
            </div>
          )}
          {positions.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              {positions.map((pos) => (
                <div key={pos.tokenId.toString()}
                  onClick={() => { setSelectedPosition(pos.tokenId); setStep(2); }}
                  style={{
                    padding: "14px 16px",
                    border: "1px solid var(--border)",
                    marginBottom: 8, cursor: "pointer", fontSize: 13,
                    background: "transparent",
                  }}>
                  <span style={{ color: "var(--green)" }}>Position #{pos.tokenId.toString()}</span>
                  <span style={{ color: "var(--muted)", marginLeft: 16, fontSize: 11 }}>
                    {pos.token0.slice(0, 8)}.../{pos.token1.slice(0, 8)}...
                  </span>
                </div>
              ))}
            </div>
          )}
          {!loading && (
            <button onClick={fetchPositions} style={{
              background: "transparent", border: "1px solid var(--blue)",
              color: "var(--blue)", padding: "14px 32px",
              fontFamily: "monospace", fontSize: 13, letterSpacing: 3, cursor: "pointer",
            }}>
              {positions.length === 0 ? "SCAN MY LP POSITIONS" : "SCAN AGAIN"}
            </button>
          )}
        </div>
      )}

      {step === 2 && !done && (
        <button onClick={approveNFT} disabled={isPending} style={{
          background: "transparent", border: "1px solid var(--yellow)",
          color: "var(--yellow)", padding: "14px 32px",
          fontFamily: "monospace", fontSize: 13, letterSpacing: 3, cursor: "pointer",
        }}>
          {isPending ? "SIGNING..." : "APPROVE NFT TRANSFER (SIGN TX)"}
        </button>
      )}

      {step === 3 && !done && (
        <button onClick={registerPosition} disabled={isPending} style={{
          background: "transparent", border: "1px solid var(--green)",
          color: "var(--green)", padding: "14px 32px",
          fontFamily: "monospace", fontSize: 13, letterSpacing: 3, cursor: "pointer",
        }}>
          {isPending ? "SIGNING..." : "REGISTER POSITION (SIGN TX)"}
        </button>
      )}

      {done && (
        <div style={{ fontSize: 14, color: "var(--green)", padding: "16px", border: "1px solid var(--green)" }}>
          ✓ VAULT PROTECTED — Vantaguard is now monitoring your position 24/7
        </div>
      )}
    </div>
  );
}