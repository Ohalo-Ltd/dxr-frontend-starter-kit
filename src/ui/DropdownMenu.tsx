import { type ReactNode, useEffect, useId, useRef } from "react";
import { Button } from "./Button";
import type { IconKind } from "./Icon";

type DropdownMenuProps = Readonly<{
	/** Visible trigger text. Also the menu's accessible name. */
	label: string;
	isOpen: boolean;
	onOpenChange: (isOpen: boolean) => void;
	icon?: IconKind | undefined;
	/** Number of active selections, shown as a badge on the trigger. */
	count?: number | undefined;
	/** Align the menu to the end of the trigger instead of the start. */
	alignEnd?: boolean | undefined;
	menuClassName?: string | undefined;
	children: ReactNode;
}>;

/**
 * A controlled disclosure: a trigger button plus a menu surface.
 *
 * Open state lives with the caller so a menu can never disagree with the
 * workflow state behind it. Closing on outside click and on Escape (returning
 * focus to the trigger) is handled here so every menu in the application
 * behaves identically.
 *
 * This is a disclosure, not an ARIA menu widget: the content is arbitrary form
 * controls that keep native Tab order, which is the right pattern for a filter
 * surface. Do not add `role="menu"` unless the content becomes a true list of
 * single-action commands.
 */
export function DropdownMenu({
	label,
	isOpen,
	onOpenChange,
	icon,
	count,
	alignEnd = false,
	menuClassName,
	children,
}: DropdownMenuProps) {
	const rootRef = useRef<HTMLDivElement>(null);
	const triggerRef = useRef<HTMLButtonElement>(null);
	const menuId = useId();

	useEffect(() => {
		if (!isOpen) return;

		const onDocumentPointerDown = (event: MouseEvent) => {
			if (event.target instanceof Node && !rootRef.current?.contains(event.target)) {
				onOpenChange(false);
			}
		};
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key !== "Escape") return;
			event.preventDefault();
			onOpenChange(false);
			triggerRef.current?.focus();
		};

		document.addEventListener("pointerdown", onDocumentPointerDown, true);
		document.addEventListener("keydown", onKeyDown, true);
		return () => {
			document.removeEventListener("pointerdown", onDocumentPointerDown, true);
			document.removeEventListener("keydown", onKeyDown, true);
		};
	}, [isOpen, onOpenChange]);

	// Close when focus leaves the menu entirely, so Tab does not strand an open
	// surface behind the user.
	function onBlurCapture(event: React.FocusEvent<HTMLDivElement>) {
		if (!isOpen) return;
		const next = event.relatedTarget;
		if (next instanceof Node && rootRef.current?.contains(next)) return;
		if (next === null) return;
		onOpenChange(false);
	}

	return (
		<div className="dropdown" ref={rootRef} onBlurCapture={onBlurCapture}>
			<Button
				ref={triggerRef}
				icon={icon}
				count={count}
				aria-expanded={isOpen}
				aria-controls={isOpen ? menuId : undefined}
				// The badge is decorative, so the selection count is spoken here
				// instead of trailing the label as a bare number.
				aria-label={count !== undefined && count > 0 ? `${label}, ${count} selected` : undefined}
				className={count !== undefined && count > 0 ? "btn--active" : undefined}
				onClick={() => onOpenChange(!isOpen)}
			>
				{label}
			</Button>
			{isOpen && (
				// A fieldset with a hidden legend, so assistive technology announces
				// which filter the controls inside belong to. Deliberately not
				// role="menu": these are form controls that keep native Tab order.
				<fieldset
					className={["dropdown-menu", alignEnd ? "dropdown-menu--end" : undefined, menuClassName]
						.filter(Boolean)
						.join(" ")}
					id={menuId}
				>
					<legend className="visually-hidden">{label}</legend>
					{children}
				</fieldset>
			)}
		</div>
	);
}
