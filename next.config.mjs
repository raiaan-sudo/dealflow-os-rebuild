/** @type {import('next').NextConfig} */
const appBaseUrl = "https://app.agentdealflow.io";

const nextConfig = {
  async redirects() {
    return [
      {
        source: "/login",
        destination: `${appBaseUrl}/login`,
        permanent: false,
      },
      {
        source: "/welcome",
        destination: `${appBaseUrl}/welcome`,
        permanent: false,
      },
      {
        source: "/onboarding",
        destination: `${appBaseUrl}/onboarding`,
        permanent: false,
      },
      {
        source: "/dashboard",
        destination: `${appBaseUrl}/dashboard`,
        permanent: false,
      },
      {
        source: "/builder",
        destination: `${appBaseUrl}/builder`,
        permanent: false,
      },
      {
        source: "/build/:path*",
        destination: `${appBaseUrl}/build/:path*`,
        permanent: false,
      },
      {
        source: "/preview",
        destination: `${appBaseUrl}/preview`,
        permanent: false,
      },
      {
        source: "/paywall",
        destination: `${appBaseUrl}/paywall`,
        permanent: false,
      },
      {
        source: "/launch",
        destination: `${appBaseUrl}/launch`,
        permanent: false,
      },
      {
        source: "/settings",
        destination: `${appBaseUrl}/settings`,
        permanent: false,
      },
      {
        source: "/results",
        destination: `${appBaseUrl}/results`,
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
