import { useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export function useDeleteReceiptItem(receiptId: string | null) {
  const { toast } = useToast();
  return useMutation({
    mutationFn: (itemId: string) => apiRequest(`/api/items/${itemId}`, "DELETE"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/receipts", receiptId, "items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/receipts", receiptId] });
      toast({ title: "Item deleted" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to delete item", description: error.message, variant: "destructive" });
    },
  });
}

export function useUpdateReceiptItem(receiptId: string | null) {
  const { toast } = useToast();
  return useMutation({
    mutationFn: ({ itemId, data }: { itemId: string; data: { name: string; quantity: number; price: string; category?: string | null } }) =>
      apiRequest(`/api/items/${itemId}`, "PATCH", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/receipts", receiptId, "items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/receipts", receiptId] });
      toast({ title: "Item updated" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to update item", description: error.message, variant: "destructive" });
    },
  });
}
