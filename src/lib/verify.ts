import algosdk from 'algosdk';
import { Buffer } from 'buffer';
import * as ed from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha512';
ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));

export const verifyToken = async (wallet: string, token: string): Promise<boolean> => {
	const day90 = 24 * 60 * 60 * 1000 * 90;
	const minutes30 = 30 * 60 * 1000;

	//converting the base64 encoded tx back to binary data
	const decodeToken = new Uint8Array(Buffer.from(token, 'base64'));

	//getting a SignedTransaction object from the array buffer
	const decodedTx = algosdk.decodeSignedTransaction(decodeToken);

	//auth tx whose params we will check
	const toCheck = decodedTx.txn;

	// get the signature from the signed transaction
	const signature = decodedTx.sig;

	// parse the note back to utf-8
	const note = new TextDecoder().decode(toCheck.note);
	const decodedNote = note.split(' ');

	// "from" and "to" are distincts ArrayBuffers,
	// comparing them directly would always return false.
	// We therefore convert them back to base32 for comparison.
	const from = algosdk.encodeAddress(toCheck.sender.publicKey);
	const to = algosdk.encodeAddress(toCheck.payment?.receiver.publicKey ?? new Uint8Array());

	// Guard clause to make sure the token has not expired.
	// We also check the token expiration is not too far out, which would be a red flag.
	// An expiry that is not a finite number (missing or non-numeric) counts as expired:
	// every comparison against NaN is false, so it would otherwise never expire.
	const expiry = Number(decodedNote[1]);
	if (!Number.isFinite(expiry) || expiry < Date.now() || expiry > Date.now() + day90 + minutes30) {
		throw new Error('Token expired, authenticate again');
	}

	// We verify that the params match the ones we set in the front-end.
	if (
		toCheck.firstValid === BigInt(10) &&
		toCheck.lastValid === BigInt(10) &&
		decodedNote[0] === 'avm-wallet-auth' &&
		from === to &&
		// It is crucial to verify this or an attacker could sign
		// their own valid token and log into any account!
		from === wallet
	) {
		// verify signature and return if it succeeds
		if (!signature) {
			return false;
		}
		const verified = ed.verify(signature, toCheck.bytesToSign(), toCheck.sender.publicKey);
		if (verified) return true;
	}
	return false;
};
