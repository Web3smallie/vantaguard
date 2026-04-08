"use client";
import { RainbowKitProvider, getDefaultConfig, darkTheme } from "@rainbow-me/rainbowkit";
import { WagmiProvider } from "wagmi";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import "@rainbow-me/rainbowkit/styles.css";

const etherlink = {
  id: 42793,
  name: "Etherlink Shadownet",
  nativeCurrency: { name: "XTZ", symbol: "XTZ", decimals: 18 },
  rpcUrls: { default: { http: ["https://node.shadownet.etherlink.com"] } },
  blockExplorers: { default: { name: "Shadownet Explorer", url: "https://shadownet.explorer.etherlink.com" } },
};

const config = getDefaultConfig({
  appName: "Vantaguard",
  projectId: "34d7247f405c3016dba4d5e84c8003ef",
  chains: [etherlink],
  ssr: true,
});

const queryClient = new QueryClient();

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
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}