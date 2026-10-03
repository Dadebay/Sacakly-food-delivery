import type { components } from "@alowalow/api-contract";

export type NotificationCampaign =
  components["schemas"]["NotificationCampaignResponseDto"];
export type NotificationCampaignList =
  components["schemas"]["NotificationCampaignListResponseDto"];
export type CreateNotificationCampaign =
  components["schemas"]["CreateNotificationCampaignDto"];
export type NotificationCampaignStatus = NotificationCampaign["status"];
