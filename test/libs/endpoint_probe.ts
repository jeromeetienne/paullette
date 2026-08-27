///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	EndpointProbe — checks the OpenAI API compatible endpoint is up and serves the model
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * What the probe found at the endpoint.
 */
export type EndpointStatus = {
	/** True when the endpoint answered the request for its model list. */
	isReachable: boolean;
	/** True when the wanted model appears in the model list of the endpoint. */
	isModelPresent: boolean;
	/** Every model identifier the endpoint listed. */
	modelNames: string[];
	/** The reason the endpoint could not be reached, when it could not be reached. */
	failureReason: string | undefined;
};

/**
 * Checks the OpenAI API compatible endpoint before the other verification steps run.
 *
 * This exists because a dead endpoint looks exactly like broken code: every step that calls the model fails at
 * once, and the failure says nothing about the endpoint. Asking the endpoint first turns that into one clear
 * message.
 */
export class EndpointProbe {
	/**
	 * Asks the endpoint for its model list.
	 *
	 * @param baseUrl The base address of the endpoint, for example `http://127.0.0.1:1234/v1`.
	 * @param modelName The model identifier that is expected to be in the list.
	 * @param timeoutMilliseconds How long to wait before giving up on the endpoint.
	 * @returns What the probe found.
	 */
	static async check(baseUrl: string, modelName: string, timeoutMilliseconds = 5000): Promise<EndpointStatus> {
		const modelsUrl = `${baseUrl.replace(/\/+$/, '')}/models`;

		try {
			const response = await fetch(modelsUrl, {
				signal: AbortSignal.timeout(timeoutMilliseconds),
			});

			if (response.ok === false) {
				return {
					isReachable: false,
					isModelPresent: false,
					modelNames: [],
					failureReason: `${modelsUrl} answered with the status ${response.status}`,
				};
			}

			const payload = (await response.json()) as { data?: Array<{ id?: string }> };
			const modelNames = (payload.data ?? [])
				.map((entry) => entry.id)
				.filter((identifier): identifier is string => typeof identifier === 'string');

			return {
				isReachable: true,
				isModelPresent: modelNames.includes(modelName),
				modelNames: modelNames,
				failureReason: undefined,
			};
		} catch (caughtError) {
			const reason = caughtError instanceof Error ? caughtError.message : String(caughtError);
			return {
				isReachable: false,
				isModelPresent: false,
				modelNames: [],
				failureReason: `${modelsUrl} could not be reached: ${reason}`,
			};
		}
	}
}
