import { Buffer } from 'buffer';
import algosdk from 'algosdk';
import * as ed from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha512';
import * as jose from 'jose';

// Configure ed25519 to use sha512
ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));

interface JWTPayload {
  sub: string;  // wallet address
  iat: number;  // issued at
  exp: number;  // expiration
  iss: string;  // issuer (your app name)
  aud: string;  // audience (network identifier)
}

export async function createAuthTransaction(wallet: string, chainId: string, algodClient: algosdk.Algodv2): Promise<algosdk.Transaction> {
  const params = await algodClient.getTransactionParams().do();
  const enc = new TextEncoder();
  const day90 = 24 * 60 * 60 * 1000 * 90;
  
  // Create JWT payload
  const payload: JWTPayload = {
    sub: wallet,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor((Date.now() + day90) / 1000),
    iss: 'avm-wallet',
    aud: chainId
  };

  // Encode payload as note
  const note = enc.encode(JSON.stringify(payload));

  return algosdk.makePaymentTxnWithSuggestedParamsFromObject({
    suggestedParams: {
      ...params,
      fee: 0,
      firstValid: 1,
      lastValid: 1,
      flatFee: true,
    },
    sender: wallet,
    receiver: wallet,
    amount: 0,
    note,
  });
}

export async function verifySignedTransaction(signedTxnBytes: Uint8Array, expectedAddress: string): Promise<string> {
  const stxn = algosdk.decodeSignedTransaction(signedTxnBytes);
  const txn = stxn.txn;
  const sig = stxn.sig;
  
  // Verify the transaction parameters
  if (
    txn.sender.publicKey !== txn.payment?.receiver.publicKey ||
    algosdk.encodeAddress(txn.sender.publicKey) !== expectedAddress ||
    txn.payment?.amount !== BigInt(0) ||
    txn.fee !== BigInt(0)
  ) {
    throw new Error('Invalid authentication transaction');
  }

  // Verify the signature
  const verified = await ed.verify(sig, txn.bytesToSign(), txn.sender.publicKey);
  if (!verified) {
    throw new Error('Invalid transaction signature');
  }

  // Decode and verify the JWT payload
  const noteString = new TextDecoder().decode(txn.note);
  const payload = JSON.parse(noteString) as JWTPayload;
  
  if (
    payload.sub !== expectedAddress ||
    payload.exp < Math.floor(Date.now() / 1000)
  ) {
    throw new Error('Invalid or expired JWT payload');
  }

  // Create JWT using jose
  const secret = await jose.base64url.decode(Buffer.from(sig).toString('base64url'));
  const jwt = await new jose.SignJWT(payload)
    .setProtectedHeader({ alg: 'EdDSA' })
    .sign(secret);

  return jwt;
}

export async function verifyToken(token: string, expectedAddress: string): Promise<boolean> {
  console.log('verifyToken', token, expectedAddress);

  try {
    // First try to decode as JWT
    try {
      const decoded = await jose.jwtVerify(
        token,
        async () => new Uint8Array(32), // Placeholder key since we only care about payload validation
        {
          algorithms: ['EdDSA']
        }
      );
      console.log('decoded', decoded);
      const payload = decoded.payload as JWTPayload;
      return payload.sub === expectedAddress && payload.exp! > Math.floor(Date.now() / 1000);
    } catch (e) {
      // If JWT verification fails, try decoding as signed transaction
      try {
        // Try to decode base64 string to bytes
        let signedTxnBytes: Uint8Array;
        try {
          signedTxnBytes = Buffer.from(token, 'base64');
        } catch (err) {
          console.error('Invalid base64 encoding:', err);
          return false;
        }

        // Try to decode as signed transaction
        let stxn: algosdk.SignedTransaction;
        try {
          stxn = algosdk.decodeSignedTransaction(signedTxnBytes);
        } catch (err) {
          console.error('Failed to decode signed transaction:', err);
          return false;
        }

        const txn = stxn.txn;
        
        // Compare the arrays using every() to check each element
        const publicKeysMatch = txn.sender.publicKey.length === txn.receiver.publicKey.length &&
          txn.sender.publicKey.every((value, index) => value === txn.receiver.publicKey[index]);
        
        // Verify basic transaction properties
        if (
          !publicKeysMatch ||
          algosdk.encodeAddress(txn.sender.publicKey) !== expectedAddress ||
          txn.amount != undefined ||
          txn.fee != undefined
        ) {
          return false;
        }

        // Decode and verify the payload from note
        let noteString: string;
        try {
          noteString = new TextDecoder().decode(txn.note);
        } catch (err) {
          console.error('Failed to decode note:', err);
          return false;
        }

        let payload: JWTPayload;
        try {
          payload = JSON.parse(noteString) as JWTPayload;
        } catch (err) {
          console.error('Failed to parse note JSON:', err);
          return false;
        }
        
        return payload.sub === expectedAddress && payload.exp > Math.floor(Date.now() / 1000);
      } catch (txnError) {
        console.error('Transaction verification failed:', txnError);
        return false;
      }
    }
  } catch (error) {
    console.error('Token verification error:', error);
    return false;
  }
}