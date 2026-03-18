"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
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
      ? "flex h-10 w-10 items-center justify-center text-base sm:h-11 sm:w-11 sm:text-lg"
      : "px-3 py-2 text-[11px]"
  } ${
    active
      ? "bg-emerald-100/95 text-emerald-950 shadow-[0_10px_20px_rgba(74,222,128,0.18)]"
      : "text-emerald-50"
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
  const router = useRouter();
  const pathname = usePathname();

  const resolveHref = (href?: string) => {
    if (!href) return href;
    if (pathname === "/" || href.startsWith("/admin") || href.startsWith("/weekly")) return href;
    if (href.startsWith("/?")) {
      return `${pathname}${href.slice(1)}`;
    }
    return href;
  };

  const goTo = (href?: string, onClick?: () => void) => {
    if (onClick) {
      onClick();
      return;
    }
    const nextHref = resolveHref(href);
    if (nextHref) router.push(nextHref);
  };

  return (
    <div className="user-page-chrome page-fade-top w-full rounded-[30px] px-4 py-3.5">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-center">
        <div className="min-w-0 flex items-center gap-3">
          {user.pfpUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={user.pfpUrl}
              alt={user.username}
              className="h-12 w-12 rounded-full border border-emerald-100/40 object-cover shadow-[0_10px_24px_rgba(74,222,128,0.14)] sm:h-14 sm:w-14"
            />
          ) : (
            <div className="page-chip flex h-12 w-12 items-center justify-center rounded-full text-xl sm:h-14 sm:w-14 sm:text-2xl">
              🦋
            </div>
          )}
          <div className="min-w-0">
            <div className="truncate text-sm font-black text-white sm:text-[15px]">{user.displayName}</div>
            <div className="truncate text-xs text-lime-100/90">@{user.username}</div>
            <div className="truncate text-[11px] text-emerald-50/72">{shortWallet(user.address)}</div>
          </div>
        </div>

        <div className="flex justify-center sm:justify-center">
          {isAdmin ? (
            <Link href={adminHref} className="relative block h-14 w-14 rounded-[20px] sm:h-20 sm:w-20 sm:rounded-[22px]" title="Admin">
              <span className="absolute inset-0 rounded-[20px] sm:rounded-[22px] bg-[radial-gradient(circle,rgba(187,247,208,0.22)_0%,rgba(187,247,208,0.05)_45%,transparent_75%)]" />
              <Image
                src="/icon.png"
                alt="Whack-a-Butterfly"
                fill
                sizes="80px"
                className="object-contain drop-shadow-[0_0_18px_rgba(74,222,128,0.32)] transition-transform hover:scale-[1.04]"
                priority
              />
            </Link>
          ) : (
            <div className="relative h-14 w-14 sm:h-20 sm:w-20">
              <span className="absolute inset-0 rounded-[20px] sm:rounded-[22px] bg-[radial-gradient(circle,rgba(187,247,208,0.2)_0%,rgba(187,247,208,0.04)_45%,transparent_75%)]" />
              <Image
                src="/icon.png"
                alt="Whack-a-Butterfly"
                fill
                sizes="80px"
                className="object-contain drop-shadow-[0_0_18px_rgba(74,222,128,0.3)]"
                priority
              />
            </div>
          )}
        </div>

        <div className="col-span-2 justify-self-end flex min-w-0 flex-col items-end gap-2 sm:col-span-1">
          <div className="flex flex-wrap justify-end gap-2">
            <HeaderAction
              label="Rulebook"
              title="Rulebook"
              icon="📖"
              active={active === "rules"}
              href={resolveHref(rulesHref)}
              onClick={onRules ? () => goTo(undefined, onRules) : (rulesHref ? () => goTo(rulesHref) : undefined)}
            />
            <HeaderAction
              label="Leaderboard"
              title="Leaderboard"
              icon="🏆"
              active={active === "leaderboard"}
              href={resolveHref(leaderboardHref)}
              onClick={onLeaderboard ? () => goTo(undefined, onLeaderboard) : (leaderboardHref ? () => goTo(leaderboardHref) : undefined)}
            />
            {showBack && (
              backHref ? (
                <HeaderAction label="Back" title="Back" icon="↩" onClick={() => goTo(backHref)} />
              ) : (
                <HeaderAction label="Back" title="Back" icon="↩" onClick={onBack ? () => goTo(undefined, onBack) : undefined} />
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
