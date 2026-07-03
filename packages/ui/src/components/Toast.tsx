import { createContext, type ReactNode, useCallback, useContext, useState } from "react";

type ToastKind = "error" | "success" | "info";

interface ToastItem {
  id: number;
  message: string;
  kind: ToastKind;
}

interface ToastApi {
  show: (message: string, kind?: ToastKind) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

let nextId = 1;

const TOAST_CLASS: Record<ToastKind, string> = {
  error: "rounded-md border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-800 shadow",
  success: "rounded-md border border-green-300 bg-green-50 px-4 py-2 text-sm text-green-800 shadow",
  info: "rounded-md border border-slate-300 bg-white px-4 py-2 text-sm text-slate-800 shadow",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const show = useCallback((message: string, kind: ToastKind = "info") => {
    const id = nextId++;
    setItems((prev) => [...prev, { id, message, kind }]);
    const ttl = kind === "error" ? 6000 : 3500;
    window.setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), ttl);
  }, []);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2">
        {items.map((t) => (
          <div key={t.id} className={TOAST_CLASS[t.kind]} role="status">
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (ctx === null) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
