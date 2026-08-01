import { useId, useState } from "react";
import { validateQuery } from "../../dxr";
import { Button, Notice } from "../../ui";

type QueryViewProps = Readonly<{
	/** The query the filter builder currently compiles to. */
	compiledQuery: string;
	/** Set when the user has overridden the builder with a hand-written query. */
	rawQuery?: string | undefined;
	onRawQuerySubmit: (query: string) => void;
	onRawQueryClear: () => void;
	busy: boolean;
}>;

/**
 * Shows the query the filters compile to, and offers a hand-written override.
 *
 * The compiled query is always visible on purpose: it is how a developer learns
 * the language, and it makes the relationship between the controls and the
 * request inspectable rather than magic.
 *
 * The raw override runs through the same validator the builder obeys, so a
 * malformed query is reported here instead of becoming an opaque HTTP 400.
 */
export function QueryView({
	compiledQuery,
	rawQuery,
	onRawQuerySubmit,
	onRawQueryClear,
	busy,
}: QueryViewProps) {
	const [isEditing, setIsEditing] = useState(false);
	const [text, setText] = useState(rawQuery ?? compiledQuery);
	const [problems, setProblems] = useState<readonly string[]>([]);
	const textareaId = useId();

	const activeQuery = rawQuery ?? compiledQuery;

	function startEditing() {
		setText(activeQuery);
		setProblems([]);
		setIsEditing(true);
	}

	function submit() {
		const found = validateQuery(text);
		setProblems(found);
		if (found.length > 0) return;
		onRawQuerySubmit(text.trim());
		setIsEditing(false);
	}

	function cancel() {
		setIsEditing(false);
		setProblems([]);
	}

	return (
		<div className="query-view">
			<div className="query-view__label">
				<span>
					Query sent to <code>GET /api/v1/files</code>
					{rawQuery !== undefined && " — hand-written"}
				</span>
				{!isEditing && (
					<span>
						{rawQuery !== undefined && (
							<Button kind="ghost" size="sm" onClick={onRawQueryClear} disabled={busy}>
								Use filters
							</Button>
						)}
						<Button kind="ghost" size="sm" onClick={startEditing} disabled={busy}>
							Edit query
						</Button>
					</span>
				)}
			</div>

			{isEditing ? (
				<div className="query-view__raw">
					<label className="visually-hidden" htmlFor={textareaId}>
						Query
					</label>
					<textarea
						id={textareaId}
						value={text}
						spellCheck={false}
						onChange={(event) => setText(event.target.value)}
					/>
					{problems.length > 0 && (
						<Notice tone="danger" title="This query would be rejected" live="alert">
							<ul>
								{problems.map((problem) => (
									<li key={problem}>{problem}</li>
								))}
							</ul>
						</Notice>
					)}
					<div className="notice__actions">
						<Button kind="primary" size="sm" onClick={submit}>
							Run query
						</Button>
						<Button kind="ghost" size="sm" onClick={cancel}>
							Cancel
						</Button>
					</div>
				</div>
			) : (
				<pre className="query-view__code">{activeQuery}</pre>
			)}
		</div>
	);
}
