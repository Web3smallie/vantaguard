"use client";
import { useState } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { FACTORY_ADDRESS, FACTORY_ABI, AGENT_WALLET } from "@/lib/contracts";

type Step = {
  num: string;
  name: string;
  status: "pending" | "ready" | "done";
};

export function Onboarding({ strategy }: { strategy: number }) {
  const { address } = useAccount();
  const [steps, setSteps] = useState<Step[]>([
    { num: "01", name: "Connect Wallet", status: "ready" },
    { num: "02", name: "Create Vault", status: "pending" },
    { num: "03", name: "Set Strategy", status: "pending" },
    { num: "04", name: "Register LP NFT", status: "pending" },
    { num: "05", name: "Authorize Agent", status: "pending" },
  ]);
  const [currentStep, setCurrentStep] = useState(0);
  const [btnText, setBtnText] = useState("CREATE VAULT (SIGN TX)");
  const [done, setDone] = useState(false);

  const { writeContract, data: hash } = useWriteContract();
  const { isSuccess } = useWaitForTransactionReceipt({ hash });

  function markDone(idx: number) {
    setSteps(prev => prev.map((s, i) => {
      if (i === idx) return { ...s, status: "done" };
      if (i === idx + 1) return { ...s, status: "ready" };
      return s;
    }));
  }

  async function handleStep() {
    if (currentStep === 0) {
      setBtnText("SIGNING...");
      try {
        writeContract({
          address: FACTORY_ADDRESS as `0x${string}`,
          abi: FACTORY_ABI,
          functionName: "createVault",
          args: [AGENT_WALLET as `0x${string}`, strategy],
        });
        markDone(1);
        setCurrentStep(1);
        setBtnText("REGISTER LP NFT (SIGN TX)");
      } catch (e) {
        setBtnText("CREATE VAULT (RETRY)");
      }
      return;
    }

    if (currentStep === 1) {
      markDone(2);
      setCurrentStep(2);
      setBtnText("AUTHORIZE AGENT (SIGN TX)");
      return;
    }

    if (currentStep === 2) {
      markDone(3);
      setCurrentStep(3);
      setBtnText("AUTHORIZE AGENT (SIGN TX)");
      return;
    }

    if (currentStep === 3) {
      markDone(4);
      setCurrentStep(4);
      setBtnText("✓ VAULT PROTECTED");
      setDone(true);
    }
  }

  if (!address) return null;

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", padding: 32 }}>
      <div style={{ fontSize: 9, color: "var(--muted)", letterSpacing: 4, marginBottom: 24 }}>
        VAULT SETUP — COMPLETE ALL STEPS TO ACTIVATE PROTECTION
      </div>

      <div style={{ display: "flex", gap: 0 }}>
        {steps.map((step, i) => (
          <div key={i} style={{
            flex: 1,
            padding: 20,
            border: "1px solid var(--border)",
            marginRight: -1,
            background: step.status === "ready" ? "rgba(0,255,136,0.03)" : "transparent",
            borderColor: step.status === "ready" ? "var(--green)" : step.status === "done" ? "var(--dim)" : "var(--border)",
          }}>
            <div style={{ fontSize: 9, color: "var(--muted)", letterSpacing: 3, marginBottom: 8 }}>{step.num}</div>
            <div style={{ fontSize: 11, color: step.status === "done" ? "var(--dim)" : "var(--text)", marginBottom: 4 }}>{step.name}</div>
            <div style={{ fontSize: 9, color: step.status === "done" ? "var(--dim)" : step.status === "ready" ? "var(--green)" : "var(--muted)" }}>
              {step.status === "done" ? "✓ DONE" : step.status === "ready" ? "READY" : "WAITING"}
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={handleStep}
        disabled={done}
        style={{
          marginTop: 24,
          background: "transparent",
          border: "1px solid var(--green)",
          color: done ? "var(--dim)" : "var(--green)",
          borderColor: done ? "var(--dim)" : "var(--green)",
          padding: "12px 32px",
          fontFamily: "monospace",
          fontSize: 10,
          letterSpacing: 3,
          cursor: done ? "not-allowed" : "pointer",
        }}
      >
        {btnText}
      </button>
    </div>
  );
}