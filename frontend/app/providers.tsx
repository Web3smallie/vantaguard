"use client";
import { RainbowKitProvider, getDefaultConfig, darkTheme } from "@rainbow-me/rainbowkit";
import { WagmiProvider, useAccount } from "wagmi";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import "@rainbow-me/rainbowkit/styles.css";
import { useEffect } from "react";

const etherlink = {
  id: 42793,
  name: "Etherlink",
  nativeCurrency: { name: "XTZ", symbol: "XTZ", decimals: 18 },
  rpcUrls: { default: { http: ["https://node.mainnet.etherlink.com"] } },
  blockExplorers: { default: { name: "Etherlink Explorer", url: "https://explorer.etherlink.com" } },
};

const config = getDefaultConfig({
  appName: "Vantaguard",
  projectId: "34d7247f405c3016dba4d5e84c8003ef",
  chains: [etherlink],
  ssr: true,
});

const queryClient = new QueryClient();

function WalletSync() {
  const { address, isConnected } = useAccount();

  useEffect(() => {
    if (!isConnected || !address) return;

    const upsertWallet = async () => {
      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/security_status`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
              Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!}`,
              Prefer: "resolution=merge-duplicates",
            },
            body: JSON.stringify({
              user_address: address,
              last_action: "Wallet connected",
            }),
          }
        );
        if (!res.ok) {
          console.error("Supabase wallet sync failed:", await res.text());
        } else {
          console.log("Wallet synced to Supabase:", address);
        }
      } catch (e) {
        console.error("Wallet sync error:", e);
      }
    };

    upsertWallet();
  }, [address, isConnected]);

  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={darkTheme({
          accentColor: "#00ff88",
          accentColorForeground: "#000",
          borderRadius: "none",
          fontStack: "system",
        })}>
          <WalletSync />
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}