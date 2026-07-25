import type { LookupFunction } from "node:net";

export function selectPreferredDnsAddress(
  addresses: readonly { address: string; family: number }[],
) {
  const selected =
    addresses.find((entry) => entry.family === 4) ??
    addresses.find((entry) => entry.family === 6);
  if (!selected) return null;
  return {
    address: selected.address,
    family: selected.family as 4 | 6,
  };
}

export function createPinnedDnsLookup(params: {
  address: string;
  family: 4 | 6;
}): LookupFunction {
  return (_hostname, options, callback) => {
    if (options.all === true) {
      callback(null, [{
        address: params.address,
        family: params.family,
      }]);
      return;
    }
    callback(null, params.address, params.family);
  };
}
