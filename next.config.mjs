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
        source: "/signup",
        destination: `${appBaseUrl}/signup`,
        permanent: false,
      },
      {
        source: "/start",
        destination: `${appBaseUrl}/start`,
        permanent: false,
      },
      {
        source: "/unlock",
        destination: `${appBaseUrl}/unlock`,
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
      {
        source: "/f/:path*",
        destination: `${appBaseUrl}/f/:path*`,
        permanent: false,
      },
      {
        source: "/p/:path*",
        destination: `${appBaseUrl}/p/:path*`,
        permanent: false,
      },
      {
        source: "/partner/:path*",
        destination: `${appBaseUrl}/partner/:path*`,
        permanent: false,
      },
      {
        source: "/admin/:path*",
        destination: `${appBaseUrl}/admin/:path*`,
        permanent: false,
      },
      {
        source: "/campaign-built",
        destination: `${appBaseUrl}/campaign-built`,
        permanent: false,
      },
      {
        source: "/launch-success",
        destination: `${appBaseUrl}/launch-success`,
        permanent: false,
      },
      {
        source: "/launching",
        destination: `${appBaseUrl}/launching`,
        permanent: false,
      },
      {
        source: "/api/:path*",
        destination: `${appBaseUrl}/api/:path*`,
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
