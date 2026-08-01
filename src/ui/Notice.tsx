import type { ReactNode } from "react";
import { Icon, type IconKind } from "./Icon";

export type NoticeTone = "info" | "warning" | "danger" | "success";

const toneIcons: Record<NoticeTone, IconKind> = {
	danger: "warning",
	info: "info",
	success: "success",
	warning: "warning",
};

type NoticeProps = Readonly<{
	tone?: NoticeTone | undefined;
	title?: ReactNode | undefined;
	/**
	 * Announce the notice when it appears after a user action. Use "status" for
	 * progress and success, "alert" for errors that need immediate attention.
	 * Omit for static page copy.
	 */
	live?: "status" | "alert" | undefined;
	actions?: ReactNode | undefined;
	children: ReactNode;
}>;

/**
 * A bounded message surface for loading, empty, partial, denied, unavailable,
 * and error states.
 *
 * Pass plain text. Never pass server-supplied HTML: message bodies are rendered
 * as text so an API error string can never become markup.
 */
export function Notice({ tone = "info", title, live, actions, children }: NoticeProps) {
	return (
		<div
			className={`notice notice--${tone}`}
			role={live === "alert" ? "alert" : live === "status" ? "status" : undefined}
		>
			<Icon kind={toneIcons[tone]} />
			<div className="notice__body">
				{title !== undefined && <p className="notice__title">{title}</p>}
				<div>{children}</div>
				{actions !== undefined && <div className="notice__actions">{actions}</div>}
			</div>
		</div>
	);
}
