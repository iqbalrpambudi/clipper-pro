import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useStudioStore } from "@/lib/store";

export const YOUTUBE_ACCOUNT_KEY = ["youtube-account"];

export function useYouTubeAccount() {
  const queryClient = useQueryClient();
  const { showToast } = useStudioStore();
  const [isConnecting, setIsConnecting] = useState(false);

  const query = useQuery({ queryKey: YOUTUBE_ACCOUNT_KEY, queryFn: api.getYouTubeAccount });

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.data !== "youtube-oauth-done") return;
      setIsConnecting(false);
      queryClient.invalidateQueries({ queryKey: YOUTUBE_ACCOUNT_KEY });
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [queryClient]);

  const connect = async () => {
    // Open synchronously inside the click so popup blockers allow it; navigate once the URL is ready
    const popup = window.open("", "youtube-oauth", "width=520,height=680");
    setIsConnecting(true);
    try {
      const { auth_url } = await api.startYouTubeOAuth();
      if (popup) {
        popup.location.href = auth_url;
        const timer = window.setInterval(() => {
          if (popup.closed) {
            window.clearInterval(timer);
            setIsConnecting(false);
            queryClient.invalidateQueries({ queryKey: YOUTUBE_ACCOUNT_KEY });
          }
        }, 800);
      } else {
        // Desktop app: the shell opens this in the system browser; refresh once the user comes back
        window.addEventListener(
          "focus",
          () => {
            setIsConnecting(false);
            queryClient.invalidateQueries({ queryKey: YOUTUBE_ACCOUNT_KEY });
          },
          { once: true }
        );
        window.location.href = auth_url;
      }
    } catch (e: unknown) {
      popup?.close();
      setIsConnecting(false);
      showToast(e instanceof Error ? e.message : "Gagal memulai login Google", "error");
    }
  };

  return { ...query, connect, isConnecting };
}
