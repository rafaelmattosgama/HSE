// Shared between fire-equipment-tag-service.ts (server, node:crypto) and
// fire-equipment-tag-scan-button.tsx (client, Web Crypto) — no node-specific
// imports here, so this file is safe in either bundle. §5.1 rule 5 needs the
// client to mint a tagCode BEFORE the physical write, in this exact shape,
// so the server can persist it as-is rather than generating a different one
// than what actually got written to the chip.
//
// Ambiguous characters (0/O, 1/I/L) are dropped — §5.4 prints tagCode in
// human-readable text on the label for manual entry when the QR is unreadable.
export const TAG_CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
export const TAG_CODE_LENGTH = 8;
