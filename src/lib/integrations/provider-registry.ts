import { getDurableVideoIntegrationProvider } from "@/lib/integrations/creative/durable-video-provider";
import { getImageGenerationProvider } from "@/lib/integrations/creative/image-provider";
import { getVoiceProvider } from "@/lib/integrations/creative/voice-provider";
import type { ExecutionProvider } from "@/lib/integrations/contracts";
import { getMetaMarketingProvider, getMetaTrackingProvider } from "@/lib/integrations/meta/provider";
import { getStripeBillingProvider } from "@/lib/integrations/stripe/provider";
import {
  deriveIntegrationState,
  normalizeProviderConnectionStatus,
  type IntegrationStateModel,
} from "@/lib/integrations/state";

export type IntegrationProviderId =
  | "meta_marketing_api"
  | "meta_tracking"
  | "stripe_billing"
  | "ai_image_generation"
  | "ai_video_generation"
  | "ai_voice_generation";

export type IntegrationProviderCategory = "ads" | "tracking" | "billing" | "ai";
export type IntegrationProviderState = "configured" | "partial" | "not_configured";

export const INTEGRATION_PROVIDER_REGISTRY_SCOPE = {
  purpose: "execution_adapter_inventory",
  aggregateReadinessAuthority: false,
  omittedOperationalSystems: [
    "gohighlevel_tenant_provisioning",
    "twilio_messaging",
    "supabase_database_auth",
    "support_notification_delivery",
  ],
  readinessDimensions: [
    "configured",
    "reachable",
    "authenticated",
    "functional",
    "observed_at",
  ],
} as const;

type RegisteredProvider = {
  id: IntegrationProviderId;
  label: string;
  vendor: string;
  category: IntegrationProviderCategory;
  description: string;
  settingsHint: string;
  capabilities: string[];
  provider: ExecutionProvider<unknown, unknown, unknown>;
};

const registeredProviders: RegisteredProvider[] = [
  {
    id: "meta_marketing_api",
    label: "Meta Marketing API",
    vendor: "Meta",
    category: "ads",
    description: "Campaign creation, ad set delivery, and live Meta deployment.",
    settingsHint: "Add Meta app credentials and redirect configuration to enable live campaign deployment.",
    capabilities: ["connect", "status", "deploy", "parse_result", "parse_failure"],
    provider: getMetaMarketingProvider(),
  },
  {
    id: "meta_tracking",
    label: "Meta Pixel + Domain",
    vendor: "Meta",
    category: "tracking",
    description: "Pixel wiring and domain verification readiness for launch tracking.",
    settingsHint: "Save each workspace's own pixel and launch domain so tracking readiness reflects that client's setup.",
    capabilities: ["status", "tracking_readiness", "parse_result", "parse_failure"],
    provider: getMetaTrackingProvider(),
  },
  {
    id: "stripe_billing",
    label: "Stripe Billing",
    vendor: "Stripe",
    category: "billing",
    description: "Checkout, subscriptions, billing sync, and paywall activation.",
    settingsHint: "Add Stripe secret, webhook, and price IDs to enable billing flows.",
    capabilities: ["status", "checkout", "webhook", "subscription_sync", "parse_failure"],
    provider: getStripeBillingProvider(),
  },
  {
    id: "ai_image_generation",
    label: "AI Image Generation",
    vendor: "OpenAI",
    category: "ai",
    description: "Static ad image generation for launch-ready creative assets.",
    settingsHint: "Add AI image credentials to generate live static ad images.",
    capabilities: ["status", "generate_image", "parse_result", "parse_failure"],
    provider: getImageGenerationProvider(),
  },
  {
    id: "ai_video_generation",
    label: "AI Video Generation",
    vendor: "Higgsfield (HeyGen legacy fallback)",
    category: "ai",
    description: "Durable Higgsfield image-to-video generation with a guarded HeyGen legacy fallback.",
    settingsHint: "Configure Higgsfield credentials and generate a source image before rendering a video ad.",
    capabilities: ["status", "generate_video", "parse_result", "parse_failure"],
    provider: getDurableVideoIntegrationProvider(),
  },
  {
    id: "ai_voice_generation",
    label: "AI Voice Generation",
    vendor: "ElevenLabs",
    category: "ai",
    description: "Voiceover synthesis for avatar video ads and spoken creative assets.",
    settingsHint: "Add voice provider credentials to enable rendered narration and spoken ad assets.",
    capabilities: ["status", "generate_voice", "parse_result", "parse_failure"],
    provider: getVoiceProvider(),
  },
];

export function getRegisteredIntegrationProviders() {
  return registeredProviders;
}

export function getRegisteredIntegrationProvider(id: IntegrationProviderId) {
  return registeredProviders.find((provider) => provider.id === id) ?? null;
}

export async function getIntegrationProviders(): Promise<IntegrationStateModel[]> {
  return Promise.all(
    registeredProviders.map(async (entry) => {
      const validation = entry.provider.validateConfig();
      const status = normalizeProviderConnectionStatus(await entry.provider.checkStatus());

      return {
        id: entry.id,
        label: entry.label,
        vendor: entry.vendor,
        category: entry.category,
        description: entry.description,
        settingsHint: entry.settingsHint,
        capabilities: entry.capabilities,
        validation,
        status,
        state: deriveIntegrationState(validation, status),
      };
    }),
  );
}

export async function getIntegrationProviderState(id: IntegrationProviderId) {
  const entry = getRegisteredIntegrationProvider(id);

  if (!entry) {
    return null;
  }

  const validation = entry.provider.validateConfig();
  const status = normalizeProviderConnectionStatus(await entry.provider.checkStatus());

  return {
    id: entry.id,
    label: entry.label,
    vendor: entry.vendor,
    category: entry.category,
    description: entry.description,
    settingsHint: entry.settingsHint,
    capabilities: entry.capabilities,
    validation,
    status,
    state: deriveIntegrationState(validation, status),
  } satisfies IntegrationStateModel;
}
