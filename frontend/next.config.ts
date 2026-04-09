/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://node.mainnet.etherlink.com https://*.walletconnect.com wss://*.walletconnect.com https://*.walletconnect.org https://api.resend.com; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self';",
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;