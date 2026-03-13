import { getFullVersionString, APP_VERSION } from "@/lib/version";

export const VersionFooter = () => (
  <footer className="border-t border-border/30 bg-card/20 py-3 text-center">
    <p className="text-xs text-muted-foreground">
      Nosteq IP Monitor — {getFullVersionString()} · {APP_VERSION.environment}
    </p>
  </footer>
);
