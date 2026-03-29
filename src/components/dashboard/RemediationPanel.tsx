import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Loader2, ClipboardList, ExternalLink, CheckCircle, Send } from "lucide-react";
import { toast } from "sonner";
import { getRemediationSteps, getSeverity, severityConfig } from "./blacklist-utils";

interface BlacklistHistoryItem {
  id: string;
  device_id: string;
  provider: string;
  reason: string | null;
  listed_at: string;
  delisted_at: string | null;
  confidence: number | null;
  ip_address: string;
}

interface RemediationTask {
  id: string;
  blacklist_history_id: string | null;
  provider: string;
  step_label: string;
  completed: boolean;
}

interface Props {
  deviceId: string;
  ipAddress: string;
  providerInsights: Record<string, { reason: string; firewall: string; category: string; delist_url: string }>;
}

export const RemediationPanel = ({ deviceId, ipAddress, providerInsights }: Props) => {
  const [history, setHistory] = useState<BlacklistHistoryItem[]>([]);
  const [tasks, setTasks] = useState<RemediationTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [delistQueue, setDelistQueue] = useState<Set<string>>(new Set());

  const loadData = async () => {
    const [histRes, taskRes] = await Promise.all([
      supabase
        .from("blacklist_history")
        .select("*")
        .eq("device_id", deviceId)
        .order("listed_at", { ascending: false })
        .limit(50),
      supabase
        .from("remediation_tasks")
        .select("*")
        .eq("device_id", deviceId)
        .limit(500),
    ]);
    if (histRes.data) setHistory(histRes.data as BlacklistHistoryItem[]);
    if (taskRes.data) setTasks(taskRes.data as RemediationTask[]);
    setLoading(false);
  };

  useEffect(() => { loadData(); }, [deviceId]);

  const ensureRemediationTasks = async (historyId: string, provider: string, category: string) => {
    const existing = tasks.filter(t => t.blacklist_history_id === historyId);
    if (existing.length > 0) return existing;

    const steps = getRemediationSteps(category);
    const newTasks = steps.map(step => ({
      device_id: deviceId,
      blacklist_history_id: historyId,
      provider,
      step_label: step,
      completed: false,
    }));

    const { data, error } = await supabase
      .from("remediation_tasks")
      .insert(newTasks)
      .select("*");

    if (error) { toast.error("Failed to create remediation tasks"); return []; }
    const inserted = (data || []) as RemediationTask[];
    setTasks(prev => [...prev, ...inserted]);
    return inserted;
  };

  const toggleTask = async (taskId: string, completed: boolean) => {
    const { error } = await supabase
      .from("remediation_tasks")
      .update({
        completed,
        completed_at: completed ? new Date().toISOString() : null,
      })
      .eq("id", taskId);

    if (error) { toast.error("Failed to update"); return; }
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, completed } : t));
  };

  const toggleDelistQueue = (provider: string) => {
    setDelistQueue(prev => {
      const next = new Set(prev);
      if (next.has(provider)) next.delete(provider);
      else next.add(provider);
      return next;
    });
  };

  const shareDelistQueueToTelegram = async () => {
    if (delistQueue.size === 0) { toast.error("No items in delisting queue"); return; }
    const items = Array.from(delistQueue).map((provider, i) => {
      const insight = providerInsights[provider] || { delist_url: "" };
      return `${i + 1}\\. *${provider}* → [Delist](${insight.delist_url || "N/A"})`;
    }).join("\n");

    const message = `📋 *DELISTING QUEUE — ${ipAddress}*\n\n${items}\n\n_Total: ${delistQueue.size} providers_`;

    try {
      const { data, error } = await supabase.functions.invoke("send-telegram", {
        body: { message, route_to_channels: true, event_type: "blacklisted", ip_address: ipAddress },
      });
      if (error) throw error;
      toast.success("Delisting queue shared to Telegram!");
    } catch { toast.error("Failed to share to Telegram"); }
  };

  if (loading) {
    return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  const activeListings = history.filter(h => !h.delisted_at);
  const resolvedListings = history.filter(h => h.delisted_at);

  return (
    <div className="space-y-4">
      {/* Bulk Delisting Queue */}
      {delistQueue.size > 0 && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="py-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <ClipboardList className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">{delistQueue.size} provider(s) in delisting queue</span>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setDelistQueue(new Set())}>Clear</Button>
                <Button size="sm" onClick={shareDelistQueueToTelegram}>
                  <Send className="h-3.5 w-3.5 mr-1" /> Share to Telegram
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Active Listings with Remediation */}
      {activeListings.length > 0 ? (
        <Card className="border-border/50">
          <CardHeader>
            <CardTitle className="text-base">Active Listings ({activeListings.length})</CardTitle>
            <CardDescription>Current blacklist listings with remediation checklists</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {activeListings.map(item => {
              const insight = providerInsights[item.provider] || { reason: "", firewall: "", category: "unknown", delist_url: "" };
              const severity = getSeverity(insight.category);
              const config = severityConfig[severity];
              const itemTasks = tasks.filter(t => t.blacklist_history_id === item.id);
              const completedCount = itemTasks.filter(t => t.completed).length;
              const progress = itemTasks.length > 0 ? (completedCount / itemTasks.length) * 100 : 0;

              return (
                <div key={item.id} className="border border-border/50 rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <Badge variant={config.badgeVariant} className="text-xs">{config.label}</Badge>
                      <span className="font-medium text-sm">{item.provider}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                        <Checkbox
                          checked={delistQueue.has(item.provider)}
                          onCheckedChange={() => toggleDelistQueue(item.provider)}
                        />
                        Add to queue
                      </label>
                      {insight.delist_url && (
                        <a href={insight.delist_url} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                          <ExternalLink className="h-3 w-3" /> Delist
                        </a>
                      )}
                    </div>
                  </div>

                  <p className="text-xs text-muted-foreground">{insight.reason || item.reason}</p>

                  {/* Remediation Checklist */}
                  {itemTasks.length > 0 ? (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium">{completedCount}/{itemTasks.length} steps completed</span>
                        <Progress value={progress} className="w-32 h-1.5" />
                      </div>
                      <div className="space-y-1">
                        {itemTasks.map(task => (
                          <label key={task.id} className="flex items-center gap-2 text-xs cursor-pointer py-0.5">
                            <Checkbox
                              checked={task.completed}
                              onCheckedChange={(checked) => toggleTask(task.id, !!checked)}
                            />
                            <span className={task.completed ? "line-through text-muted-foreground" : ""}>{task.step_label}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <Button variant="outline" size="sm" className="text-xs"
                      onClick={() => ensureRemediationTasks(item.id, item.provider, insight.category)}>
                      <ClipboardList className="h-3 w-3 mr-1" /> Load Remediation Checklist
                    </Button>
                  )}

                  <p className="text-[10px] text-muted-foreground">
                    Listed: {new Date(item.listed_at).toLocaleString()}
                  </p>
                </div>
              );
            })}
          </CardContent>
        </Card>
      ) : (
        <Card className="border-border/50">
          <CardContent className="py-8 text-center text-muted-foreground">
            <CheckCircle className="h-10 w-10 mx-auto mb-2 text-[hsl(var(--success))]" />
            <p className="font-medium">No active blacklist listings</p>
            <p className="text-sm">This IP is currently clean across all providers.</p>
          </CardContent>
        </Card>
      )}

      {/* Resolved History */}
      {resolvedListings.length > 0 && (
        <Card className="border-border/50">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-[hsl(var(--success))]" /> Resolved ({resolvedListings.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {resolvedListings.slice(0, 10).map(item => {
              const duration = item.delisted_at
                ? Math.round((new Date(item.delisted_at).getTime() - new Date(item.listed_at).getTime()) / (1000 * 60 * 60 * 24))
                : 0;
              return (
                <div key={item.id} className="flex items-center justify-between py-2 px-3 rounded bg-muted/30 text-sm">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-3.5 w-3.5 text-[hsl(var(--success))]" />
                    <span>{item.provider}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{duration}d listed</span>
                    <span>{new Date(item.listed_at).toLocaleDateString()} → {item.delisted_at ? new Date(item.delisted_at).toLocaleDateString() : ""}</span>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
};
