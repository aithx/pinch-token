import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  Connection,
  Keypair,
  sendAndConfirmTransaction,
  Transaction,
} from "@solana/web3.js";
import { TOKEN } from "./token.js";
import { buildFairMintInstructions, rentExemptBytes } from "./buildMint.js";
import { verifyMint, DEVNET_RPC } from "./verify.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const walletPath = join(root, "keys", "devnet-wallet.json");
const deploymentPath = join(root, "deployments", "devnet.json");

function loadOrCreateWallet(): Keypair {
  if (existsSync(walletPath)) {
    const secret = Uint8Array.from(JSON.parse(readFileSync(walletPath, "utf8")) as number[]);
    return Keypair.fromSecretKey(secret);
  }
  const wallet = Keypair.generate();
  mkdirSync(dirname(walletPath), { recursive: true });
  writeFileSync(walletPath, JSON.stringify(Array.from(wallet.secretKey)));
  return wallet;
}

async function ensureDevnetSol(connection: Connection, wallet: Keypair): Promise<void> {
  const needed = 50_000_000;
  const balance = await connection.getBalance(wallet.publicKey, "confirmed");
  if (balance >= needed) return;

  let lastError = "airdrop failed";
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const sig = await connection.requestAirdrop(wallet.publicKey, 1_000_000_000);
      const latest = await connection.getLatestBlockhash("confirmed");
      await connection.confirmTransaction(
        { signature: sig, ...latest },
        "confirmed",
      );
      return;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
  throw new Error(
    `Test SOL airdrop failed (${lastError}). Wait a minute and run npm run create again. No real money was spent.`,
  );
}

async function main(): Promise<void> {
  const network = process.argv.includes("--network")
    ? process.argv[process.argv.indexOf("--network") + 1]
    : "devnet";

  if (network !== "devnet") {
    throw new Error(
      "Only the free test network is turned on. Real Solana spends money and is not part of this command.",
    );
  }
  if (existsSync(deploymentPath) && !process.argv.includes("--again")) {
    const saved = JSON.parse(readFileSync(deploymentPath, "utf8")) as { mint?: string };
    throw new Error(
      `Already created: ${saved.mint ?? "(see deployments/devnet.json)"}. Run with --again only if you want a second test coin.`,
    );
  }

  const connection = new Connection(process.env.SOLANA_RPC_URL ?? DEVNET_RPC, "confirmed");
  const wallet = loadOrCreateWallet();
  await ensureDevnetSol(connection, wallet);

  const mint = Keypair.generate();
  const rent = await connection.getMinimumBalanceForRentExemption(rentExemptBytes(mint.publicKey));
  const plan = buildFairMintInstructions({
    payer: wallet.publicKey,
    mint: mint.publicKey,
    rentLamports: rent,
  });

  const tx = new Transaction().add(...plan.instructions);
  const signature = await sendAndConfirmTransaction(connection, tx, [wallet, mint], {
    commitment: "confirmed",
  });

  const problems = await verifyMint(connection, mint.publicKey);
  if (problems.length > 0) {
    throw new Error(`Created ${mint.publicKey.toBase58()} but it failed the fair check:\n- ${problems.join("\n- ")}`);
  }

  mkdirSync(dirname(deploymentPath), { recursive: true });
  writeFileSync(
    deploymentPath,
    JSON.stringify(
      {
        network: "devnet",
        mint: mint.publicKey.toBase58(),
        name: TOKEN.name,
        symbol: TOKEN.symbol,
        decimals: TOKEN.decimals,
        supply: TOKEN.supply.toString(),
        holder: wallet.publicKey.toBase58(),
        signature,
        mintAuthority: null,
        freezeAuthority: null,
        metadataUpdateAuthority: null,
        metadataPointerAuthority: null,
      },
      null,
      2,
    ) + "\n",
  );

  console.log(`Pinch is on the test network.`);
  console.log(`Coin address: ${mint.publicKey.toBase58()}`);
  console.log(`Your test wallet: ${wallet.publicKey.toBase58()}`);
  console.log(`All ${TOKEN.supply.toLocaleString("en-US")} coins are in that wallet.`);
  console.log("Nobody can print more, freeze wallets, or rename it.");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
