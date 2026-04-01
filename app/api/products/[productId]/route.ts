import { ProductService } from "@/services/products/product.service";

type RouteContext = {
  params: Promise<{
    productId: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { productId } = await context.params;
  return ProductService.getProductById(productId);
}

export async function PATCH(request: Request, context: RouteContext) {
  const { productId } = await context.params;
  return ProductService.updateProduct(productId, request);
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { productId } = await context.params;
  return ProductService.deactivateProduct(productId);
}
