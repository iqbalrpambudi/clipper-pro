import React, { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Copy, KeyRound, Link2, Loader2, LogOut, Youtube } from "lucide-react";
import { api } from "@/lib/api";
import { useStudioStore } from "@/lib/store";
import { Badge, Button, Input } from "@/components/ui";
import { YOUTUBE_ACCOUNT_KEY, useYouTubeAccount } from "@/features/publish/useYouTubeAccount";

export function YouTubeSettingsTab() {
  const queryClient = useQueryClient();
  const { showToast } = useStudioStore();
  const { data: account, connect, isConnecting } = useYouTubeAccount();

  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");

  useEffect(() => {
    if (account?.client_id) setClientId(account.client_id);
  }, [account?.client_id]);

  const saveMutation = useMutation({
    mutationFn: api.saveYouTubeCredentials,
    onSuccess: (data) => {
      queryClient.setQueryData(YOUTUBE_ACCOUNT_KEY, data);
      setClientSecret("");
      showToast("Kredensial YouTube disimpan terenkripsi", "success");
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const disconnectMutation = useMutation({
    mutationFn: api.disconnectYouTube,
    onSuccess: (data) => {
      queryClient.setQueryData(YOUTUBE_ACCOUNT_KEY, data);
      showToast("Channel YouTube diputus", "info");
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    saveMutation.mutate({
      client_id: clientId.trim(),
      client_secret: clientSecret.trim() || undefined,
    });
  };

  const copyRedirect = async () => {
    if (!account) return;
    try {
      await navigator.clipboard.writeText(account.redirect_uri);
      showToast("Redirect URI disalin", "success");
    } catch {
      showToast("Gagal menyalin, salin manual dari kolom", "error");
    }
  };

  return (
    <div className="space-y-4">
      {/* Section 1: OAuth client */}
      <form
        onSubmit={handleSave}
        className="rounded-xl border border-border bg-card p-5 space-y-4 shadow-xs"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-brand-400" />
            <h3 className="text-sm font-bold text-foreground">1. OAuth Client Google</h3>
          </div>
          <Badge variant="workspace-accent" className="px-2 py-0.5 font-mono text-xs">
            YouTube Data API v3
          </Badge>
        </div>

        <ol className="list-decimal pl-5 space-y-1 text-xs text-muted-foreground">
          <li>
            Buka{" "}
            <a
              href="https://console.cloud.google.com/apis/credentials"
              target="_blank"
              rel="noreferrer"
              className="text-primary underline"
            >
              Google Cloud Console → Credentials
            </a>{" "}
            pada project yang mengaktifkan YouTube Data API v3.
          </li>
          <li>Buat atau buka OAuth client ID bertipe <b>Web application</b>.</li>
          <li>Tambahkan Redirect URI di bawah ke daftar <b>Authorized redirect URIs</b>.</li>
          <li>Salin Client ID & Client Secret ke form ini, simpan, lalu klik Hubungkan.</li>
        </ol>

        <div>
          <label className="block text-xs font-semibold text-muted-foreground mb-1">
            Redirect URI (daftarkan di Google)
          </label>
          <div className="flex gap-2">
            <Input readOnly value={account?.redirect_uri ?? ""} className="font-mono" />
            <Button
              type="button"
              variant="workspace-secondary"
              size="workspace-sm"
              onClick={copyRedirect}
              aria-label="Salin redirect URI"
            >
              <Copy className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="yt-client-id" className="block text-xs font-semibold text-muted-foreground mb-1">
              Client ID
            </label>
            <Input
              id="yt-client-id"
              required
              autoComplete="off"
              placeholder="xxxx.apps.googleusercontent.com"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="font-mono"
            />
          </div>
          <div>
            <label htmlFor="yt-client-secret" className="block text-xs font-semibold text-muted-foreground mb-1">
              Client Secret
            </label>
            <Input
              id="yt-client-secret"
              type="password"
              autoComplete="off"
              required={!account?.client_secret_masked}
              placeholder={
                account?.client_secret_masked
                  ? `Tersimpan (${account.client_secret_masked}), kosongkan jika tidak diganti`
                  : "GOCSPX-..."
              }
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
              className="font-mono"
            />
          </div>
        </div>

        <div className="flex justify-end">
          <Button type="submit" variant="workspace-primary" size="workspace-sm" disabled={saveMutation.isPending}>
            {saveMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Simpan Kredensial
          </Button>
        </div>
      </form>

      {/* Section 2: channel connection */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4 shadow-xs">
        <div className="flex items-center gap-2">
          <Youtube className="w-4 h-4 text-brand-400" />
          <h3 className="text-sm font-bold text-foreground">2. Channel YouTube</h3>
        </div>

        {account?.connected ? (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              {account.channel_thumbnail && (
                <img
                  src={account.channel_thumbnail}
                  alt=""
                  className="h-10 w-10 rounded-full border border-border"
                />
              )}
              <div>
                <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" aria-hidden="true" />
                  {account.channel_title}
                </p>
                <p className="text-xs text-muted-foreground font-mono">{account.channel_id}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="workspace-secondary"
                size="workspace-sm"
                onClick={connect}
                disabled={isConnecting}
              >
                Ganti Channel
              </Button>
              <Button
                type="button"
                variant="workspace-destructive"
                size="workspace-sm"
                onClick={() => disconnectMutation.mutate()}
                disabled={disconnectMutation.isPending}
              >
                <LogOut className="w-3.5 h-3.5" />
                Putuskan
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              {account?.configured
                ? "Login dengan akun Google pemilik channel, lalu izinkan akses upload."
                : "Simpan Client ID & Client Secret dulu sebelum menghubungkan channel."}
            </p>
            <Button
              type="button"
              variant="workspace-primary"
              size="workspace-sm"
              onClick={connect}
              disabled={!account?.configured || isConnecting}
            >
              {isConnecting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Link2 className="w-3.5 h-3.5" />
              )}
              Hubungkan Channel
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
