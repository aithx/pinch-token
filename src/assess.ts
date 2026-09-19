import { PublicKey, SystemProgram } from "@solana/web3.js";
import { ExtensionType, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { TOKEN, rawSupply } from "./token.js";

/** Extensions that let an owner rug, trap, or tax holders. None of these are allowed. */
export const BANNED_EXTENSIONS: ExtensionType[] = [
  ExtensionType.TransferFeeConfig,
  ExtensionType.MintCloseAuthority,
  ExtensionType.ConfidentialTransferMint,
  ExtensionType.DefaultAccountState,
  ExtensionType.NonTransferable,
  ExtensionType.InterestBearingConfig,
  ExtensionType.PermanentDelegate,
  ExtensionType.TransferHook,
  ExtensionType.ScaledUiAmountConfig,
  ExtensionType.PausableConfig,
  ExtensionType.PermissionedBurn,
  ExtensionType.GroupPointer,
  ExtensionType.GroupMemberPointer,
];

export const ALLOWED_EXTENSIONS: ExtensionType[] = [
  ExtensionType.MetadataPointer,
  ExtensionType.TokenMetadata,
];

export interface MintSnapshot {
  mint: PublicKey;
  programId: PublicKey;
  decimals: number;
  supply: bigint;
  mintAuthority: PublicKey | null;
  freezeAuthority: PublicKey | null;
  extensions: ExtensionType[];
  pointerAuthority: PublicKey | null;
  pointerAddress: PublicKey | null;
  /** Missing means the name is locked. System Program is the on-chain "nobody" value. */
  metadataUpdateAuthority?: PublicKey | null;
  name: string;
  symbol: string;
}

function locked(authority: PublicKey | null | undefined): boolean {
  if (authority == null) return true;
  return authority.equals(PublicKey.default) || authority.equals(SystemProgram.programId);
}

/** Empty list means the coin matches the fair-launch rules. */
export function assessFairMint(state: MintSnapshot): string[] {
  const problems: string[] = [];

  if (!state.programId.equals(TOKEN_2022_PROGRAM_ID)) {
    problems.push("Coin is not a Token-2022 mint.");
  }
  if (state.decimals !== TOKEN.decimals) {
    problems.push(`Decimals are ${state.decimals}, expected ${TOKEN.decimals}.`);
  }
  if (state.supply !== rawSupply()) {
    problems.push("Supply does not match the fixed amount.");
  }
  if (state.mintAuthority !== null) {
    problems.push("Mint authority is still set. More coins can be printed.");
  }
  if (state.freezeAuthority !== null) {
    problems.push("Freeze authority is set. Wallets can be frozen.");
  }
  if (state.name !== TOKEN.name) {
    problems.push(`Name is "${state.name}", expected "${TOKEN.name}".`);
  }
  if (state.symbol !== TOKEN.symbol) {
    problems.push(`Symbol is "${state.symbol}", expected "${TOKEN.symbol}".`);
  }
  if (!locked(state.metadataUpdateAuthority)) {
    problems.push("Name can still be changed.");
  }
  if (state.pointerAuthority !== null) {
    problems.push("Metadata pointer can still be moved.");
  }
  if (state.pointerAddress === null || !state.pointerAddress.equals(state.mint)) {
    problems.push("Metadata is not stored on the coin itself.");
  }

  for (const ext of state.extensions) {
    if (BANNED_EXTENSIONS.includes(ext)) {
      problems.push(`Banned extension present: ${ExtensionType[ext]}.`);
    } else if (!ALLOWED_EXTENSIONS.includes(ext)) {
      problems.push(`Unexpected extension present: ${ExtensionType[ext]}.`);
    }
  }
  if (!state.extensions.includes(ExtensionType.MetadataPointer)) {
    problems.push("Metadata pointer is missing.");
  }
  if (!state.extensions.includes(ExtensionType.TokenMetadata)) {
    problems.push("On-chain name is missing.");
  }

  return problems;
}
