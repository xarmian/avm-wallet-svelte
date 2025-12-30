import algosdk from 'algosdk';
import { CONTRACT } from 'ulujs';
import type { Algodv2 } from 'algosdk';

interface EnvoiResolver {
	getNameFromAddress: (address: string) => Promise<string>;
}

function init(algodClient: Algodv2): EnvoiResolver {
	const ciResolver = new CONTRACT(
		797608,
		algodClient,
		null,
		{
			name: 'resolver',
			description: 'resolver',
			methods: [
				{
					name: 'name',
					args: [{ type: 'byte[32]' }],
					returns: { type: 'byte[256]' }
				}
			],
			events: []
		},
		{
			addr: 'TBEIGCNK4UCN3YDP2NODK3MJHTUZMYS3TABRM2MVSI2MPUR2V36E5JYHSY',
			sk: new Uint8Array()
		}
	);

	return {
		getNameFromAddress: async (address: string): Promise<string> => {
			if (!isAlgorandAddress(address)) {
				return '';
			}

			const lookup = await namehash(`${address}.addr.reverse`);
			const nameR = await ciResolver.name(lookup);

			return stripNullBytes(nameR.returnValue);
		}
	};
}

async function sha256(data: Uint8Array): Promise<Uint8Array> {
	const hashBuffer = await crypto.subtle.digest('SHA-256', data);
	return new Uint8Array(hashBuffer);
}

function stripNullBytes(string: string): string {
	return string.replace(/\0/g, '');
}

function uint8ArrayToBigInt(uint8Array: Uint8Array) {
	let result = BigInt(0); // Initialize the BigInt result
	for (let i = 0; i < uint8Array.length; i++) {
		result = (result << BigInt(8)) + BigInt(uint8Array[i]); // Shift 8 bits and add the current byte
	}
	return result;
}

function isAlgorandAddress(address: string): boolean {
	// Check if the address length is correct
	if (address.length !== 58) {
		return false;
	}

	// Check if the address uses valid Base32 characters
	const base32Regex = /^[A-Z2-7]+$/;
	if (!base32Regex.test(address)) {
		return false;
	}

	return true;
}

async function namehash(name: string): Promise<Uint8Array> {
	if (!name) {
		return new Uint8Array(32); // Return 32 bytes of zeros for empty name
	}

	// Split the name into labels and reverse them
	const labels = name.split('.').reverse();

	// Start with empty hash (32 bytes of zeros)
	let node = new Uint8Array(32);

	// Hash each label
	for (const label of labels) {
		if (label) {
			// Skip empty labels
			// Hash the label
			const labelBytes = new TextEncoder().encode(label);
			const labelHash = !isAlgorandAddress(label)
				? await sha256(labelBytes)
				: await sha256(algosdk.decodeAddress(label).publicKey);

			// Concatenate current node hash with label hash and hash again
			const combined = new Uint8Array(labelHash.length + node.length);
			combined.set(node);
			combined.set(labelHash, node.length);
			node = await sha256(combined);
		}
	}

	return node;
}

function stringToUint8Array(str: string, length = 256): Uint8Array {
	const bytes = new Uint8Array(length);
	const encoded = new TextEncoder().encode(str);
	bytes.set(encoded, 0);
	return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
	return Array.from(bytes)
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
}

function bytesToBase64(bytes: Uint8Array): string {
	return window.btoa(String.fromCharCode.apply(null, Array.from(bytes)));
}

export default { init };
