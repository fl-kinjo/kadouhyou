import { Suspense } from "react";
import LoginClient from "./login-client";

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#f7f7f7",
          }}
        >
          <div style={{ fontSize: 18 }}>読み込み中...</div>
        </main>
      }
    >
      <LoginClient />
    </Suspense>
  );
}