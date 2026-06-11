"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { redirectToLoginOnUnauthorized } from "@/features/auth/api/session-cache";

interface InventoryItem {
  id: string;
  productId: string;
  productCode: string;
  productName: string;
  displayName: string;
  quantity: number;
}

interface ReceiveStockModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialProduct: InventoryItem | null;
  onSubmit: (data: { productId: string; quantity: number; notes: string }) => void;
  isSubmitting: boolean;
}

type MainInventoryResponse = {
  items: InventoryItem[];
};

type ApiEnvelope<T> = {
  data: T;
};

export function ReceiveStockModal({
  isOpen,
  onClose,
  initialProduct,
  onSubmit,
  isSubmitting,
}: ReceiveStockModalProps) {
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [notes, setNotes] = useState("");
  
  // Minimal product list fetch if no initial product provided
  const [products, setProducts] = useState<InventoryItem[]>([]);

  useEffect(() => {
    if (initialProduct) {
      setProductId(initialProduct.productId);
    } else {
      setProductId("");
      // Fetch all active products for the select dropdown
      fetch("/api/main-inventory?pageSize=500")
        .then((res) => {
          redirectToLoginOnUnauthorized(res);
          return res;
        })
        .then((res) => res.json())
        .then((envelope: ApiEnvelope<MainInventoryResponse>) => setProducts(envelope.data.items ?? []))
        .catch(() => {});
    }
  }, [initialProduct, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setQuantity("");
      setNotes("");
    }
  }, [isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!productId || !quantity || Number(quantity) <= 0) return;
    onSubmit({
      productId,
      quantity: Number(quantity),
      notes,
    });
  };

  const inputClass = "flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm ring-offset-white file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="app-dialog-content sm:max-w-[425px] p-0" aria-labelledby="receive-stock-title">
        <div className="app-dialog-shell">
          <div className="app-dialog-header">
            <div>
              <h2 id="receive-stock-title" className="text-xl font-bold tracking-tight text-slate-900">Receive Stock</h2>
              <p className="mt-1 text-sm text-slate-500">Add new inventory to the central freezer.</p>
            </div>
          </div>

          <div className="app-dialog-body">
            <form id="receive-stock-form" onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1">
                <label htmlFor="product" className="text-xs font-semibold uppercase tracking-wider text-slate-500">Product</label>
                {initialProduct ? (
                  <input
                    id="product"
                    value={initialProduct.displayName}
                    disabled
                    className={`${inputClass} bg-slate-50`}
                  />
                ) : (
                  <select
                    id="product"
                    value={productId}
                    onChange={(e) => setProductId(e.target.value)}
                    className={inputClass}
                    required
                  >
                    <option value="">Select a product...</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.productId}>
                        {p.displayName}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="space-y-1">
                <label htmlFor="quantity" className="text-xs font-semibold uppercase tracking-wider text-slate-500">Quantity Received</label>
                <input
                  id="quantity"
                  type="number"
                  min="1"
                  step="1"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  placeholder="e.g., 50"
                  className={inputClass}
                  required
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="notes" className="text-xs font-semibold uppercase tracking-wider text-slate-500">Notes (Optional)</label>
                <textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Supplier name, delivery receipt #, etc."
                  rows={3}
                  className="flex min-h-[80px] w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm ring-offset-white placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
                />
              </div>
            </form>
          </div>

          <div className="app-dialog-footer">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isSubmitting}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              form="receive-stock-form"
              disabled={isSubmitting || !productId || !quantity || Number(quantity) <= 0}
              className="w-full sm:w-auto"
            >
              {isSubmitting ? "Receiving..." : "Receive Stock"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
