import type { ReactNode } from "react";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <div id="app-shell" aria-hidden="true">
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f9fafb" }}>
          <div className="app-spinner" />
        </div>
      </div>
      {children}
    </>
  );
}
