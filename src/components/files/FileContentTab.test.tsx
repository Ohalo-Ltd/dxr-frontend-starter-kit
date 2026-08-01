import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DxrApiError, type FileMetadata } from "../../dxr";
import { FileContentTab } from "./FileContentTab";

const { getRedactors, getRedactedText, getFileContent } = vi.hoisted(() => ({
	getFileContent: vi.fn(),
	getRedactedText: vi.fn(),
	getRedactors: vi.fn(),
}));

vi.mock("../../dxr", async (importOriginal) => ({
	...(await importOriginal<typeof import("../../dxr")>()),
	getFileContent,
	getRedactedText,
	getRedactors,
}));

const file: FileMetadata = {
	datasource: { connector: { type: "AMAZON_S3" }, id: "ds-1", name: "Corpus" },
	entitlements: { whoCanAccess: [] },
	fileId: "f1",
	fileName: "notes.txt",
	labels: [],
	mimeType: "text/plain",
	scanDepth: "DISCOVERY_AND_CLASSIFICATION",
	size: 1024,
};

/**
 * Clicks and lets React flush the resulting state updates.
 *
 * `fireEvent` rather than `user-event`: the interactions here are plain clicks,
 * and a test-only dependency is not worth a supply-chain review.
 */
async function clickAsync(element: HTMLElement) {
	await act(async () => {
		fireEvent.click(element);
	});
}

/** A promise the test resolves or rejects by hand, to hold a request open. */
function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, reject, resolve };
}

describe("FileContentTab", () => {
	beforeEach(() => {
		getRedactors.mockResolvedValue([{ createdAt: "", id: 1, name: "Default", updatedAt: "" }]);
		getRedactedText.mockResolvedValue("redacted body");
		getFileContent.mockResolvedValue({
			bytes: new TextEncoder().encode("original body"),
			disposition: "text",
			fileName: "notes.txt",
			mediaType: "text/plain",
		});
	});

	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	it("fetches no content on mount", () => {
		render(<FileContentTab file={file} />);

		// The redactor list is instance metadata, not file content.
		expect(getRedactors).toHaveBeenCalledTimes(1);
		expect(getRedactedText).not.toHaveBeenCalled();
		expect(getFileContent).not.toHaveBeenCalled();
	});

	it("says redaction profiles are loading rather than claiming there are none", async () => {
		const pending = deferred<unknown[]>();
		getRedactors.mockReturnValue(pending.promise);

		render(<FileContentTab file={file} />);

		expect(screen.getByText("Loading redaction profiles…")).toBeInTheDocument();
		expect(screen.queryByText(/reports no redaction profiles/)).not.toBeInTheDocument();

		pending.resolve([]);
		await waitFor(() => {
			expect(screen.getByText(/reports no redaction profiles/)).toBeInTheDocument();
		});
		expect(screen.queryByText("Loading redaction profiles…")).not.toBeInTheDocument();
	});

	it("restores the idle state when a load is cancelled", async () => {
		const pending = deferred<string>();
		getRedactedText.mockReturnValue(pending.promise);

		render(<FileContentTab file={file} />);
		await screen.findByRole("button", { name: "Load redacted text" });
		await clickAsync(screen.getByRole("button", { name: "Load redacted text" }));

		const cancel = await screen.findByRole("button", { name: "Cancel" });
		expect(screen.getByRole("button", { name: "Load redacted text" })).toBeDisabled();

		await clickAsync(cancel);
		// The abort rejects the in-flight promise, as the real client does.
		pending.reject(new DxrApiError("aborted", "The request was cancelled."));

		// The indicator must clear and the actions must become usable again;
		// previously this left the tab disabled until it was remounted.
		await waitFor(() => {
			expect(screen.getByRole("button", { name: "Load redacted text" })).toBeEnabled();
		});
		expect(screen.queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument();
		expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
	});

	it("shows redacted text, then the original behind a separate action", async () => {
		render(<FileContentTab file={file} />);

		await clickAsync(await screen.findByRole("button", { name: "Load redacted text" }));
		expect(await screen.findByText("redacted body")).toBeInTheDocument();
		expect(getFileContent).not.toHaveBeenCalled();

		await clickAsync(screen.getByRole("button", { name: "View original text" }));
		expect(await screen.findByText("original body")).toBeInTheDocument();
		expect(screen.getByText("Unredacted")).toBeInTheDocument();
	});

	it("refuses to render a response the server returns as an active type", async () => {
		getFileContent.mockResolvedValue({
			bytes: new TextEncoder().encode("%PDF-1.4"),
			// The search metadata said text/plain; the response says otherwise.
			disposition: "active",
			fileName: "notes.txt",
			mediaType: "application/pdf",
		});
		render(<FileContentTab file={file} />);

		await clickAsync(await screen.findByRole("button", { name: "View original text" }));

		expect(await screen.findByText(/must not be rendered inline/)).toBeInTheDocument();
		expect(screen.queryByText("%PDF-1.4")).not.toBeInTheDocument();
	});

	it("reports invalid UTF-8 instead of rendering replacement characters", async () => {
		getFileContent.mockResolvedValue({
			bytes: new Uint8Array([0xff, 0xfe, 0xfd]),
			disposition: "text",
			fileName: "notes.txt",
			mediaType: "text/plain",
		});
		render(<FileContentTab file={file} />);

		await clickAsync(await screen.findByRole("button", { name: "View original text" }));

		expect(await screen.findByText(/not valid UTF-8/)).toBeInTheDocument();
	});

	it("offers no inline view for an active format", async () => {
		render(
			<FileContentTab file={{ ...file, fileName: "report.pdf", mimeType: "application/pdf" }} />,
		);

		await screen.findByRole("button", { name: "Download original" });
		expect(screen.queryByRole("button", { name: "View original text" })).not.toBeInTheDocument();
		expect(screen.getByText("This format is never shown inline")).toBeInTheDocument();
	});
});
