/**
 * An indeterminate progress indicator.
 *
 * Use it for work whose duration is genuinely unknown, such as a streaming
 * response. Always pair it with text that says what is happening; the bar alone
 * is not an accessible status.
 */
export function LoadingBar({ label }: Readonly<{ label: string }>) {
	return <div className="loading-bar" role="progressbar" aria-label={label} aria-busy="true" />;
}
