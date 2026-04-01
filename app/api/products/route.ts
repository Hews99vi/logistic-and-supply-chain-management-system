import { ProductService } from "@/services/products/product.service";

export async function GET(request: Request) {
  return ProductService.listProducts(request);
}

export async function POST(request: Request) {
  return ProductService.createProduct(request);
}
