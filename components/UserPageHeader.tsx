"use client";

import Image from "next/image";
import Link from "next/link";
import type { FarcasterUser } from "@/hooks/useFarcaster";

function shortWallet(address?: string) {
  if (!address) return "wallet not connected";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

type ActionProps = {
  label: string;
  title: string;
  icon?: string;
  active?: boolean;
  href?: string;
  onClick?: () => void;
};

function HeaderAction({ label, title, icon, active, href, onClick }: ActionProps) {
  const iconOnly = Boolean(icon);
  const className = `rounded-full border font-black transition-colors ${
    iconOnly
      ? "flex h-10 w-10 items-center justify-center text-lg"
      : "px-3 py-1.5 text-[11px]"
  } ${
    active ? "bg-amber-300 text-amber-950 border-amber-200" : "bg-[rgba(20,10,0,0.54)] text-amber-100 border-amber-900/70"
  }`;
  const content = iconOnly ? <span aria-hidden="true">{icon}</span> : label;

  if (href) {
    return (
      <Link href={href} className={className} title={title}>
        {content}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} className={className} title={title}>
      {content}
    </button>
  );
}

export default function UserPageHeader({
  user,
  isAdmin,
  showBack = false,
  backHref,
  onBack,
  rulesHref,
  onRules,
  leaderboardHref,
  onLeaderboard,
  adminHref = "/admin",
  active,
}: {
  user: FarcasterUser;
  isAdmin: boolean;
  showBack?: boolean;
  backHref?: string;
  onBack?: () => void;
  rulesHref?: string;
  onRules?: () => void;
  leaderboardHref?: string;
  onLeaderboard?: () => void;
  adminHref?: string;
  active?: "home" | "rules" | "leaderboard" | "weekly" | "payout";
}) {
  return (
    <div className="user-page-chrome w-full rounded-[28px] px-4 py-3">
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
        <div className="min-w-0 flex items-center gap-3">
          {user.pfpUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={user.pfpUrl}
              alt={user.username}
              className="h-14 w-14 rounded-full border-2 border-amber-300 object-cover shadow-[0_0_18px_rgba(251,191,36,0.22)]"
            />
          ) : (
            <div className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-amber-300 bg-[rgba(20,10,0,0.68)] text-2xl">
              🦋
            </div>
          )}
          <div className="min-w-0">
            <div className="truncate text-sm font-black text-white">{user.displayName}</div>
            <div className="truncate text-xs text-amber-300">@{user.username}</div>
            <div className="truncate text-[11px] text-amber-100/85">{shortWallet(user.address)}</div>
          </div>
        </div>

        <div className="flex justify-center">
          {isAdmin ? (
            <Link href={adminHref} className="relative block h-16 w-16 sm:h-20 sm:w-20" title="Admin">
              <Image
                src="/icon.png"
                alt="Whack-a-Butterfly"
                fill
                sizes="80px"
                className="object-contain drop-shadow-[0_0_14px_rgba(251,191,36,0.28)] transition-transform hover:scale-105"
                priority
              />
            </Link>
          ) : (
            <div className="relative h-16 w-16 sm:h-20 sm:w-20">
              <Image
                src="/icon.png"
                alt="Whack-a-Butterfly"
                fill
                sizes="80px"
                className="object-contain drop-shadow-[0_0_14px_rgba(251,191,36,0.28)]"
                priority
              />
            </div>
          )}
        </div>

        <div className="justify-self-end flex min-w-0 flex-col items-end gap-2">
          <div className="flex flex-wrap justify-end gap-2">
            <HeaderAction
              label="Rulebook"
              title="Rulebook"
              icon="📖"
              active={active === "rules"}
              href={rulesHref}
              onClick={onRules}
            />
            <HeaderAction
              label="Leaderboard"
              title="Leaderboard"
              icon="🏆"
              active={active === "leaderboard"}
              href={leaderboardHref}
              onClick={onLeaderboard}
            />
            {showBack && (
              backHref ? (
                <HeaderAction label="Back" title="Back" icon="↩" href={backHref} />
              ) : (
                <HeaderAction label="Back" title="Back" icon="↩" onClick={onBack} />
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
