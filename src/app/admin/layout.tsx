import type { ReactNode } from "react";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <div id="app-shell" aria-hidden="true">
        <div style={{ background: "#fff", borderBottom: "1px solid #e5e7eb", padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", maxWidth: 1600, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div className="skel-bar" style={{ width: 40, height: 40, borderRadius: "50%" }} />
            <div>
              <div className="skel-bar" style={{ width: 180, height: 18, marginBottom: 6 }} />
              <div className="skel-bar" style={{ width: 120, height: 12 }} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <div className="skel-bar" style={{ width: 60, height: 36 }} />
            <div className="skel-bar" style={{ width: 120, height: 36 }} />
            <div className="skel-bar" style={{ width: 90, height: 36 }} />
          </div>
        </div>
        <div style={{ maxWidth: 1600, margin: "0 auto", padding: "24px 16px" }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            <div className="skel-bar" style={{ width: 240, height: 40 }} />
            <div className="skel-bar" style={{ width: 140, height: 40 }} />
            <div className="skel-bar" style={{ width: 170, height: 40 }} />
          </div>
          <div style={{ background: "#fff", borderRadius: 8, boxShadow: "0 1px 3px rgba(0,0,0,.1)", overflow: "hidden" }}>
            <div style={{ height: 40, background: "#f9fafb", borderBottom: "1px solid #f3f4f6" }} />
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 16, padding: "20px 16px", borderBottom: "1px solid #f9fafb" }}>
                <div className="skel-bar" style={{ width: 60, height: 16 }} />
                <div className="skel-bar" style={{ width: 90, height: 16 }} />
                <div style={{ flex: 1 }}>
                  <div className="skel-bar" style={{ width: "70%", height: 12, marginBottom: 6 }} />
                  <div className="skel-bar" style={{ width: "45%", height: 12 }} />
                </div>
                <div className="skel-bar" style={{ width: 100, height: 24, borderRadius: 12 }} />
                <div className="skel-bar" style={{ width: 70, height: 16 }} />
              </div>
            ))}
          </div>
        </div>
      </div>
      {children}
    </>
  );
}
