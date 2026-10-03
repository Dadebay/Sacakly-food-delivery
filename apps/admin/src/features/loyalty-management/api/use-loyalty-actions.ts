import { useMutation, useQueryClient } from "@tanstack/react-query";
import { loyaltyQueryKeys, type CreateGift, type Gift, type UpdateGift } from "@/src/entities/loyalty";
import { useSession } from "@/src/shared/auth";
import type { MediaUpload } from "@/src/entities/catalog";

export function useLoyaltyActions() {
  const { authorizedRequest } = useSession();
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: loyaltyQueryKeys.all });
  const createGift = useMutation({
    mutationFn: (body: CreateGift) => authorizedRequest<Gift>("/loyalty/admin/gifts", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: refresh,
  });
  const updateGift = useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateGift }) => authorizedRequest<Gift>(`/loyalty/admin/gifts/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: refresh,
  });
  const uploadImage = useMutation({
    mutationFn: (file: File) => {
      const body = new FormData();
      body.append("file", file);
      return authorizedRequest<MediaUpload>("/media/images", { method: "POST", body });
    },
  });
  return { createGift, updateGift, uploadImage };
}
