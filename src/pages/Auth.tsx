import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Globe, Shield, Wifi, BarChart3 } from "lucide-react";
import { z } from "zod";
import { getFullVersionString } from "@/lib/version";

const authSchema = z.object({
  email: z.string().email("Invalid email address").max(255, "Email must be less than 255 characters"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

const Auth = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) navigate("/dashboard");
    };
    checkUser();
  }, [navigate]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const validatedData = authSchema.parse({ email, password });
      const { error } = await supabase.auth.signInWithPassword({
        email: validatedData.email,
        password: validatedData.password,
      });
      if (error) throw error;
      toast.success("Signed in successfully!");
      navigate("/dashboard");
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        toast.error(error.errors[0].message);
      } else {
        toast.error("Invalid credentials. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left Panel — Branding */}
      <div className="hidden lg:flex flex-1 flex-col items-center justify-center relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-background via-card to-background" />
        <div className="absolute inset-0 opacity-20" style={{ background: "radial-gradient(circle at 30% 50%, hsl(193 100% 50% / 0.15), transparent 60%), radial-gradient(circle at 70% 80%, hsl(263 70% 50% / 0.1), transparent 50%)" }} />

        <div className="relative z-10 text-center space-y-6 px-12">
          <div className="h-16 w-16 rounded-2xl gradient-primary flex items-center justify-center mx-auto shadow-card">
            <Globe className="h-8 w-8 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-primary">NOSTEQ IP Monitor</h1>
            <p className="text-muted-foreground mt-2">Uptime & Blacklist Intelligence</p>
          </div>
          <div className="flex items-center gap-3 justify-center pt-4">
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-medium">
              <Shield className="h-3 w-3" /> Secure
            </span>
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-accent/10 text-accent text-xs font-medium">
              <Wifi className="h-3 w-3" /> Real-time
            </span>
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-success/10 text-success text-xs font-medium">
              <BarChart3 className="h-3 w-3" /> Analytics
            </span>
          </div>
        </div>
      </div>

      {/* Right Panel — Login */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="glass-strong rounded-2xl p-8 shadow-modal space-y-6">
            {/* Mobile logo */}
            <div className="lg:hidden flex justify-center mb-2">
              <div className="h-12 w-12 rounded-xl gradient-primary flex items-center justify-center">
                <Globe className="h-6 w-6 text-primary-foreground" />
              </div>
            </div>

            <div className="text-center">
              <h2 className="text-2xl font-bold text-foreground">Welcome Back</h2>
              <p className="text-sm text-muted-foreground mt-1">Sign in to access your dashboard</p>
            </div>

            <form onSubmit={handleAuth} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm text-muted-foreground">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="admin@nosteq.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-11 bg-input border-border/50 focus:border-primary rounded-xl"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm text-muted-foreground">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-11 bg-input border-border/50 focus:border-primary rounded-xl"
                  required
                />
              </div>
              <Button
                type="submit"
                className="w-full h-11 gradient-primary text-primary-foreground font-semibold rounded-xl hover:opacity-90 transition-opacity"
                disabled={loading}
              >
                {loading ? "Signing in..." : "Sign In →"}
              </Button>
            </form>

            <p className="text-center text-[11px] text-muted-foreground/60">{getFullVersionString()}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Auth;
