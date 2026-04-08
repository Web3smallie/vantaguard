"use client";
import { useState, useEffect, useMemo } from "react";
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
  const [mounted, setMounted] = useState(false);
  const [step, setStep] = useState(0);
  const [vaultAddress, setVaultAddress] = useState<string | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [selectedPosition, setSelectedPosition] = useState<bigint | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [status, setStatus] = useState("");

  const { writeContract, data: hash, isPending } = useWriteContract();
  const { isSuccess } = useWaitForTransactionReceipt({ hash });

  // Fix: useMemo so client isn't recreated every render
  const client = useMemo(() => createPublicClient({
    transport: http("https://node.mainnet.etherlink.com"),
  }), []);

  // Fix: hydration + localStorage recovery
  useEffect(() => {
    setMounted(true);
    if (!address) return;
    const savedVault = localStorage.getItem(`vanguard_vault_${address}`);
    const savedStep = localStorage.getItem(`vanguard_step_${address}`);
    if (savedVault) {
      setVaultAddress(savedVault);
      setStep(savedStep ? parseInt(savedStep) : 1);
    }
  }, [address]);

  // Persist step
  useEffect(() => {
    if (address && mounted) {
      localStorage.setItem(`vanguard_step_${address}`, step.toString());
    }
  }, [step, address, mounted]);

  // Fix: checkVault with correct args — only address
  useEffect(() => {
    if (!address || !mounted) return;
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
          args: [address as `0x${string}`],
        }) as string;

        if (vault && vault !== "0x0000000000000000000000000000000000000000") {
          setVaultAddress(vault);
          localStorage.setItem(`vanguard_vault_${address}`, vault);
          if (step === 0) setStep(1);
          setStatus("✓ Vault found! Now select your LP position to protect.");
        }
      } catch (e) {
        console.error("Vault check failed", e);
      }
    }
    checkVault();
  }, [address, mounted]);

  // Fix: use tokenOfOwnerByIndex directly — no explorer API dependency
  async function fetchPositions() {
    if (!address) return;
    setLoading(true);
    setStatus("Scanning your LP positions...");
    try {
      const balance = await client.readContract({
        address: POSITION_MANAGER_ADDRESS as `0x${string}`,
        abi: [{
          name: "balanceOf",
          type: "function",
          inputs: [{ name: "owner", type: "address" }],
          outputs: [{ type: "uint256" }],
          stateMutability: "view",
        }],
        functionName: "balanceOf",
        args: [address as `0x${string}`],
      }) as bigint;

      const found: Position[] = [];

      for (let i = 0; i < Number(balance); i++) {
        const tokenId = await client.readContract({
          address: POSITION_MANAGER_ADDRESS as `0x${string}`,
          abi: [{
            name: "tokenOfOwnerByIndex",
            type: "function",
            inputs: [
              { name: "owner", type: "address" },
              { name: "index", type: "uint256" }
            ],
            outputs: [{ type: "uint256" }],
            stateMutability: "view",
          }],
          functionName: "tokenOfOwnerByIndex",
          args: [address as `0x${string}`, BigInt(i)],
        }) as bigint;

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

        if (pos[7] > 0n) {
          found.push({
            tokenId,
            token0: pos[2],
            token1: pos[3],
            liquidity: pos[7],
          });
        }
      }

      setPositions(found);
      if (found.length === 0) {
        setStatus("No active LP positions found. Add liquidity on Oku first.");
      } else {
        setStatus("Found " + found.length + " LP position(s). Select one to protect.");
      }
    } catch (e) {
      console.error(e);
      setStatus("Error scanning positions. Try again.");
    }
    setLoading(false);
  }

  async function createVault() {
    if (!address) return;
    setStatus("Creating your personal vault...");
    writeContract({
      address: FACTORY_ADDRESS as `0x${string}`,
      abi: FACTORY_ABI,
      functionName: "createVault",
      args: [AGENT_WALLET as `0x${string}`, strategy],
      gas: BigInt(500000),
    });
  }

  async function approveNFT() {
    if (!selectedPosition || !vaultAddress) return;
    setStatus("Approving LP NFT transfer...");
    writeContract({
      address: POSITION_MANAGER_ADDRESS as `0x${string}`,
      abi: [{
        name: "approve",
        type: "function",
        inputs: [
          { name: "to", type: "address" },
          { name: "tokenId", type: "uint256" }
        ],
        outputs: [],
        stateMutability: "nonpayable",
      }] as const,
      functionName: "approve",
      args: [vaultAddress as `0x${string}`, selectedPosition],
      gas: BigInt(100000),
    });
  }

  async function registerPosition() {
    if (!selectedPosition || !vaultAddress) return;
    setStatus("Registering LP position in vault...");
    writeContract({
      address: vaultAddress as `0x${string}`,
      abi: VAULT_ABI,
      functionName: "registerPosition",
      args: [selectedPosition],
      gas: BigInt(300000),
    });
  }

  useEffect(() => {
    if (!isSuccess || !address) return;
    if (step === 0) {
      async function getNewVault() {
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
          localStorage.setItem(`vanguard_vault_${address}`, vault);
        } catch (e) {}
      }
      getNewVault();
      setStep(1);
      setStatus("✓ Vault created! Now scan for your LP positions.");
      fetchPositions();
    } else if (step === 2) {
      setStep(3);
      setStatus("✓ NFT approved! Now register it in your vault...");
    } else if (step === 3) {
      setDone(true);
      setStatus("✓ Position registered! Vantaguard is now protecting your funds.");
    }
  }, [isSuccess]);

  if (!mounted || !address) return null;

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