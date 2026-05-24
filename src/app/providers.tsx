"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";

// react-query cache + the toast surface, scoped to the workspace shell.
// the QueryClient is created once per browser session, never on the server.
export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <Toaster
        theme="dark"
        position="bottom-right"
        style={
          {
            "--normal-bg": "var(--lunari-surface-elevated)",
            "--normal-text": "var(--lunari-cream)",
            "--normal-border": "var(--lunari-surface-elevated)",
          } as React.CSSProperties
        }
      />
    </QueryClientProvider>
  );
}
