// SPDX-License-Identifier: AGPL-3.0-or-later

import RuntimeConfig from '@app/features/app/state/RuntimeConfig';
import {Logger} from '@app/features/platform/utils/AppLogger';
import {createVoiceAudioContext} from '@app/features/voice/engine/VoiceSharedAudioContext';
import {loadRnnoise, RnnoiseWorkletNode} from '@sapphi-red/web-noise-suppressor';

const logger = new Logger('RnnoiseNoiseProcessor');
const RNNOISE_SAMPLE_RATE = 48_000;

let wasmBinaryPromise: Promise<ArrayBuffer> | null = null;

function assetUrl(fileName: string): string {
	const base = RuntimeConfig.staticCdnEndpoint.replace(/\/+$/, '');
	return `${base}/audio-worklets/${fileName}`;
}

function loadRnnoiseBinary(): Promise<ArrayBuffer> {
	wasmBinaryPromise ??= loadRnnoise({
		url: assetUrl('rnnoise.wasm'),
		simdUrl: assetUrl('rnnoise_simd.wasm'),
	});
	return wasmBinaryPromise;
}

export interface RnnoiseAudioChain {
	processedTrack: MediaStreamTrack;
	inputDestination: MediaStreamAudioDestinationNode;
	dispose: () => Promise<void>;
}

function safeDisconnect(node: AudioNode | null | undefined): void {
	if (!node) return;
	try {
		node.disconnect();
	} catch {}
}

function safeStopTrack(track: MediaStreamTrack | null | undefined): void {
	if (!track) return;
	try {
		track.stop();
	} catch {}
}

export async function buildRnnoiseAudioChain(opts: {audioContext: AudioContext}): Promise<RnnoiseAudioChain> {
	const inputDestination = opts.audioContext.createMediaStreamDestination();
	const inputTrack = inputDestination.stream.getAudioTracks()[0];
	if (!inputTrack) {
		throw new Error('buildRnnoiseAudioChain: missing input destination track');
	}
	const processingContext = createVoiceAudioContext({latencyHint: 'interactive', sampleRate: RNNOISE_SAMPLE_RATE});
	if (!processingContext) {
		safeDisconnect(inputDestination);
		safeStopTrack(inputTrack);
		throw new Error('buildRnnoiseAudioChain: unable to create 48 kHz AudioContext');
	}

	let source: MediaStreamAudioSourceNode | null = null;
	let processor: RnnoiseWorkletNode | null = null;
	let outputDestination: MediaStreamAudioDestinationNode | null = null;
	let processedTrack: MediaStreamTrack | null = null;
	try {
		const [, wasmBinary] = await Promise.all([
			processingContext.audioWorklet.addModule(assetUrl('rnnoiseWorklet.js')),
			loadRnnoiseBinary(),
		]);
		source = processingContext.createMediaStreamSource(new MediaStream([inputTrack]));
		processor = new RnnoiseWorkletNode(processingContext, {maxChannels: 1, wasmBinary});
		outputDestination = processingContext.createMediaStreamDestination();
		source.connect(processor).connect(outputDestination);
		processedTrack = outputDestination.stream.getAudioTracks()[0] ?? null;
		if (!processedTrack) {
			throw new Error('buildRnnoiseAudioChain: missing processed output track');
		}
		if (processingContext.state === 'suspended') {
			await processingContext.resume();
		}
	} catch (error) {
		safeDisconnect(inputDestination);
		safeDisconnect(source);
		safeDisconnect(processor);
		safeDisconnect(outputDestination);
		processor?.destroy();
		safeStopTrack(inputTrack);
		safeStopTrack(processedTrack);
		await processingContext.close().catch((closeError) => {
			logger.debug('Failed to close RNNoise AudioContext after initialization failure', closeError);
		});
		throw error;
	}

	let disposed = false;
	const dispose = async () => {
		if (disposed) return;
		disposed = true;
		safeDisconnect(inputDestination);
		safeDisconnect(source);
		safeDisconnect(processor);
		safeDisconnect(outputDestination);
		processor?.destroy();
		safeStopTrack(inputTrack);
		safeStopTrack(processedTrack);
		await processingContext.close().catch((error) => {
			logger.debug('Failed to close RNNoise AudioContext', error);
		});
	};

	return {processedTrack, inputDestination, dispose};
}
