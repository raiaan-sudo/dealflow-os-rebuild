import Stripe from "stripe";
import { ApiError } from "@/lib/api/route";
import { getStripeEnv, validateStripeEnv } from "@/lib/env";
import type {
  ExecutionProvider,
  ProviderConfigValidation,
  ProviderConnectionStatus,
  ProviderFailure,
} from "@/lib/integrations/contracts";

export type StripeBillingExecuteRequest =
  | {
      action: "create_customer";
      params: Stripe.CustomerCreateParams;
      idempotencyKey?: string;
    }
  | {
      action: "create_checkout_session";
      params: Stripe.Checkout.SessionCreateParams;
      idempotencyKey?: string;
    }
  | {
      action: "create_billing_portal_session";
      params: Stripe.BillingPortal.SessionCreateParams;
      idempotencyKey?: string;
    }
  | {
      action: "retrieve_subscription";
      subscriptionId: string;
    }
  | {
      action: "construct_webhook_event";
      payload: string;
      signature: string;
    };

type StripeBillingRawResult =
  | Stripe.Customer
  | Stripe.Checkout.Session
  | Stripe.BillingPortal.Session
  | Stripe.Subscription
  | Stripe.Event;

export type StripeBillingParsedResult = {
  success: true;
  objectType: string;
  id: string | null;
  metadata?: Record<string, unknown>;
};

export interface StripeBillingProvider
  extends
    ExecutionProvider<
      StripeBillingExecuteRequest,
      StripeBillingRawResult,
      StripeBillingParsedResult
    > {
  getClient(): Stripe | null;
}

function parseStripeFailure(error: unknown): ProviderFailure {
  if (error instanceof ApiError) {
    return {
      code: error.code ?? "stripe_provider_failed",
      message: error.message,
      retryability: {
        retryable: error.status >= 500,
        strategy: error.status >= 500 ? "backoff" : "manual",
      },
      details: {
        status: error.status,
      },
    };
  }

  return {
    code: "stripe_provider_failed",
    message: error instanceof Error ? error.message : "Stripe request failed.",
    retryability: {
      retryable: true,
      strategy: "backoff",
    },
  };
}

class ConfiguredStripeBillingProvider implements StripeBillingProvider
{
  id = "stripe_billing";
  label = "Stripe Billing";
  vendor = "Stripe";
  private client: Stripe | null = null;

  isConfigured() {
    return Boolean(getStripeEnv());
  }

  validateConfig(): ProviderConfigValidation {
    const validation = validateStripeEnv();
    return {
      configured: validation.configured,
      missingConfig: validation.missing,
    };
  }

  async checkStatus(): Promise<ProviderConnectionStatus> {
    const validation = this.validateConfig();

    return {
      status: validation.configured ? "connected" : "disconnected",
      state: validation.configured ? "configured" : "not_configured",
      message: validation.configured
        ? "Stripe billing credentials are configured and ready."
        : "Stripe billing credentials are incomplete.",
    };
  }

  private getClientOrThrow() {
    const env = getStripeEnv();

    if (!env) {
      throw new ApiError(503, "Stripe is not configured yet.", "stripe_not_configured");
    }

    if (!this.client) {
      this.client = new Stripe(env.secretKey);
    }

    return {
      client: this.client,
      env,
    };
  }

  getClient() {
    try {
      return this.getClientOrThrow().client;
    } catch {
      return null;
    }
  }

  async execute(request: StripeBillingExecuteRequest): Promise<StripeBillingRawResult> {
    const { client, env } = this.getClientOrThrow();

    if (request.action === "create_customer") {
      return client.customers.create(
        request.params,
        request.idempotencyKey ? { idempotencyKey: request.idempotencyKey } : undefined,
      );
    }

    if (request.action === "create_checkout_session") {
      return client.checkout.sessions.create(
        request.params,
        request.idempotencyKey ? { idempotencyKey: request.idempotencyKey } : undefined,
      );
    }

    if (request.action === "create_billing_portal_session") {
      return client.billingPortal.sessions.create(
        request.params,
        request.idempotencyKey ? { idempotencyKey: request.idempotencyKey } : undefined,
      );
    }

    if (request.action === "retrieve_subscription") {
      return client.subscriptions.retrieve(request.subscriptionId, {
        expand: ["items.data.price"],
      });
    }

    return client.webhooks.constructEvent(request.payload, request.signature, env.webhookSecret);
  }

  parseResult(raw: StripeBillingRawResult): StripeBillingParsedResult {
    return {
      success: true,
      objectType: "object" in raw ? raw.object : "unknown",
      id: "id" in raw && typeof raw.id === "string" ? raw.id : null,
      metadata:
        "metadata" in raw && raw.metadata && typeof raw.metadata === "object"
          ? (raw.metadata as Record<string, unknown>)
          : undefined,
    };
  }

  parseFailure(error: unknown): ProviderFailure {
    return parseStripeFailure(error);
  }
}

const stripeBillingProvider = new ConfiguredStripeBillingProvider();

export function getStripeBillingProvider() {
  return stripeBillingProvider;
}
