import { useEffect } from "react";
import { useRoute, useLocation } from "wouter";

/**
 * Phase 3 redirect — /actions/:id now redirects to /actions/:id/draft (Draft Workspace).
 * Kept as a route component so existing links and bookmarks still work.
 */
export default function ActionDetailPage() {
  const [, params] = useRoute("/actions/:id");
  const [, navigate] = useLocation();

  useEffect(() => {
    if (params?.id) {
      navigate(`/actions/${params.id}/draft`, { replace: true });
    }
  }, [params?.id, navigate]);

  return null;
}
