import { readFileSync } from "node:fs";
import { Connection, PublicKey } from "@solana/web3.js";
import {
  getExtensionTypes,
  getMetadataPointerState,
  getMint,
  getTokenMetadata,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";
import { assessFairMint, type MintSnapshot } from "./assess.js";

export const DEVNET_RPC = "https://api.devnet.solana.com";

export async function loadMintSnapshot(
  connection: Connection,
  mintAddress: PublicKey,
): Promise<MintSnapshot> {
  const accountInfo = await connection.getAccountInfo(mintAddress, "confirmed");
  if (accountInfo === null) {
    throw new Error("No coin found at that address on this network.");
  }
  const mint = await getMint(connection, mintAddress, "confirmed", accountInfo.owner);
  const pointer = getMetadataPointerState(mint);
  const metadata = await getTokenMetadata(
    connection,
    mintAddress,
    "confirmed",
    accountInfo.owner,
  );

  return {
    mint: mintAddress,
    programId: accountInfo.owner,
    decimals: mint.decimals,
    supply: mint.supply,
    mintAuthority: mint.mintAuthority,
    freezeAuthority: mint.freezeAuthority,
    extensions: getExtensionTypes(mint.tlvData),
    pointerAuthority: pointer?.authority ?? null,
    pointerAddress: pointer?.metadataAddress ?? null,
    metadataUpdateAuthority: metadata?.updateAuthority,
    name: metadata?.name ?? "",
    symbol: metadata?.symbol ?? "",
  };
}

export async function verifyMint(
  connection: Connection,
  mintAddress: PublicKey,
): Promise<string[]> {
  const snapshot = await loadMintSnapshot(connection, mintAddress);
  if (!snapshot.programId.equals(TOKEN_2022_PROGRAM_ID)) {
    return ["Coin is not a Token-2022 mint."];
  }
  return assessFairMint(snapshot);
}

function mintFromArgs(argv: string[]): string {
  const inline = argv.find((arg) => !arg.startsWith("-"));
  if (inline) return inline;
  const saved = JSON.parse(readFileSync(new URL("../deployments/devnet.json", import.meta.url), "utf8")) as {
    mint?: string;
  };
  if (!saved.mint) throw new Error("deployments/devnet.json has no mint.");
  return saved.mint;
}

async function main(): Promise<void> {
  const rpc = process.env.SOLANA_RPC_URL ?? DEVNET_RPC;
  const mint = new PublicKey(mintFromArgs(process.argv.slice(2)));
  const problems = await verifyMint(new Connection(rpc, "confirmed"), mint);
  if (problems.length > 0) {
    console.error(`${mint.toBase58()} is not a fair Pinch coin:`);
    for (const problem of problems) console.error(`- ${problem}`);
    process.exitCode = 1;
    return;
  }
  console.log(`${mint.toBase58()} checks out. Fixed supply, no freeze, name locked.`);
}

const isDirectRun = process.argv[1]?.endsWith("verify.ts") || process.argv[1]?.endsWith("verify.js");
if (isDirectRun) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
