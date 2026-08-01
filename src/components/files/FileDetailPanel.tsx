import { type ReactNode, useEffect, useId, useMemo, useRef, useState } from "react";
import type { Annotator, FileMetadata } from "../../dxr";
import { Button, Nav, NavItem } from "../../ui";
import { formatBytes, formatDate, totalUniquePhrases } from "./FilesResultsTable";

type TabId = "classifications" | "metadata" | "access";

const tabs: ReadonlyArray<{ id: TabId; label: string }> = [
	{ id: "classifications", label: "Classifications" },
	{ id: "metadata", label: "Metadata" },
	{ id: "access", label: "Access" },
];

type FileDetailPanelProps = Readonly<{
	file: FileMetadata;
	onClose: () => void;
}>;

/**
 * A read-only inspector for one file.
 *
 * Everything shown here came from the row already streamed by
 * `GET /api/v1/files`, so opening the panel costs no additional request. That is
 * deliberate: the v1 file endpoint has no single-file variant, and re-querying
 * by `fileId` to populate a detail view would be pure waste.
 *
 * File *content* is intentionally absent. Fetching it is a separate decision
 * with its own exposure and rendering risks — see docs/dxr-public-api.md. If a
 * module needs a preview, add it explicitly, on user intent, and render it as
 * inert text.
 */
