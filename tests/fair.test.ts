import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  AuthorityType,
  ExtensionType,
  TOKEN_2022_PROGRAM_ID,
  decodeInitializeMintInstruction,
  decodeMintToInstruction,
  decodeSetAuthorityInstruction,
} from "@solana/spl-token";
import { TOKEN, assertTokenConfig, rawSupply } from "../src/token.ts";
import { buildFairMintInstructions } from "../src/buildMint.ts";
import { assessFairMint, type MintSnapshot } from "../src/assess.ts";

function plan() {
  const payer = Keypair.generate();
  const mint = Keypair.generate();
  const built = buildFairMintInstructions({
    payer: payer.publicKey,
    mint: mint.publicKey,
    rentLamports: 2_000_000,
  });
  return { payer, mint, ...built };
}

function fairSnapshot(mint: PublicKey, overrides: Partial<MintSnapshot> = {}): MintSnapshot {
  return {
    mint,
    programId: TOKEN_2022_PROGRAM_ID,
    decimals: TOKEN.decimals,
    supply: rawSupply(),
    mintAuthority: null,
    freezeAuthority: null,
    extensions: [ExtensionType.MetadataPointer, ExtensionType.TokenMetadata],
    pointerAuthority: null,
    pointerAddress: mint,
    metadataUpdateAuthority: undefined,
    name: TOKEN.name,
    symbol: TOKEN.symbol,
    ...overrides,
  };
}

describe("Pinch fair mint", () => {
  it("prints exactly 1 billion coins and then locks the printer", () => {
    const { instructions, rawAmount } = plan();
    assert.equal(rawAmount, 1_000_000_000_000_000n);
    assert.equal(instructions.length, 8);

    const programs = new Set(instructions.map((ix) => ix.programId.toBase58()));
    assert.deepEqual(
      [...programs].sort(),
      [ASSOCIATED_TOKEN_PROGRAM_ID, SystemProgram.programId, TOKEN_2022_PROGRAM_ID]
        .map((key) => key.toBase58())
        .sort(),
    );
  });

  it("never sets a freeze authority", () => {
    const { instructions } = plan();
    const mintIx = instructions[2];
    const decoded = decodeInitializeMintInstruction(mintIx, TOKEN_2022_PROGRAM_ID);
    assert.equal(decoded.data.decimals, 6);
    assert.equal(decoded.data.freezeAuthority, null);
  });

  it("points metadata at the coin and leaves nobody in charge of the pointer", () => {
    const { instructions, mint } = plan();
    const data = instructions[1].data;
    assert.equal(data[0], 39);
    assert.equal(data[1], 0);
    assert.ok(data.subarray(2, 34).equals(Buffer.alloc(32)));
    assert.ok(data.subarray(34, 66).equals(mint.publicKey.toBuffer()));
  });

  it("mints the full supply in the same transaction that burns mint rights", () => {
    const { instructions, rawAmount } = plan();
    const minted = decodeMintToInstruction(instructions[5], TOKEN_2022_PROGRAM_ID);
    assert.equal(minted.data.amount, rawAmount);

    const locked = decodeSetAuthorityInstruction(instructions[6], TOKEN_2022_PROGRAM_ID);
    assert.equal(locked.data.authorityType, AuthorityType.MintTokens);
    assert.equal(locked.data.newAuthority, null);
  });

  it("clears the rename authority", () => {
    const { instructions } = plan();
    const ix = instructions[7];
    assert.ok(ix.programId.equals(TOKEN_2022_PROGRAM_ID));
    assert.equal(ix.keys[1].isSigner, true);
    const authority = new PublicKey(ix.data.subarray(ix.data.length - 32));
    assert.ok(authority.equals(SystemProgram.programId));
  });

  it("puts the name in the create transaction and fits in one Solana transaction", () => {
    const { payer, mint, instructions } = plan();
    const metadataIx = instructions[3];
    assert.ok(metadataIx.data.includes(Buffer.from("Pinch")));
    assert.ok(metadataIx.data.includes(Buffer.from("PINCH")));

    const tx = new Transaction().add(...instructions);
    tx.feePayer = payer.publicKey;
    tx.recentBlockhash = Keypair.generate().publicKey.toBase58();
    tx.sign(payer, mint);
    const size = tx.serialize().length;
    assert.ok(size <= 1232, `transaction is ${size} bytes`);
  });

  it("accepts a locked coin and rejects rug switches", () => {
    const mint = Keypair.generate().publicKey;
    assert.deepEqual(assessFairMint(fairSnapshot(mint)), []);
    assert.deepEqual(
      assessFairMint(fairSnapshot(mint, { metadataUpdateAuthority: SystemProgram.programId })),
      [],
    );

    const rug = assessFairMint(
      fairSnapshot(mint, {
        mintAuthority: Keypair.generate().publicKey,
        freezeAuthority: Keypair.generate().publicKey,
        extensions: [ExtensionType.MetadataPointer, ExtensionType.TransferFeeConfig],
        metadataUpdateAuthority: Keypair.generate().publicKey,
      }),
    );
    assert.ok(rug.some((line) => line.includes("printed")));
    assert.ok(rug.some((line) => line.includes("frozen")));
    assert.ok(rug.some((line) => line.includes("TransferFee")));
    assert.ok(rug.some((line) => line.includes("changed")));
  });

  it("rejects a name that will not fit on chain", () => {
    assert.throws(
      () => assertTokenConfig({ ...TOKEN, name: "P".repeat(33) }),
      /32/,
    );
  });
});
