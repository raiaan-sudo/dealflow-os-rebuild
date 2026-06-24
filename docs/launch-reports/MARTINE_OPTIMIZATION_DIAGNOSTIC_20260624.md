# Martine Optimization Diagnostic - 2026-06-24

Read-only diagnostic. No Meta mutation and no database mutation were performed by this script.

- Generated at: 2026-06-24T19:21:21.687Z
- Campaign: 957014e8-870f-40e1-9f71-ea7256b09482
- Organization: 42e2ccc8-8515-48c3-b105-df531f82031d
- Classification: sync_degraded
- Reason: At least one stored Meta object ID is unreadable through Graph readback.

## Redacted Summary

```json
{
  "generatedAt": "2026-06-24T19:21:21.687Z",
  "campaign": {
    "id": "957014e8-870f-40e1-9f71-ea7256b09482",
    "organizationId": "42e2ccc8-8515-48c3-b105-df531f82031d",
    "userId": "559c0fd4-c442-4cbf-86c3-d2e8581c9a8f",
    "publicSlug": "martine",
    "launchStatus": "live",
    "publishState": "published",
    "selectedStaticCreativeIds": [
      "957014e8-870f-40e1-9f71-ea7256b09482-martine-fr-static-1-seller-over-market",
      "957014e8-870f-40e1-9f71-ea7256b09482-martine-fr-static-2-seller-value-gap",
      "957014e8-870f-40e1-9f71-ea7256b09482-martine-fr-static-3-seller-90-days"
    ]
  },
  "metaRuntime": {
    "campaignId": "120247424552320691",
    "adSetIds": [
      "120247426299950691"
    ],
    "adIds": [
      "120247429955020691",
      "120247433073970691",
      "120247433076290691"
    ],
    "creativeIds": [
      "2079127772955888",
      "1014232364522617",
      "1702133177698462"
    ]
  },
  "metaConnection": {
    "status": "connected",
    "accountId": "act_344085034950359",
    "accountName": "Charles & Martine Real Estate Ad Account",
    "pageId": "195428953917127",
    "pixelId": "1396310424907119",
    "tokenConfigured": true,
    "lastSyncAt": "2026-06-20T19:59:23.518+00:00"
  },
  "latestSnapshot": {
    "id": "41a96932-2cd7-4c6d-b0a6-b22f23ea14ad",
    "syncResult": "success",
    "campaignStatus": "ACTIVE",
    "syncedAt": "2026-06-20T20:56:32.356+00:00",
    "deliveryMetrics": {
      "spend": 0,
      "impressions": 0,
      "clicks": 0,
      "leads": 0
    },
    "syncErrors": [],
    "syncMetadata": {
      "note": "Martine three French static ads activated in Meta; effective statuses initially IN_PROCESS while Meta review completes.",
      "source": "operator_activation",
      "proof_run_id": "martine_meta_three_static_ads_active_20260620_01"
    }
  },
  "performanceTrackingRows": [],
  "entitlement": {
    "billingRows": [
      {
        "id": "f4c1bff2-4c5e-4e19-ac28-98d68fbb0f9b",
        "organization_id": "42e2ccc8-8515-48c3-b105-df531f82031d",
        "plan_tier": "pro",
        "status": "trialing",
        "current_period_end": "2026-06-24T18:44:59+00:00",
        "updated_at": "2026-06-17T18:45:05.269836+00:00"
      }
    ],
    "autonomyRows": []
  },
  "creativeAssetSummary": [
    {
      "id": "d9e395f2-3844-4718-828b-58ee9594d71c",
      "creativeId": "957014e8-870f-40e1-9f71-ea7256b09482-martine-fr-static-1-seller-over-market",
      "status": "completed",
      "reviewStatus": null,
      "selectedForLaunch": null,
      "launchReady": null,
      "providerName": "higgsfield_marketing_studio"
    },
    {
      "id": "7f4d36d1-26c8-41d6-a020-0b5086c43cbc",
      "creativeId": "957014e8-870f-40e1-9f71-ea7256b09482-martine-fr-static-2-seller-value-gap",
      "status": "completed",
      "reviewStatus": null,
      "selectedForLaunch": null,
      "launchReady": null,
      "providerName": "higgsfield_marketing_studio"
    },
    {
      "id": "aa2b8ab4-ce13-4cde-ad12-972b329817dd",
      "creativeId": "957014e8-870f-40e1-9f71-ea7256b09482-martine-fr-static-3-seller-90-days",
      "status": "completed",
      "reviewStatus": null,
      "selectedForLaunch": null,
      "launchReady": null,
      "providerName": "higgsfield_marketing_studio"
    }
  ],
  "graphReadback": [
    {
      "stage": "campaign",
      "id": "120247...0691",
      "result": {
        "ok": false,
        "status": 400,
        "code": 10,
        "subcode": null,
        "type": "OAuthException",
        "message": "(#10) Application does not have permission for this action"
      }
    },
    {
      "stage": "ad_set",
      "id": "120247...0691",
      "result": {
        "ok": false,
        "status": 400,
        "code": 100,
        "subcode": 33,
        "type": "GraphMethodException",
        "message": "Unsupported get request. Object with ID '120247426299950691' does not exist, cannot be loaded due to missing permissions, or does not support this operation. Please read the Graph API documentation at https://developers.facebook.com/docs/graph-api"
      }
    },
    {
      "stage": "ad",
      "id": "120247...0691",
      "result": {
        "ok": false,
        "status": 400,
        "code": 100,
        "subcode": 33,
        "type": "GraphMethodException",
        "message": "Unsupported get request. Object with ID '120247429955020691' does not exist, cannot be loaded due to missing permissions, or does not support this operation. Please read the Graph API documentation at https://developers.facebook.com/docs/graph-api"
      }
    },
    {
      "stage": "ad",
      "id": "120247...0691",
      "result": {
        "ok": false,
        "status": 400,
        "code": 100,
        "subcode": 33,
        "type": "GraphMethodException",
        "message": "Unsupported get request. Object with ID '120247433073970691' does not exist, cannot be loaded due to missing permissions, or does not support this operation. Please read the Graph API documentation at https://developers.facebook.com/docs/graph-api"
      }
    },
    {
      "stage": "ad",
      "id": "120247...0691",
      "result": {
        "ok": false,
        "status": 400,
        "code": 100,
        "subcode": 33,
        "type": "GraphMethodException",
        "message": "Unsupported get request. Object with ID '120247433076290691' does not exist, cannot be loaded due to missing permissions, or does not support this operation. Please read the Graph API documentation at https://developers.facebook.com/docs/graph-api"
      }
    },
    {
      "stage": "creative",
      "id": "207912...5888",
      "result": {
        "ok": false,
        "status": 400,
        "code": 100,
        "subcode": 33,
        "type": "GraphMethodException",
        "message": "Unsupported get request. Object with ID '2079127772955888' does not exist, cannot be loaded due to missing permissions, or does not support this operation. Please read the Graph API documentation at https://developers.facebook.com/docs/graph-api"
      }
    },
    {
      "stage": "creative",
      "id": "101423...2617",
      "result": {
        "ok": false,
        "status": 400,
        "code": 100,
        "subcode": 33,
        "type": "GraphMethodException",
        "message": "Unsupported get request. Object with ID '1014232364522617' does not exist, cannot be loaded due to missing permissions, or does not support this operation. Please read the Graph API documentation at https://developers.facebook.com/docs/graph-api"
      }
    },
    {
      "stage": "creative",
      "id": "170213...8462",
      "result": {
        "ok": false,
        "status": 400,
        "code": 100,
        "subcode": 33,
        "type": "GraphMethodException",
        "message": "Unsupported get request. Object with ID '1702133177698462' does not exist, cannot be loaded due to missing permissions, or does not support this operation. Please read the Graph API documentation at https://developers.facebook.com/docs/graph-api"
      }
    },
    {
      "stage": "insights",
      "id": "120247...ghts",
      "result": {
        "ok": false,
        "status": 400,
        "code": 100,
        "subcode": 33,
        "type": "GraphMethodException",
        "message": "Unsupported get request. Object with ID '120247424552320691' does not exist, cannot be loaded due to missing permissions, or does not support this operation. Please read the Graph API documentation at https://developers.facebook.com/docs/graph-api"
      }
    }
  ],
  "classification": {
    "status": "sync_degraded",
    "reason": "At least one stored Meta object ID is unreadable through Graph readback.",
    "unreadable": [
      "campaign:120247...0691",
      "ad_set:120247...0691",
      "ad:120247...0691",
      "ad:120247...0691",
      "ad:120247...0691",
      "creative:207912...5888",
      "creative:101423...2617",
      "creative:170213...8462",
      "insights:120247...ghts"
    ]
  }
}
```
