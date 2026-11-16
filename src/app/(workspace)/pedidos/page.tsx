import { Suspense } from "react";
import { OrdersPage } from "@/features/orders/orders-page";
import { Loading } from "@/components/feedback";
export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <OrdersPage />
    </Suspense>
  );
}
