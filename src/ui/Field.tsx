import type { InputHTMLAttributes, ReactNode, Ref, SelectHTMLAttributes } from "react";
import { useId } from "react";
import { Icon } from "./Icon";

type FieldShellProps = Readonly<{
	label: ReactNode;
	labelFor: string;
	hint?: ReactNode | undefined;
	error?: ReactNode | undefined;
	hintId?: string | undefined;
	errorId?: string | undefined;
	/** Hide the label visually but keep it for assistive technology. */
	hiddenLabel?: boolean | undefined;
	children: ReactNode;
}>;

function FieldShell({
	label,
	labelFor,
	hint,
	error,
	hintId,
	errorId,
	hiddenLabel = false,
	children,
}: FieldShellProps) {
	return (
		<div className="field">
			<label className={hiddenLabel ? "visually-hidden" : "field__label"} htmlFor={labelFor}>
				{label}
			</label>
			{children}
			{hint !== undefined && (
				<span className="field__hint" id={hintId}>
					{hint}
				</span>
			)}
			{error !== undefined && (
				<span className="field__error" id={errorId} role="alert">
					{error}
				</span>
			)}
		</div>
	);
}

type TextInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "className" | "id"> &
	Readonly<{
		label: ReactNode;
		hint?: ReactNode | undefined;
		error?: ReactNode | undefined;
		hiddenLabel?: boolean | undefined;
		ref?: Ref<HTMLInputElement> | undefined;
	}>;

/** A labelled text input. Every input in this kit has a real label. */
export function TextInput({ label, hint, error, hiddenLabel, ...rest }: TextInputProps) {
	const id = useId();
	const hintId = `${id}-hint`;
	const errorId = `${id}-error`;
	const describedBy = [
		hint !== undefined ? hintId : undefined,
		error !== undefined ? errorId : undefined,
	]
		.filter(Boolean)
		.join(" ");

	return (
		<FieldShell
			label={label}
			labelFor={id}
			hint={hint}
			error={error}
			hintId={hintId}
			errorId={errorId}
			hiddenLabel={hiddenLabel}
		>
			<input
				id={id}
				className="text-input"
				aria-describedby={describedBy === "" ? undefined : describedBy}
				aria-invalid={error !== undefined ? true : undefined}
				{...rest}
			/>
		</FieldShell>
	);
}

type SearchInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "className" | "id" | "type"> &
	Readonly<{
		label: ReactNode;
		hiddenLabel?: boolean | undefined;
	}>;

/**
 * A search field. `type="search"` so browsers offer the expected affordances.
 *
 * Debounce and cancel the request the caller fires from `onChange`; this
 * component intentionally owns no query state.
 */
export function SearchInput({ label, hiddenLabel = true, ...rest }: SearchInputProps) {
	const id = useId();

	return (
		<FieldShell label={label} labelFor={id} hiddenLabel={hiddenLabel}>
			<span className="search-input">
				<Icon kind="search" />
				<input id={id} type="search" className="text-input" {...rest} />
			</span>
		</FieldShell>
	);
}

type SelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, "className" | "id"> &
	Readonly<{
		label: ReactNode;
		hint?: ReactNode | undefined;
		hiddenLabel?: boolean | undefined;
		children: ReactNode;
	}>;

/** A labelled native select. Native, so keyboard and mobile behaviour is free. */
export function Select({ label, hint, hiddenLabel, children, ...rest }: SelectProps) {
	const id = useId();
	const hintId = `${id}-hint`;

	return (
		<FieldShell label={label} labelFor={id} hint={hint} hintId={hintId} hiddenLabel={hiddenLabel}>
			<select
				id={id}
				className="select"
				aria-describedby={hint !== undefined ? hintId : undefined}
				{...rest}
			>
				{children}
			</select>
		</FieldShell>
	);
}
