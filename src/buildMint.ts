import {
  PublicKey,
  SystemProgram,
  type TransactionInstruction,
} from "@solana/web3.js";
import {
  AuthorityType,
  ExtensionType,
  LENGTH_SIZE,
  TOKEN_2022_PROGRAM_ID,
  TYPE_SIZE,
  createAssociatedTokenAccountInstruction,
  createInitializeMetadataPointerInstruction,
  createInitializeMintInstruction,
  createMintToInstruction,
  createSetAuthorityInstruction,
  getAssociatedTokenAddressSync,
  getMintLen,
} from "@solana/spl-token";
import {
  createInitializeInstruction,
  createUpdateAuthorityInstruction,
  pack,
  type TokenMetadata,
} from "@solana/spl-token-metadata";
import { TOKEN, assertTokenConfig, rawSupply } from "./token.js";

/** Bytes the mint account is created with (pointer only). Metadata is added after. */
export function mintAccountSpace(): number {
  return getMintLen([ExtensionType.MetadataPointer]);
}

/**
 * Rent must cover the metadata that gets written into the same account.
 * The extra bytes are not in the create-account size; the lamports are.
 */
export function rentExemptBytes(mint: PublicKey): number {
  const metadata: TokenMetadata = {
    updateAuthority: PublicKey.default,
    mint,
    name: TOKEN.name,
    symbol: TOKEN.symbol,
    uri: TOKEN.uri,
    additionalMetadata: [],
  };
  return mintAccountSpace() + TYPE_SIZE + LENGTH_SIZE + pack(metadata).length;
}

export interface FairMintPlan {
  instructions: TransactionInstruction[];
  holderTokenAccount: PublicKey;
  rawAmount: bigint;
}

/**
 * One transaction:
 * create the coin, print the full supply to the payer, then burn mint and rename rights.
 * Freeze is never turned on. No fee, no blocklist, no pause.
 */
export function buildFairMintInstructions(args: {
  payer: PublicKey;
  mint: PublicKey;
  rentLamports: number;
}): FairMintPlan {
  assertTokenConfig();
  const { payer, mint, rentLamports } = args;
  if (!Number.isSafeInteger(rentLamports) || rentLamports <= 0) {
    throw new Error("Rent must be a positive number of lamports.");
  }

  const holderTokenAccount = getAssociatedTokenAddressSync(
    mint,
    payer,
    false,
    TOKEN_2022_PROGRAM_ID,
  );
  const rawAmount = rawSupply();

  const instructions: TransactionInstruction[] = [
    SystemProgram.createAccount({
      fromPubkey: payer,
      newAccountPubkey: mint,
      space: mintAccountSpace(),
      lamports: rentLamports,
      programId: TOKEN_2022_PROGRAM_ID,
    }),
    createInitializeMetadataPointerInstruction(
      mint,
      null,
      mint,
      TOKEN_2022_PROGRAM_ID,
    ),
    createInitializeMintInstruction(
      mint,
      TOKEN.decimals,
      payer,
      null,
      TOKEN_2022_PROGRAM_ID,
    ),
    createInitializeInstruction({
      programId: TOKEN_2022_PROGRAM_ID,
      metadata: mint,
      updateAuthority: payer,
      mint,
      mintAuthority: payer,
      name: TOKEN.name,
      symbol: TOKEN.symbol,
      uri: TOKEN.uri,
    }),
    createAssociatedTokenAccountInstruction(
      payer,
      holderTokenAccount,
      payer,
      mint,
      TOKEN_2022_PROGRAM_ID,
    ),
    createMintToInstruction(
      mint,
      holderTokenAccount,
      payer,
      rawAmount,
      [],
      TOKEN_2022_PROGRAM_ID,
    ),
    createSetAuthorityInstruction(
      mint,
      payer,
      AuthorityType.MintTokens,
      null,
      [],
      TOKEN_2022_PROGRAM_ID,
    ),
    createUpdateAuthorityInstruction({
      programId: TOKEN_2022_PROGRAM_ID,
      metadata: mint,
      oldAuthority: payer,
      newAuthority: null,
    }),
  ];

  return { instructions, holderTokenAccount, rawAmount };
}
