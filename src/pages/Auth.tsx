import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import rvLogo from "@/assets/rv-logo.jpg";

const Auth = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);

  useEffect(() => {
    document.title = "Login | RV Industries";

    const meta = document.querySelector('meta[name="description"]') as HTMLMetaElement | null;
    if (meta) {
      meta.content =
        "Login to RV Industries Manufacturing Plant Traceability System.";
    }

    let canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      document.head.appendChild(canonical);
    }
    canonical.href = `${window.location.origin}/auth`;
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: loginEmail,
        password: loginPassword,
      });

      if (error) throw error;

      // Update last login time
      if (data.user) {
        await supabase
          .from("profiles")
          .update({ last_login: new Date().toISOString() })
          .eq("id", data.user.id);
      }

      toast({
        title: "Login successful",
        description: "Welcome back to RV Industries!",
      });

      navigate("/");
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Login failed",
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleOpenForgotPassword = () => {
    setForgotEmail(loginEmail);
    setForgotOpen(true);
  };

  const handleSendPasswordResetEmail = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!forgotEmail) {
      toast({
        variant: "destructive",
        title: "Email required",
        description: "Please enter your email address.",
      });
      return;
    }

    setForgotLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;

      toast({
        title: "Password reset email sent",
        description: "Check your inbox for the reset link.",
      });
      setForgotOpen(false);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Could not send reset email",
        description: error.message,
      });
    } finally {
      setForgotLoading(false);
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
                alt="RV Industries logo for manufacturing traceability system"
                className="h-24 object-contain"
                loading="eager"
              />
            </div>
            <CardDescription>Manufacturing Plant Traceability System</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="login-email">Email</Label>
                <Input
                  id="login-email"
                  type="email"
                  placeholder="you@rvindustries.com"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="login-password">Password</Label>
                <Input
                  id="login-password"
                  type="password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Signing in..." : "Sign In"}
              </Button>
              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="link"
                  className="px-0"
                  onClick={handleOpenForgotPassword}
                  disabled={loading}
                >
                  Forgot password?
                </Button>
              </div>
            </form>

            <Dialog open={forgotOpen} onOpenChange={setForgotOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Reset your password</DialogTitle>
                  <DialogDescription>
                    We'll email you a secure link to set a new password.
                  </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSendPasswordResetEmail} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="forgot-email">Email</Label>
                    <Input
                      id="forgot-email"
                      type="email"
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      placeholder="you@rvindustries.com"
                      autoComplete="email"
                      required
                    />
                  </div>

                  <DialogFooter>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setForgotOpen(false)}
                      disabled={forgotLoading}
                    >
                      Cancel
                    </Button>
                    <Button type="submit" disabled={forgotLoading}>
                      {forgotLoading ? "Sending..." : "Send reset link"}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>
      </section>
    </main>
  );
};

export default Auth;
