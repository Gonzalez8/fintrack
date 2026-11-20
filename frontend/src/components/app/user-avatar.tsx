"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

interface AvatarUser {
  username: string;
  avatar_version?: number | null;
}

// The version changes with every upload, so the browser can cache each photo for good.
export function avatarUrl(version: number) {
  return `/api/proxy/auth/avatar?v=${version}`;
}

// Profile photo, or the username's initial when there is none (or it fails to load).
export function UserAvatar({ user, className }: { user: AvatarUser; className?: string }) {
  const version = user.avatar_version;
  const [failedVersion, setFailedVersion] = useState<number | null>(null);

  if (version && failedVersion !== version) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- tiny private image served by the BFF
      <img
        src={avatarUrl(version)}
        alt=""
        onError={() => setFailedVersion(version)}
        className={cn("shrink-0 rounded-full object-cover", className)}
      />
    );
  }
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-primary/15 font-semibold text-primary",
        className,
      )}
    >
      {(user.username || "?").charAt(0).toUpperCase()}
    </span>
  );
}
