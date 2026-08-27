import type Http from 'node:http';

import { type WebEvent } from './web_types.ts';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	WebEventStream — holds the open streams and writes one event to every browser
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * How long the server waits between the empty comment lines it writes to keep an idle stream open, in
 * milliseconds. A turn can think for a long time without saying anything, and a stream that says nothing at all
 * is closed by whatever sits between the browser and the server.
 */
const KEEP_OPEN_INTERVAL_MILLISECONDS = 15000;

/**
 * Holds every open server-sent events stream, and writes one event to all of them.
 *
 * Server-sent events were chosen over a websocket because the stream only ever runs one way, from the server to
 * the browser; everything the browser has to say fits in an ordinary request. The reasons are in the plan on
 * issue 9.
 */
export class WebEventStream {
	/** Every stream a browser has open. */
	private readonly _openResponses: Set<Http.ServerResponse>;
	/** The timer that keeps an idle stream open, or null when no stream is open. */
	private _keepOpenTimer: NodeJS.Timeout | null;

	/**
	 * Builds the event stream.
	 */
	constructor() {
		this._openResponses = new Set<Http.ServerResponse>();
		this._keepOpenTimer = null;
	}

	/**
	 * How many browsers are reading the stream.
	 */
	get openStreamCount(): number {
		return this._openResponses.size;
	}

	/**
	 * Takes over one request and turns it into a stream this browser reads until it goes away.
	 *
	 * @param serverResponse The answer to the request the browser made.
	 * @returns Nothing.
	 */
	open(serverResponse: Http.ServerResponse): void {
		serverResponse.writeHead(200, {
			'content-type': 'text/event-stream; charset=utf-8',
			'cache-control': 'no-cache',
			connection: 'keep-alive',
			'x-accel-buffering': 'no',
		});
		serverResponse.write(': the stream is open\n\n');

		this._openResponses.add(serverResponse);
		serverResponse.on('close', () => {
			this._openResponses.delete(serverResponse);
			this._stopKeepingOpenWhenNobodyIsReading();
		});

		if (this._keepOpenTimer === null) {
			this._keepOpenTimer = setInterval(() => {
				for (const openResponse of this._openResponses) {
					openResponse.write(': still here\n\n');
				}
			}, KEEP_OPEN_INTERVAL_MILLISECONDS);
			this._keepOpenTimer.unref();
		}
	}

	/**
	 * Writes one event to every browser reading the stream.
	 *
	 * @param event What happened.
	 * @returns Nothing.
	 */
	send(event: WebEvent): void {
		const line = `event: ${event.kind}\ndata: ${JSON.stringify(event)}\n\n`;

		for (const openResponse of this._openResponses) {
			openResponse.write(line);
		}
	}

	/**
	 * Closes every open stream and stops the timer.
	 *
	 * @returns Nothing.
	 */
	closeEveryStream(): void {
		for (const openResponse of this._openResponses) {
			openResponse.end();
		}

		this._openResponses.clear();
		this._stopKeepingOpenWhenNobodyIsReading();
	}

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	Helpers
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	/**
	 * Stops the timer once the last browser has gone, so that nothing is left running.
	 *
	 * @returns Nothing.
	 */
	private _stopKeepingOpenWhenNobodyIsReading(): void {
		if (this._openResponses.size > 0 || this._keepOpenTimer === null) {
			return;
		}

		clearInterval(this._keepOpenTimer);
		this._keepOpenTimer = null;
	}
}
