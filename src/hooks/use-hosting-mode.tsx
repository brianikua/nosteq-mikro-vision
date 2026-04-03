import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

interface HostingModeContextType {
  hostingMode: "local" | "vpn";
  setupComplete: boolean;
  loading: boolean;
  refreshConfig: () => Promise<void>;
  getConfig: (key: string) => string | undefined;
  configs: Record<string, string>;
}

const HostingModeContext = createContext<HostingModeContextType>({
  hostingMode: "local",
  setupComplete: false,
  loading: true,
  refreshConfig: async () => {},
  getConfig: () => undefined,
  configs: {},
});

export function HostingModeProvider({ children }: { children: ReactNode }) {
  const [configs, setConfigs] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const fetchConfigs = async () => {
    const { data } = await supabase.from("system_config").select("key, value");
    if (data) {
      const map: Record<string, string> = {};
      data.forEach((row: any) => { map[row.key] = row.value; });
      setConfigs(map);
    }
    setLoading(false);
  };

  useEffect(() => { fetchConfigs(); }, []);

  const hostingMode = (configs.hosting_mode === "vpn" ? "vpn" : "local") as "local" | "vpn";
  const setupComplete = configs.setup_complete === "true";

  return (
    <HostingModeContext.Provider value={{
      hostingMode,
      setupComplete,
      loading,
      refreshConfig: fetchConfigs,
      getConfig: (key) => configs[key],
      configs,
    }}>
      {children}
    </HostingModeContext.Provider>
  );
}

export const useHostingMode = () => useContext(HostingModeContext);
