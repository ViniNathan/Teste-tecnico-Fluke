"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const navItems = [
	{ href: "/events", label: "Eventos" },
	{ href: "/rules", label: "Regras" },
] as const;

export function ConsoleNav() {
	const pathname = usePathname();

	return (
		<nav
			className="flex gap-1 border-b border-border-subtle pb-4"
			aria-label="Console"
		>
			{navItems.map(({ href, label }) => {
				const isActive = pathname === href || pathname.startsWith(`${href}/`);
				return (
					<Link
						key={href}
						href={href}
						className={cn(
							"px-4 py-2 text-sm font-medium transition-colors",
							isActive
								? "border-b-2 border-foreground text-foreground"
								: "text-zinc-400 hover:text-zinc-200",
						)}
					>
						{label}
					</Link>
				);
			})}
		</nav>
	);
}
