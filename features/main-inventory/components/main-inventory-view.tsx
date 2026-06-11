"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { DashboardSidebar } from "@/features/dashboard/components/dashboard-sidebar";
import { ReceiveStockModal } from "./receive-stock-modal";
import { Button } from "@/components/ui/button";
import { PackagePlus, Search } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { redirectToLoginOnUnauthorized } from "@/features/auth/api/session-cache";

interface InventoryItem {
  id: string;
  productId: string;
  productCode: string;
  productName: string;
  displayName: string;
  quantity: number;
  updatedAt: string | null;
}

type MainInventoryResponse = {
  items: InventoryItem[];
  page: number;
  pageSize: number;
  total: number;
};

type ApiEnvelope<T> = {
  data: T;
};

export function MainInventoryView() {
  const [search, setSearch] = useState("");
  const [isReceiveModalOpen, setIsReceiveModalOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<InventoryItem | null>(null);

  const [items, setItems] = useState<InventoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchInventory = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.append("search", search);
      const res = await fetch(`/api/main-inventory?${params.toString()}`);
      redirectToLoginOnUnauthorized(res);
      if (!res.ok) throw new Error("Failed to fetch inventory");
      const envelope = await res.json() as ApiEnvelope<MainInventoryResponse>;
      setItems(envelope.data.items ?? []);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const delay = setTimeout(() => fetchInventory(), 300);
    return () => clearTimeout(delay);
  }, [search]);

  const handleReceiveStock = async (data: { productId: string; quantity: number; notes: string }) => {
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/main-inventory/receive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      });
      redirectToLoginOnUnauthorized(res);
      if (!res.ok) throw new Error("Failed to receive stock");
      
      alert("Stock received successfully!");
      setIsReceiveModalOpen(false);
      setSelectedProduct(null);
      fetchInventory();
    } catch (err) {
      alert("Failed to receive stock. Please try again.");
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AppShell sidebar={<DashboardSidebar activeKey="main-inventory" />}>
      <div className="mx-auto max-w-5xl space-y-6 py-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Main Inventory</h1>
            <p className="mt-1 text-sm text-slate-500">
              Track and manage central freezer stock.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search products..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="flex h-10 w-full rounded-md border border-slate-200 bg-white pl-9 pr-3 py-2 text-sm ring-offset-white placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
              />
            </div>
            <Button onClick={() => setIsReceiveModalOpen(true)} className="gap-2">
              <PackagePlus className="h-4 w-4" />
              Receive Stock
            </Button>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-6 py-4 font-semibold">Product</th>
                  <th className="px-6 py-4 font-semibold text-right">Available Qty</th>
                  <th className="px-6 py-4 font-semibold">Last Updated</th>
                  <th className="px-6 py-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      <td className="px-6 py-4"><Skeleton className="h-5 w-48" /></td>
                      <td className="px-6 py-4"><Skeleton className="ml-auto h-5 w-16" /></td>
                      <td className="px-6 py-4"><Skeleton className="h-5 w-32" /></td>
                      <td className="px-6 py-4"><Skeleton className="ml-auto h-8 w-24" /></td>
                    </tr>
                  ))
                ) : items.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-12 text-center text-slate-500">
                      No products found matching your search.
                    </td>
                  </tr>
                ) : (
                  items.map((item) => (
                    <tr key={item.id} className="transition-colors hover:bg-slate-50/50">
                      <td className="px-6 py-4">
                        <div className="font-medium text-slate-900">{item.displayName}</div>
                        <div className="text-xs text-slate-500">{item.productCode}</div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className={`inline-flex items-center justify-center rounded-full px-2.5 py-1 text-xs font-semibold ${item.quantity < 0 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                          {item.quantity}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-slate-500 text-sm">
                        {item.updatedAt ? new Date(item.updatedAt).toLocaleString() : 'Never'}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 gap-1"
                          onClick={() => {
                            setSelectedProduct(item);
                            setIsReceiveModalOpen(true);
                          }}
                        >
                          <PackagePlus className="h-3.5 w-3.5" />
                          Receive
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <ReceiveStockModal
        isOpen={isReceiveModalOpen}
        onClose={() => {
          setIsReceiveModalOpen(false);
          setSelectedProduct(null);
        }}
        initialProduct={selectedProduct}
        onSubmit={handleReceiveStock}
        isSubmitting={isSubmitting}
      />
    </AppShell>
  );
}
