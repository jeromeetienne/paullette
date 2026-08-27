import { setDefaultOpenAIClient, setOpenAIAPI, setTracingDisabled } from '@openai/agents';
import OpenAI from 'openai';

import { type DoublureConfig } from '../config/config_types.ts';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	ModelProvider — points the OpenAI Agents SDK at any OpenAI API compatible endpoint
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * Points the OpenAI Agents SDK at the endpoint named in the configuration.
 */
export class ModelProvider {
	/**
	 * Makes every later call of the OpenAI Agents SDK go to the configured endpoint.
	 *
	 * Three calls are needed, and the middle one is the one that is easy to miss. The SDK sends its requests to
	 * the Responses API by default, and LM Studio and most other OpenAI API compatible endpoints implement only
	 * the Chat Completions API, so without `setOpenAIAPI('chat_completions')` every request fails. The third call
	 * stops the SDK from sending traces to OpenAI, which fails when there is no OpenAI key.
	 *
	 * This must be called once, before any agent is built or run.
	 *
	 * @param config The configuration holding the base address and the key of the endpoint.
	 * @returns Nothing.
	 */
	static configure(config: DoublureConfig): void {
		const openaiClient = new OpenAI({
			baseURL: config.baseUrl,
			apiKey: config.apiKey,
		});

		setDefaultOpenAIClient(openaiClient);
		setOpenAIAPI('chat_completions');
		setTracingDisabled(true);
	}
}
