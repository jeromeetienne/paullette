///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	StandardErrorCapture — keeps what a test wrote to the standard error out of the test output
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * What a piece of code wrote to the standard error while it ran, and whatever it gave back.
 */
export type CapturedRun<ResultType> = {
	/** Whatever the code gave back. */
	result: ResultType;
	/** Everything the code wrote to the standard error, joined into one block of text. */
	standardErrorText: string;
};

/**
 * Keeps what a test wrote to the standard error out of the test output, and hands it to the test instead.
 *
 * paullette writes everything it says about its own working to the standard error. A test of that code has to
 * read what was written, and a reader of the test output should not have to.
 */
export class StandardErrorCapture {
	/**
	 * Runs a piece of code with the standard error held back.
	 *
	 * @param runFunction The code to run.
	 * @returns Whatever the code gave back, and everything it wrote to the standard error.
	 */
	static async run<ResultType>(runFunction: () => Promise<ResultType>): Promise<CapturedRun<ResultType>> {
		const writtenParts: string[] = [];
		const originalWrite = process.stderr.write.bind(process.stderr);

		process.stderr.write = ((chunk: unknown) => {
			writtenParts.push(String(chunk));
			return true;
		}) as typeof process.stderr.write;

		try {
			const result = await runFunction();
			return {
				result: result,
				standardErrorText: writtenParts.join(''),
			};
		} finally {
			process.stderr.write = originalWrite;
		}
	}
}
