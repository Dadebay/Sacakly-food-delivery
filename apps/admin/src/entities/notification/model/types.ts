import type { components } from "@sacakly/api-contract";

export type NotificationCampaign =
  components["schemas"]["NotificationCampaignResponseDto"];
export type NotificationCampaignList =
  components["schemas"]["NotificationCampaignListResponseDto"];
export type CreateNotificationCampaign =
  components["schemas"]["CreateNotificationCampaignDto"];
export type NotificationCampaignStatus = NotificationCampaign["status"];