export function FileDetailPanel({ file, onClose }: FileDetailPanelProps) {
	const dialogRef = useRef<HTMLDialogElement>(null);
	const [tab, setTab] = useState<TabId>("classifications");
	const titleId = useId();

	// A native modal dialog gives focus containment, Escape handling, and inert
	// background content without a focus-trap dependency.
	useEffect(() => {
		const dialog = dialogRef.current;
		if (dialog === null || dialog.open) return;
		dialog.showModal();
	}, []);

	// Note: callers give this component a `key` of the file id, so inspecting a
	// different file remounts it and the tab resets on its own. That is why there
	// is no reset effect here.
	const annotatorsByDomain = useMemo(() => {
		const grouped = new Map<string, Annotator[]>();
		for (const annotator of file.annotators ?? []) {
			const existing = grouped.get(annotator.domain.name);
			if (existing === undefined) {
				grouped.set(annotator.domain.name, [annotator]);
			} else {
				existing.push(annotator);
			}
		}
		return [...grouped.entries()].sort(([left], [right]) => left.localeCompare(right));
	}, [file]);

	return (
		<dialog
			className="detail-panel"
			ref={dialogRef}
			aria-labelledby={titleId}
			onClose={onClose}
			onCancel={onClose}
		>
			<div className="detail-panel__surface">
				<header className="detail-panel__header">
					<div className="detail-panel__heading">
						<h2 id={titleId}>{file.fileName}</h2>
						<dl className="detail-panel__summary">
							<div>
								<dt>Datasource</dt>
								<dd>{file.datasource.name}</dd>
							</div>
							<div>
								<dt>Size</dt>
								<dd>{formatBytes(file.size)}</dd>
							</div>
							<div>
								<dt>Modified</dt>
								<dd>{formatDate(file.lastModifiedAt)}</dd>
							</div>
							<div>
								<dt>Scan depth</dt>
								<dd>{file.scanDepth ?? "—"}</dd>
							</div>
						</dl>
					</div>
					<Button
						kind="ghost"
						icon="close"
						aria-label="Close file details"
						onClick={() => dialogRef.current?.close()}
					/>
				</header>

				<div className="detail-panel__tabs">
					<nav aria-label="File details">
						<Nav tabs>
							{tabs.map((entry) => (
								<NavItem key={entry.id}>
									{/* An in-panel view switch is a button, not a link: it changes
									    nothing about the document location. */}
									<button
										type="button"
										className={`nav-link${tab === entry.id ? " active" : ""}`}
										aria-current={tab === entry.id ? "true" : undefined}
										onClick={() => setTab(entry.id)}
									>
										{entry.label}
									</button>
								</NavItem>
							))}
						</Nav>
					</nav>
				</div>

				<div className="detail-panel__body">
					{tab === "classifications" && (
						<div className="detail-panel__sections">
							<section>
								<h3>Sensitive data</h3>
								{annotatorsByDomain.length === 0 ? (
									<p className="detail-panel__empty">
										{file.scanDepth === "DISCOVERY"
											? "This file was discovered but not classified, so no sensitive data was looked for."
											: "No annotators matched this file."}
									</p>
								) : (
									<>
										<p className="status-text">
											{totalUniquePhrases(file)} unique phrases across{" "}
											{(file.annotators ?? []).length} annotators.
										</p>
										{annotatorsByDomain.map(([domain, annotators]) => (
											<div className="detail-panel__classification-row" key={domain}>
												<span>{domain}</span>
												<div className="detail-panel__chips">
													{annotators.map((annotator) => (
														<span className="detail-panel__chip" key={annotator.id}>
															{annotator.name} · {annotator.uniquePhrases}
														</span>
													))}
												</div>
											</div>
										))}
									</>
								)}
							</section>

							<section>
								<h3>Labels</h3>
								{file.labels.length === 0 ? (
									<p className="detail-panel__empty">No labels are applied.</p>
								) : (
									<div className="detail-panel__chips">
										{file.labels.map((label) => (
											<span className="detail-panel__chip" key={label.id}>
												{label.name}
											</span>
										))}
									</div>
								)}
							</section>

							{file.dlpLabels !== undefined && file.dlpLabels.length > 0 && (
								<section>
									<h3>DLP labels</h3>
									<div className="detail-panel__chips">
										{file.dlpLabels.map((label) => (
											<span
												className="detail-panel__chip detail-panel__chip--emphasized"
												key={label.id}
											>
												{label.name ?? label.id} · {label.dlpSystem} · {label.type}
											</span>
										))}
									</div>
								</section>
							)}

							{file.extractedMetadata !== undefined && file.extractedMetadata.length > 0 && (
								<section>
									<h3>Extracted metadata</h3>
									<dl className="detail-panel__metadata">
										{file.extractedMetadata.map((entry) => (
											<div key={entry.id}>
												<dt>{entry.name}</dt>
												<dd>{entry.value === undefined ? "—" : String(entry.value)}</dd>
											</div>
										))}
									</dl>
								</section>
							)}
						</div>
					)}

					{tab === "metadata" && (
						<div className="detail-panel__sections">
							<section>
								<h3>Identity</h3>
								<dl className="detail-panel__metadata">
									<Row label="File ID" value={file.fileId} />
									<Row label="Path" value={file.path} />
									<Row label="MIME type" value={file.mimeType} />
									<Row label="Size" value={`${file.size} bytes`} />
									<Row label="SHA-256" value={file.contentSha256} />
								</dl>
							</section>
							<section>
								<h3>Datasource</h3>
								<dl className="detail-panel__metadata">
									<Row label="Name" value={file.datasource.name} />
									<Row label="Datasource ID" value={file.datasource.id} />
									<Row label="Connector" value={file.datasource.connector.type} />
									<Row label="Site URL" value={file.datasource.connector.siteUrl} />
								</dl>
							</section>
							<section>
								<h3>Timestamps and processing</h3>
								<dl className="detail-panel__metadata">
									<Row label="Created" value={file.createdAt} />
									<Row label="Last modified" value={file.lastModifiedAt} />
									<Row label="Scan depth" value={file.scanDepth} />
									<Row label="Extraction status" value={file.metadataExtractionStatus} />
								</dl>
							</section>
						</div>
					)}

					{tab === "access" && (
						<div className="detail-panel__sections">
							<section>
								<h3>Who can access</h3>
								<p className="detail-panel__permission">
									Reported by the datasource. This is the file's access list, not this application's
									authorization — the server remains the authority for both.
								</p>
								{file.entitlements.whoCanAccess.length === 0 ? (
									<p className="detail-panel__empty">No access records were returned.</p>
								) : (
									<dl className="detail-panel__metadata">
										{file.entitlements.whoCanAccess.map((account) => (
											<div key={account.id}>
												<dt>{account.name ?? account.realmAccountId}</dt>
												<dd>
													{account.accountType}
													{account.email === undefined ? "" : ` · ${account.email}`}
												</dd>
											</div>
										))}
									</dl>
								)}
							</section>
							<section>
								<h3>Ownership</h3>
								<dl className="detail-panel__metadata">
									<Row label="Owner" value={describeAccount(file.owner)} />
									<Row label="Created by" value={describeAccount(file.createdBy)} />
									<Row label="Modified by" value={describeAccount(file.modifiedBy)} />
								</dl>
							</section>
						</div>
					)}
				</div>
			</div>
		</dialog>
	);
}

/** A metadata row that renders an em dash rather than hiding an absent field. */
function Row({ label, value }: Readonly<{ label: string; value?: ReactNode }>) {
	return (
		<div>
			<dt>{label}</dt>
			<dd>{value === undefined || value === "" ? "—" : value}</dd>
		</div>
	);
}

function describeAccount(account: FileMetadata["owner"]): string | undefined {
	if (account === undefined) return undefined;
	const name = account.name ?? account.realmAccountId;
	return account.email === undefined ? name : `${name} (${account.email})`;
}
