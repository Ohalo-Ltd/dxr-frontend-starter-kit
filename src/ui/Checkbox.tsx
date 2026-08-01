import type { InputHTMLAttributes, ReactNode } from "react";

type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "className"> &
	Readonly<{
		label: ReactNode;
		/** Secondary text shown under the label, e.g. a domain or count. */
		meta?: ReactNode | undefined;
	}>;

/**
 * A native checkbox wrapped in its own `<label>`, so the label text is always
 * part of the hit target and the accessible name.
 *
 * Keep it controlled: pass `checked` and `onChange` so selection state cannot
 * drift from the workflow state that will be submitted.
 */
export function Checkbox({ label, meta, ...rest }: CheckboxProps) {
	return (
		<label className="checkbox">
			<input type="checkbox" {...rest} />
			<span className="checkbox__label">
				{label}
				{meta !== undefined && <span className="checkbox__meta">{meta}</span>}
			</span>
		</label>
	);
}
