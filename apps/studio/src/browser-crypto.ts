import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";

type HashInput = string | Uint8Array | ArrayBuffer;

function bytes(input: HashInput): Uint8Array {
  if (typeof input === "string") return utf8ToBytes(input);
  if (input instanceof Uint8Array) return input;
  return new Uint8Array(input);
}

export function createHash(algorithm: string) {
  if (algorithm.toLowerCase().replaceAll("-", "") !== "sha256") {
    throw new Error(`Unsupported browser hash ${algorithm}.`);
  }
  const chunks: Uint8Array[] = [];
  return {
    update(input: HashInput) {
      chunks.push(bytes(input));
      return this;
    },
    digest(encoding?: string) {
      const length = chunks.reduce((total, chunk) => total + chunk.length, 0);
      const merged = new Uint8Array(length);
      let offset = 0;
      for (const chunk of chunks) {
        merged.set(chunk, offset);
        offset += chunk.length;
      }
      const output = sha256(merged);
      return encoding === "hex" ? bytesToHex(output) : output;
    },
  };
}

export function randomUUID(): `${string}-${string}-${string}-${string}-${string}` {
  return globalThis.crypto.randomUUID();
}
