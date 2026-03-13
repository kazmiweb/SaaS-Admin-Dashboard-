import { useEffect, useState } from "react";
import { api } from "../api";

export type ServiceItem = {
  id: string;
  name: string;
  description?: string | null;
  icon?: string | null;
  type?: string | null;
  status: boolean;
  defaultCost: number;
};

export function useServices(enabled: boolean) {
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [loading, setLoading] = useState(false);

  async function load() {
    if (!enabled) return;
    setLoading(true);
    try {
      const r = await api.get("/me/services");
      const items = r.data?.items ?? r.data?.services ?? r.data ?? [];
      setServices(Array.isArray(items) ? items : []);
    } catch {
      setServices([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  return { services, loading, reload: load };
}
