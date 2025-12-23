import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { passwordSchema } from "@/lib/validationSchemas";
import rvLogo from "@/assets/rv-logo.jpg";

const ResetPassword = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const [initializing, setInitializing] = useState(true);
  const [saving, setSaving] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  useEffect(() => {
    document.title = "Reset Password | RV Industries";

    const meta = document.querySelector('meta[name="description"]') as HTMLMetaElement | null;
    if (meta) {
      meta.content = "Reset your RV Industries account password securely.";
    }

    let canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      document.head.appendChild(canonical);
    }
    canonical.href = `${window.location.origin}/reset-password`;
  }, []);

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      try {
        const searchParams = new URLSearchParams(location.search);
        const code = searchParams.get("code");

        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        } else {
          const hash = location.hash.startsWith("#") ? location.hash.slice(1) : location.hash;
          const hashParams = new URLSearchParams(hash);
          const access_token = hashParams.get("access_token");
          const refresh_token = hashParams.get("refresh_token");

          if (access_token && refresh_token) {
            const { error } = await supabase.auth.setSession({ access_token, refresh_token });
            if (error) throw error;
          }
        }
      } catch (_error: any) {
        toast({
          variant: "destructive",
          title: "Reset link invalid",
          description: "Please request a new password reset email.",
        });
      } finally {
        if (!cancelled) setInitializing(false);
      }
    };

    init();
    return () => {
      cancelled = true;
    };
  }, [location.hash, location.search, toast]);

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      toast({
        variant: "destructive",
        title: "Passwords do not match",
        description: "Please re-enter the same password in both fields.",
      });
      return;
    }

    const passwordValidation = passwordSchema.safeParse(password);
    if (!passwordValidation.success) {
      toast({
        variant: "destructive",
        title: "Weak Password",
        description: passwordValidation.error.errors[0].message,
      });
      return;
    }

    setSaving(true);
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        toast({
          variant: "destructive",
          title: "Session missing",
          description: "Please open the reset link from your email again.",
        });
        return;
      }

      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      toast({
        title: "Password updated",
        description: "You can now sign in with your new password.",
      });

      navigate("/auth");
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Could not update password",
        description: error.message,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-secondary p-4">
      <section className="w-full max-w-md">
        <Card>
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <img
                src={rvLogo}
                alt="RV Industries logo for password reset"
                className="h-20 object-contain"
                loading="eager"
              />
            </div>
            <CardTitle>Reset password</CardTitle>
            <CardDescription>Set a new password for your account.</CardDescription>
          </CardHeader>
          <CardContent>
            {initializing ? (
              <div className="text-sm text-muted-foreground">Loading…</div>
            ) : (
              <form onSubmit={handleUpdatePassword} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="new-password">New password</Label>
                  <Input
                    id="new-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                    required
                    minLength={12}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirm-password">Confirm new password</Label>
                  <Input
                    id="confirm-password"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    autoComplete="new-password"
                    required
                    minLength={12}
                  />
                </div>

                <Button type="submit" className="w-full" disabled={saving}>
                  {saving ? "Saving…" : "Update password"}
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => navigate("/auth")}
                >
                  Back to login
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </section>
    </main>
  );
};

export default ResetPassword;
