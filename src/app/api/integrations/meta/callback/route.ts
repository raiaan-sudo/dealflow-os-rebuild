import { NextResponse } from "next/server";
import { getMetaEnv } from "@/lib/env";
import { encryptSecret } from "@/lib/integrations/meta-crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { createRouteHandlerClient } from "@/lib/supabase/route-handler";
import { getAppContext } from "@/lib/services/app-context";

type MetaAdAccount = {
  id?: string;
  account_id?: string;
  name?: string;
};

type MetaPixel = {
  id?: string;
  name?: string;
};

async function resolveOrganizationIdForMetaCallback(): Promise<string | null> {
  try {
    const context = await getAppContext();
    if (context?.organization?.id) {
      return context.organization.id;
    }
  } catch (e) {
    console.error("Meta callback: getAppContext failed, trying membership fallback", e);
  }

  const supabase = await createRouteHandlerClient();
  if (!supabase) {
    return null;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data: membership } = await supabase
    .from("organization_memberships")
    .select("organization_id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  let orgId = (membership as { organization_id?: string } | null)?.organization_id ?? null;

  if (!orgId) {
    const admin = createAdminClient();
    if (admin) {
      const { data: m2 } = await admin
        .from("organization_memberships")
        .select("organization_id")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      orgId = (m2 as { organization_id?: string } | null)?.organization_id ?? null;
    }
  }

  if (!orgId) {
    const { data: owned } = await supabase
      .from("organizations")
      .select("id")
      .eq("owner_user_id", user.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    orgId = (owned as { id?: string } | null)?.id ?? null;
  }

  if (!orgId) {
    const admin = createAdminClient();
    if (admin) {
      const { data: ownedAdm } = await admin
        .from("organizations")
        .select("id")
        .eq("owner_user_id", user.id)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      orgId = (ownedAdm as { id?: string } | null)?.id ?? null;
    }
  }

  if (!orgId) {
    const defaultOrgId = process.env.META_DEFAULT_ORGANIZATION_ID;
    if (defaultOrgId) {
      return defaultOrgId;
    }
  }

  if (!orgId) {
    const { data: firstOrganization } = await supabase
      .from("organizations")
      .select("id")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    orgId = (firstOrganization as { id?: string } | null)?.id ?? null;
  }

  if (!orgId) {
    const admin = createAdminClient();
    if (admin) {
      const { data: firstOrganization } = await admin
        .from("organizations")
        .select("id")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      orgId = (firstOrganization as { id?: string } | null)?.id ?? null;
    }
  }

  if (!orgId) {
    const admin = createAdminClient();
    const organizationPayload = {
      name: user.email ? `${user.email.split("@")[0]} Group` : "Meta Workspace",
      slug: `meta-workspace-${Date.now()}`,
      owner_user_id: user.id,
      plan_tier: "starter",
    };

    if (admin) {
      const { data: createdOrganization } = await admin
        .from("organizations")
        .insert(organizationPayload as never)
        .select("id")
        .single();
      orgId = (createdOrganization as { id?: string } | null)?.id ?? null;
    } else {
      const { data: createdOrganization } = await supabase
        .from("organizations")
        .insert(organizationPayload as never)
        .select("id")
        .single();
      orgId = (createdOrganization as { id?: string } | null)?.id ?? null;
    }
  }

  return orgId;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const error = url.searchParams.get("error");
    const code = url.searchParams.get("code");

    if (error) {
      console.error("META OAUTH ERROR:", error);
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?meta_error=${error}`,
      );
    }

    if (!code) {
      console.error("NO CODE RETURNED");
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?meta_error=no_code`,
      );
    }

    const tokenRes = await fetch(
      `https://graph.facebook.com/v18.0/oauth/access_token?` +
        `client_id=${process.env.META_APP_ID}` +
        `&client_secret=${process.env.META_APP_SECRET}` +
        `&redirect_uri=${encodeURIComponent(process.env.META_REDIRECT_URI!)}` +
        `&code=${code}`,
    );

    const tokenData = (await tokenRes.json()) as { access_token?: string };

    console.log("META TOKEN (temporary):", tokenData?.access_token ? "[received]" : tokenData);

    if (!tokenData.access_token) {
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?meta_error=no_token`,
      );
    }

    const accountsRes = await fetch(
      `https://graph.facebook.com/v18.0/me/adaccounts` +
        `?fields=id,account_id,name,account_status` +
        `&access_token=${encodeURIComponent(tokenData.access_token)}`,
    );
    const accountsData = await accountsRes.json();
    const availableAccounts = Array.isArray(accountsData?.data)
      ? (accountsData.data as MetaAdAccount[])
          .map((account) => {
            const externalAccountId = account.account_id ?? account.id ?? null;

            if (!externalAccountId || !account.name) {
              return null;
            }

            return {
              id: account.id ?? externalAccountId,
              external_account_id: externalAccountId,
              name: account.name,
              status:
                typeof (account as { account_status?: string | number }).account_status !== "undefined"
                  ? String((account as { account_status?: string | number }).account_status)
                  : null,
            };
          })
          .filter(Boolean)
      : [];
    const primaryAccount = availableAccounts[0] ?? null;
    const pixelsRes = primaryAccount?.external_account_id
      ? await fetch(
          `https://graph.facebook.com/v18.0/act_${primaryAccount.external_account_id.replace(/^act_/, "")}/adspixels` +
            `?fields=id,name` +
            `&access_token=${encodeURIComponent(tokenData.access_token)}`,
        )
      : null;
    const pixelsData = pixelsRes ? await pixelsRes.json() : null;
    const availablePixels = Array.isArray(pixelsData?.data)
      ? (pixelsData.data as MetaPixel[])
          .map((pixel) => {
            if (!pixel.id) {
              return null;
            }

            return {
              id: pixel.id,
              name: pixel.name ?? pixel.id,
            };
          })
          .filter(Boolean)
      : [];
    const primaryPixel = availablePixels[0] ?? null;

    const env = getMetaEnv();
    const supabase = await createRouteHandlerClient();
    const organizationId = await resolveOrganizationIdForMetaCallback();

    if (!env?.encryptionKey) {
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?meta_error=meta_config_missing`,
      );
    }

    if (!supabase) {
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?meta_error=supabase_unavailable`,
      );
    }

    if (!organizationId) {
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?meta_error=link_failed`,
      );
    }

    const encryptedAccessToken = encryptSecret(tokenData.access_token, env.encryptionKey);
    const now = new Date().toISOString();

    const { data: existing } = await supabase
      .from("marketing_accounts")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("platform", "meta_ads")
      .maybeSingle();

    if (existing?.id) {
      const { error: updateError } = await supabase
        .from("marketing_accounts")
        .update({
          access_token_encrypted: encryptedAccessToken,
          external_account_id: primaryAccount?.external_account_id ?? null,
          account_name: primaryAccount?.name ?? "Meta Ads",
          name: primaryAccount?.name ?? "Meta Ads",
          pixel_id: primaryPixel?.id ?? null,
          status: "connected",
          connected_at: now,
          last_sync_at: now,
          token_last_synced_at: now,
          connection_metadata: {
            provider: "meta",
            auth_flow: "oauth",
            available_accounts: availableAccounts,
            available_pixels: availablePixels,
            selected_external_account_id: primaryAccount?.external_account_id ?? null,
            pixel_id: primaryPixel?.id ?? null,
          },
        } as never)
        .eq("id", existing.id);

      if (updateError) {
        return NextResponse.redirect(
          `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?meta_error=token_store_failed`,
        );
      }
    } else {
      const { error: insertError } = await supabase
        .from("marketing_accounts")
        .insert({
          organization_id: organizationId,
          platform: "meta_ads",
          name: primaryAccount?.name ?? "Meta Ads",
          account_name: primaryAccount?.name ?? "Meta Ads",
          external_account_id: primaryAccount?.external_account_id ?? null,
          pixel_id: primaryPixel?.id ?? null,
          access_token_encrypted: encryptedAccessToken,
          status: "connected",
          connected_at: now,
          created_at: now,
          updated_at: now,
          last_sync_at: now,
          token_last_synced_at: now,
          connection_metadata: {
            provider: "meta",
            auth_flow: "oauth",
            available_accounts: availableAccounts,
            available_pixels: availablePixels,
            selected_external_account_id: primaryAccount?.external_account_id ?? null,
            pixel_id: primaryPixel?.id ?? null,
          },
        } as never);

      if (insertError) {
        return NextResponse.redirect(
          `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?meta_error=token_store_failed`,
        );
      }
    }

    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?meta_connected=true`,
    );
  } catch (err) {
    console.error("CALLBACK CRASH:", err);
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?meta_error=crash`,
    );
  }
}
