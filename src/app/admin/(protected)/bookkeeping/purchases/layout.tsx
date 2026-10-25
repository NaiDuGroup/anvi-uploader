import type { ReactNode } from "react";
import PurchasesSubNav from "./PurchasesSubNav";

export default function BookkeepingPurchasesLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <div className="mx-auto w-full max-w-[1600px] px-4 pt-5 sm:px-5">
        <PurchasesSubNav />
      </div>
      {children}
    </>
  );
}
