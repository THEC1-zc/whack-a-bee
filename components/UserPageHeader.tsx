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
  const className = `page-chip font-black transition-all duration-200 hover:translate-y-[-1px] ${
    iconOnly
      ? "flex h-11 w-11 items-center justify-center text-lg"
      : "px-3 py-2 text-[11px]"
  } ${
    active
      ? "bg-amber-200/95 text-amber-950 shadow-[0_10px_20px_rgba(247,189,43,0.18)]"
      : "text-amber-50"
  }`;
  const content = iconOnly ? <span aria-hidden="true">{icon}</span> : label;

  // Prefer the local click handler when both are provided so App screen-state
  // navigation works from the home shell without forcing a route transition.
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={className} title={title}>
        {content}
      </button>
    );
  }

  if (href) {
    return (
      <Link href={href} className={className} title={title}>
        {content}
      </Link>
    );
  }

  return null;
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
    <div className="user-page-chrome page-fade-top w-full rounded-[30px] px-4 py-3.5">
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
        <div className="min-w-0 flex items-center gap-3">
          {user.pfpUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={user.pfpUrl}
              alt={user.username}
              className="h-14 w-14 rounded-full border border-amber-200/45 object-cover shadow-[0_10px_24px_rgba(247,189,43,0.16)]"
            />
          ) : (
            <div className="page-chip flex h-14 w-14 items-center justify-center rounded-full text-2xl">
              🦋
            </div>
          )}
          <div className="min-w-0">
            <div className="truncate text-sm font-black text-white">{user.displayName}</div>
            <div className="truncate text-xs text-amber-200">@{user.username}</div>
            <div className="truncate text-[11px] text-amber-50/72">{shortWallet(user.address)}</div>
          </div>
        </div>

        <div className="flex justify-center">
          {isAdmin ? (
            <Link href={adminHref} className="relative block h-16 w-16 rounded-[22px] sm:h-20 sm:w-20" title="Admin">
              <span className="absolute inset-0 rounded-[22px] bg-[radial-gradient(circle,rgba(255,228,156,0.2)_0%,rgba(255,228,156,0.05)_45%,transparent_75%)]" />
              <Image
                src="/icon.png"
                alt="Whack-a-Butterfly"
                fill
                sizes="80px"
                className="object-contain drop-shadow-[0_0_18px_rgba(247,189,43,0.32)] transition-transform hover:scale-[1.04]"
                priority
              />
            </Link>
          ) : (
            <div className="relative h-16 w-16 sm:h-20 sm:w-20">
              <span className="absolute inset-0 rounded-[22px] bg-[radial-gradient(circle,rgba(255,228,156,0.16)_0%,rgba(255,228,156,0.04)_45%,transparent_75%)]" />
              <Image
                src="/icon.png"
                alt="Whack-a-Butterfly"
                fill
                sizes="80px"
                className="object-contain drop-shadow-[0_0_18px_rgba(247,189,43,0.3)]"
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
