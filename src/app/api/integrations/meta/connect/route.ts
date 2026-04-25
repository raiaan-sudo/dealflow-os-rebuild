import { NextResponse } from "next/server";

export function GET() {
  const url = new URL("https://www.facebook.com/v18.0/dialog/oauth");
  const redirectUri =
    "https://earning-cemetery-pointed-excess.trycloudflare.com/api/integrations/meta/callback";

  url.searchParams.set("client_id", process.env.META_APP_ID || "");
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", "ads_read,business_management");
  url.searchParams.set("response_type", "code");
  console.log("REDIRECT_URI:", redirectUri);

  return NextResponse.redirect(url.toString());
}
