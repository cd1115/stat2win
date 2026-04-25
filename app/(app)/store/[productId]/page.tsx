import ProductPageClient from "./ProductPageClient";

export async function generateStaticParams() {
  return [{ productId: "placeholder" }];
}

export default function Page() {
  return <ProductPageClient />;
}