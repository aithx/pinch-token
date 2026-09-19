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

const NETWORKS = {
  devnet: {
    rpc: DEVNET_RPC,
    wallet: "keys/devnet-wallet.json",
    deployment: "deployments/devnet.json",
  },
  local: {
    rpc: "http://127.0.0.1:8899",
    wallet: "keys/local-wallet.json",
    deployment: "deployments/local.json",
  },
} as const;

type NetworkName = keyof typeof NETWORKS;

function parseNetwork(): NetworkName {
  const flag = process.argv.indexOf("--network");
  const name = flag === -1 ? "devnet" : process.argv[flag + 1];
  if (name !== "devnet" && name !== "local") {
    throw new Error("Use devnet or local. The real Solana network is off because it spends money.");
  }
  return name;
}

function loadOrCreateWallet(path: string): Keypair {
  if (existsSync(path)) {
    const secret = Uint8Array.from(JSON.parse(readFileSync(path, "utf8")) as number[]);
    return Keypair.fromSecretKey(secret);
  }
  const wallet = Keypair.generate();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(Array.from(wallet.secretKey)));
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
  const network = parseNetwork();
  const paths = NETWORKS[network];
  const walletPath = join(root, paths.wallet);
  const deploymentPath = join(root, paths.deployment);

  if (existsSync(deploymentPath) && !process.argv.includes("--again")) {
    const saved = JSON.parse(readFileSync(deploymentPath, "utf8")) as { mint?: string };
    throw new Error(
      `Already created: ${saved.mint ?? deploymentPath}. Run with --again only if you want a second test coin.`,
    );
  }

  const connection = new Connection(process.env.SOLANA_RPC_URL ?? paths.rpc, "confirmed");
  const wallet = loadOrCreateWallet(walletPath);
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
        network,
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

  console.log(network === "local" ? "Pinch is on your local test chain." : "Pinch is on the free Solana test network.");
  console.log(`Coin address: ${mint.publicKey.toBase58()}`);
  console.log(`Your test wallet: ${wallet.publicKey.toBase58()}`);
  console.log(`All ${TOKEN.supply.toLocaleString("en-US")} coins are in that wallet.`);
  console.log("Nobody can print more, freeze wallets, or rename it.");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
